import { storage } from "wxt/utils/storage";
import { defaultSettings, type Settings, type ClassificationResult } from "@content-clam/shared";

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
}

export const settingsItem = storage.defineItem<Settings>("local:settings", {
  fallback: defaultSettings(),
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
});

export const syncChoiceItem = storage.defineItem<"asked" | "unasked">("local:syncChoice", {
  fallback: "unasked",
});

export const revealedItem = storage.defineItem<Record<string, number>>("session:revealed", {
  fallback: {},
});

export const lastErrorItem = storage.defineItem<string | null>("session:lastError", {
  fallback: null,
});
