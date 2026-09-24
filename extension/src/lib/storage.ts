import { storage } from "wxt/utils/storage";
import { defaultSettings, sanitizeSettings, type HostedAnalyzeRequest, type Settings, type ClassificationResult } from "@content-clam/shared";

export type FundingMode = "none" | "personal-key" | "hosted";

export interface CachedClassification {
  fingerprint: string;
  rulesHash: string;
  result: Pick<ClassificationResult, "categoryScores" | "topicScores">;
  analyzedAt: number;
}

export interface PendingOperation {
  operationId: string;
  videoId: string;
  createdAt: number;
  request: HostedAnalyzeRequest;
  status: "pending" | "expired";
}

export interface SyncAccount {
  baseline: Settings;
  error?: string;
  failures?: number;
}

export const settingsItem = storage.defineItem<Settings>("local:settings", {
  fallback: defaultSettings(),
  version: 3,
  migrations: {
    2: (old: Omit<Settings, "hideShorts" | "keepSubscribed">) => ({ ...old, hideShorts: false }),
    3: (old: Omit<Settings, "keepSubscribed">) => ({ ...old, keepSubscribed: true }),
  },
});

export const fundingModeItem = storage.defineItem<FundingMode>("local:fundingMode", {
  fallback: "none",
});

export const personalKeyItem = storage.defineItem<string | null>("local:personalKey", {
  fallback: null,
});

export const cacheItem = storage.defineItem<Record<string, CachedClassification>>("local:classificationCache", {
  fallback: {},
});

export const pendingOperationsItem = storage.defineItem<Record<string, PendingOperation>>("local:pendingOperations", {
  fallback: {},
  version: 2,
  migrations: {
    2: () => ({}),
  },
});

export const subscribedChannelsItem = storage.defineItem<Record<string, number>>("local:subscribedChannels", {
  fallback: {},
});

export const syncAccountsItem = storage.defineItem<Record<string, SyncAccount>>("local:syncAccounts", {
  fallback: {},
});

export async function readSettings(): Promise<Settings> {
  return sanitizeSettings(await settingsItem.getValue()) ?? defaultSettings();
}

export const revealedItem = storage.defineItem<Record<string, number>>("session:revealed", {
  fallback: {},
});

export const lastErrorItem = storage.defineItem<string | null>("session:lastError", {
  fallback: null,
});
