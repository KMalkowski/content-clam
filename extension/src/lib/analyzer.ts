import {
  CACHE_TTL_MS,
  channelKeyOf,
  classify,
  createFetchJevCaller,
  decide,
  enabledCategories,
  isChannelAllowed,
  metadataFingerprint,
  withBackoff,
  type ClassificationResult,
  type Settings,
  type VideoMetadata,
} from "@content-clam/shared";
import { cacheItem, fundingModeItem, personalKeyItem, pendingOperationsItem, settingsItem, type CachedClassification } from "./storage";
import { categoryPayload, reasonsFor, rulesHash } from "./rules";
import type { AnalysisOutcome } from "./messages";
import { hostedAnalyze } from "./hosted";

type Scores = Pick<ClassificationResult, "categoryScores" | "topicScores">;

const inFlight = new Map<string, Promise<AnalysisOutcome>>();

export async function analyzeVideos(videos: VideoMetadata[]): Promise<AnalysisOutcome[]> {
  const settings = await settingsItem.getValue();
  const hashNow = rulesHash(settings);
  const cache = await cacheItem.getValue();
  const enabledIds = enabledCategories(settings).map((c) => c.id);

  return Promise.all(
    videos.map(async (video) => {
      if (settings.paused) return visible(video.videoId);
      if (isChannelAllowed(settings, channelKeyOf(video))) return visible(video.videoId);
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
      scores = await analyzeWithPersonalKey(video, settings);
    } else if (mode === "hosted") {
      scores = await analyzeHosted(video, settings, hashNow);
    } else {
      return { videoId: video.videoId, decision: null, reasons: [], error: "Choose how to pay for analyses in the popup." };
    }
    await storeResult(video.videoId, { fingerprint, rulesHash: hashNow, result: scores, analyzedAt: Date.now() });
    return outcome(video.videoId, scores, settings, enabledIds);
  } catch (error) {
    return { videoId: video.videoId, decision: null, reasons: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function analyzeWithPersonalKey(video: VideoMetadata, settings: Settings): Promise<Scores> {
  const key = await personalKeyItem.getValue();
  if (!key) throw new Error("Add your TypeSafe API key in settings.");
  const call = createFetchJevCaller(key);
  return classify(video, enabledCategories(settings), settings.allowedTopics, (req) => withBackoff(() => call(req)));
}

async function analyzeHosted(video: VideoMetadata, settings: Settings, hashNow: string): Promise<Scores> {
  const operationId = await operationIdFor(video.videoId, hashNow);
  try {
    const response = await hostedAnalyze({
      operationId,
      metadata: video,
      categories: categoryPayload(enabledCategories(settings)),
      topics: settings.allowedTopics.map(({ id, description }) => ({ id, description })),
    });
    if (!response.ok) throw new Error(response.message);
    await clearOperation(video.videoId);
    return response.result;
  } catch (error) {
    if (error instanceof Error && /expired/i.test(error.message)) await clearOperation(video.videoId);
    throw error;
  }
}

async function operationIdFor(videoId: string, hashNow: string): Promise<string> {
  const pending = await pendingOperationsItem.getValue();
  const existing = pending[`${videoId}:${hashNow}`];
  if (existing && Date.now() - existing.createdAt < 10 * 60 * 1000) return existing.operationId;
  const operationId = crypto.randomUUID();
  pending[`${videoId}:${hashNow}`] = { operationId, videoId, createdAt: Date.now() };
  await pendingOperationsItem.setValue(pending);
  return operationId;
}

async function clearOperation(videoId: string) {
  const pending = await pendingOperationsItem.getValue();
  for (const key of Object.keys(pending)) if (key.startsWith(`${videoId}:`)) delete pending[key];
  await pendingOperationsItem.setValue(pending);
}

async function storeResult(videoId: string, entry: CachedClassification) {
  const cache = await cacheItem.getValue();
  cache[videoId] = entry;
  pruneCache(cache);
  await cacheItem.setValue(cache);
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

function visible(videoId: string): AnalysisOutcome {
  return { videoId, decision: { dimmed: false, matchedCategoryIds: [], allowedByTopicIds: [] }, reasons: [] };
}
