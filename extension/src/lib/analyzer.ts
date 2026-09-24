import {
  CACHE_TTL_MS,
  channelKeyOf,
  classify,
  createFetchJevCaller,
  decide,
  enabledCategories,
  isChannelAllowed,
  isOperationExpired,
  metadataFingerprint,
  newOperationId,
  normalizeChannelKey,
  serialQueue,
  withBackoff,
  type ClassificationResult,
  type HostedAnalyzeRequest,
  type Settings,
  type VideoMetadata,
} from "@content-clam/shared";
import { cacheItem, fundingModeItem, lastErrorItem, personalKeyItem, pendingOperationsItem, readSettings, type CachedClassification, type PendingOperation } from "./storage";
import { categoryPayload, reasonsFor, rulesHash } from "./rules";
import type { AnalysisOutcome } from "./messages";
import { hostedAnalyze } from "./hosted";
import { subscribedChannelKeys } from "./subscriptions";

type Scores = Pick<ClassificationResult, "categoryScores" | "topicScores">;

const inFlight = new Map<string, Promise<AnalysisOutcome>>();
const cacheWrites = serialQueue();
const pendingWrites = serialQueue();

export async function analyzeVideos(videos: VideoMetadata[]): Promise<AnalysisOutcome[]> {
  const settings = await readSettings();
  const hashNow = rulesHash(settings);
  const cache = await cacheItem.getValue();
  const enabledIds = enabledCategories(settings).map((c) => c.id);
  const subscribed = settings.keepSubscribed ? await subscribedChannelKeys() : new Set<string>();

  return Promise.all(
    videos.map(async (video) => {
      if (settings.paused) return visible(video.videoId);
      if (isChannelAllowed(settings, channelKeyOf(video))) return visible(video.videoId);
      if (isSubscribed(subscribed, video)) return visible(video.videoId);
      if (enabledIds.length === 0) return visible(video.videoId);

      const fingerprint = metadataFingerprint(video);
      const cached = cache[video.videoId];
      if (cached && cached.fingerprint === fingerprint && cached.rulesHash === hashNow && Date.now() - cached.analyzedAt < CACHE_TTL_MS) {
        return outcome(video.videoId, cached.result, settings, enabledIds);
      }
      const key = `${video.videoId}:${hashNow}`;
      let job = inFlight.get(key);
      if (!job) {
        job = runAnalysis(video, settings, fingerprint, hashNow, enabledIds).finally(() => inFlight.delete(key));
        inFlight.set(key, job);
      }
      return job;
    }),
  );
}

