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
  | "provider_error"
  | "invalid_request";
