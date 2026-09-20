import type { Decision, Settings, VideoMetadata } from "@content-clam/shared";
import type { FundingMode } from "./storage";

export interface AnalysisOutcome {
  videoId: string;
  decision: Decision | null;
  reasons: string[];
  error?: string;
}

export type BackgroundRequest =
  | { type: "analyze"; videos: VideoMetadata[] }
  | { type: "getSettings" }
  | { type: "updateSettings"; settings: Settings }
  | { type: "getStatus" }
  | { type: "setFundingMode"; mode: FundingMode }
  | { type: "setPersonalKey"; key: string | null }
  | { type: "revealVideo"; videoId: string }
  | { type: "syncFromServer" }
  | { type: "pushSettingsToServer" }
  | { type: "openSignIn" }
  | { type: "openOptions" };

export interface Status {
  fundingMode: FundingMode;
  hasPersonalKey: boolean;
  hostedAvailable: boolean;
  signedIn: boolean;
  email?: string;
  balance?: number;
  lastError?: string;
}

export type BackgroundResponse =
  | { type: "analysis"; outcomes: AnalysisOutcome[] }
  | { type: "settings"; settings: Settings }
  | { type: "status"; status: Status }
  | { type: "ok" }
  | { type: "error"; message: string };

export function sendToBackground(request: BackgroundRequest): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(request);
}
