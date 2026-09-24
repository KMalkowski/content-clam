import type { VideoMetadata } from "./metadata";
import type { ClassificationResult } from "./classify";

export interface HostedAnalyzeRequest {
  operationId: string;
  metadata: VideoMetadata;
  categories: { id: string; name: string; description: string }[];
  topics: { id: string; description: string }[];
}

export type HostedAnalyzeResponse =
  | { ok: true; result: ClassificationResult; balance: number }
  | { ok: false; code: HostedErrorCode; message: string; balance?: number };

export type HostedErrorCode =
  | "unauthenticated"
  | "no_credits"
  | "rate_limited"
  | "expired_operation"
  | "in_progress"
  | "provider_error"
  | "invalid_request";

export function canonicalAnalyzeRequest(request: HostedAnalyzeRequest): string {
  const m = request.metadata;
  return JSON.stringify({
    operationId: request.operationId,
    metadata: {
      videoId: m.videoId,
      title: m.title,
      channelName: m.channelName ?? null,
      channelHandle: m.channelHandle ?? null,
      description: m.description ?? null,
      durationText: m.durationText ?? null,
      viewsText: m.viewsText ?? null,
      publishedText: m.publishedText ?? null,
      badges: m.badges ?? [],
      isShort: m.isShort,
    },
    categories: request.categories.map(({ id, name, description }) => ({ id, name, description })),
    topics: request.topics.map(({ id, description }) => ({ id, description })),
  });
}
