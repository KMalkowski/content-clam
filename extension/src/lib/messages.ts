import type { Decision, Settings, VideoMetadata } from "@content-clam/shared";
import type { HiddenCounts } from "./hiddenCounts";
import type { SettingsChange } from "./settings";
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
  | { type: "changeSettings"; change: SettingsChange }
  | { type: "getStatus" }
  | { type: "getHiddenCounts" }
  | { type: "setFundingMode"; mode: FundingMode }
  | { type: "setPersonalKey"; key: string | null }
  | { type: "revealVideo"; videoId: string }
  | { type: "recordHiddenShorts"; videoIds: string[] }
  | { type: "recordSubscriptions"; channelKeys: string[] }
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
  syncChoice: "asked" | "unasked";
  syncError?: string;
}

export type BackgroundResponse =
  | { type: "analysis"; outcomes: AnalysisOutcome[] }
  | { type: "settings"; settings: Settings }
  | { type: "status"; status: Status }
  | { type: "hiddenCounts"; counts: HiddenCounts }
  | { type: "ok" }
  | { type: "error"; message: string };

export async function sendToBackground(request: BackgroundRequest): Promise<BackgroundResponse> {
  const response: BackgroundResponse = await chrome.runtime.sendMessage(request);
  if (response.type === "error") throw new Error(response.message);
  return response;
}