async function runAnalysis(
  video: VideoMetadata,
  settings: Settings,
  fingerprint: string,
  hashNow: string,
  enabledIds: string[],
): Promise<AnalysisOutcome> {
  const mode = await fundingModeItem.getValue();
  try {
    let scores: Scores;
    if (mode === "personal-key") {
      scores = await analyzeWithPersonalKey();
    } else if (mode === "hosted") {
      scores = await analyzeHosted();
    } else {
      return { videoId: video.videoId, decision: null, reasons: [], error: "Choose how to pay for analyses in the popup." };
    }
    await lastErrorItem.setValue(null);
    return outcome(video.videoId, scores, settings, enabledIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await lastErrorItem.setValue(message);
    return { videoId: video.videoId, decision: null, reasons: [], error: message };
  }

  async function analyzeWithPersonalKey(): Promise<Scores> {
    const key = await personalKeyItem.getValue();
    if (!key) throw new Error("Add your TypeSafe API key in settings.");
    const call = createFetchJevCaller(key);
    const scores = await classify(video, enabledCategories(settings), settings.allowedTopics, (req) => withBackoff(() => call(req)));
    await storeResult(video.videoId, { fingerprint, rulesHash: hashNow, result: scores, analyzedAt: Date.now() });
    return scores;
  }

  async function analyzeHosted(): Promise<Scores> {
    const pendingKey = `${video.videoId}:${hashNow}`;
    const operation = await operationFor(pendingKey, () => ({
      operationId: newOperationId(),
      metadata: video,
      categories: categoryPayload(enabledCategories(settings)),
      topics: settings.allowedTopics.map(({ id, description }) => ({ id, description })),
    }));
    const response = await hostedAnalyze(operation.request);
    if (!response.ok) {
      if (response.code === "expired_operation") await markExpired(pendingKey);
      if (response.code === "invalid_request") await clearOperation(pendingKey);
      throw new Error(response.message);
    }
    await storeResult(video.videoId, { fingerprint, rulesHash: hashNow, result: response.result, analyzedAt: Date.now() });
    await clearOperation(pendingKey);
    return response.result;
  }
}

const EXPIRED_MESSAGE = "An earlier analysis request for this video expired before it finished. It will not be retried automatically.";

async function operationFor(pendingKey: string, build: () => HostedAnalyzeRequest): Promise<PendingOperation> {
  return pendingWrites(async () => {
    const pending = { ...(await pendingOperationsItem.getValue()) };
    prunePending(pending);
    const existing = pending[pendingKey];
    if (existing?.status === "expired") throw new Error(EXPIRED_MESSAGE);
    if (existing && !isOperationExpired(existing.operationId)) return existing;
    if (existing) {
      pending[pendingKey] = { ...existing, status: "expired" };
      await pendingOperationsItem.setValue(pending);
      throw new Error(EXPIRED_MESSAGE);
    }
    const request = build();
    const operation: PendingOperation = { operationId: request.operationId, videoId: request.metadata.videoId, createdAt: Date.now(), request, status: "pending" };
    pending[pendingKey] = operation;
    await pendingOperationsItem.setValue(pending);
    return operation;
  });
}

async function markExpired(pendingKey: string) {
  await pendingWrites(async () => {
    const pending = { ...(await pendingOperationsItem.getValue()) };
    const existing = pending[pendingKey];
    if (!existing) return;
    pending[pendingKey] = { ...existing, status: "expired" };
    await pendingOperationsItem.setValue(pending);
  });
}

async function clearOperation(pendingKey: string) {
  await pendingWrites(async () => {
    const pending = { ...(await pendingOperationsItem.getValue()) };
    if (!(pendingKey in pending)) return;
    delete pending[pendingKey];
    await pendingOperationsItem.setValue(pending);
  });
}

function prunePending(pending: Record<string, PendingOperation>) {
  const now = Date.now();
  for (const [key, entry] of Object.entries(pending)) if (now - entry.createdAt > CACHE_TTL_MS) delete pending[key];
}

async function storeResult(videoId: string, entry: CachedClassification) {
  await cacheWrites(async () => {
    const cache = { ...(await cacheItem.getValue()) };
    cache[videoId] = entry;
    pruneCache(cache);
    await cacheItem.setValue(cache);
  });
}

function pruneCache(cache: Record<string, CachedClassification>) {
  const now = Date.now();
  const entries = Object.entries(cache);
  for (const [id, entry] of entries) if (now - entry.analyzedAt > CACHE_TTL_MS) delete cache[id];
  const remaining = Object.entries(cache);
  if (remaining.length > 5000) {
    remaining.sort((a, b) => a[1].analyzedAt - b[1].analyzedAt);
    for (const [id] of remaining.slice(0, remaining.length - 5000)) delete cache[id];
  }
}

function outcome(videoId: string, scores: Scores, settings: Settings, enabledIds: string[]): AnalysisOutcome {
  const decision = decide(scores, enabledIds);
  return { videoId, decision, reasons: reasonsFor(decision, settings) };
}

function isSubscribed(subscribed: Set<string>, video: VideoMetadata): boolean {
  return [video.channelHandle, video.channelName].some((key) => key && subscribed.has(normalizeChannelKey(key)));
}

function visible(videoId: string): AnalysisOutcome {
  return { videoId, decision: { dimmed: false, matchedCategoryIds: [], allowedByTopicIds: [] }, reasons: [] };
}
