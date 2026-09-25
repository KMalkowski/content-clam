import { decide, serialQueue, type Settings } from "@content-clam/shared";
import { cacheItem, hiddenShortsItem, readSettings, type CachedClassification } from "./storage";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface HiddenCounts {
  byCategory: Record<string, number>;
  categoryVideos: number;
  shorts: number;
}

export function hiddenCountsByCategory(cache: Record<string, CachedClassification>, settings: Settings, now = Date.now()) {
  const byCategory: Record<string, number> = {};
  let videos = 0;
  const allIds = settings.categories.map((c) => c.id);
  for (const entry of Object.values(cache)) {
    if (now - entry.analyzedAt > WEEK_MS) continue;
    const decision = decide(entry.result, allIds);
    if (!decision.dimmed) continue;
    videos++;
    for (const id of decision.matchedCategoryIds) byCategory[id] = (byCategory[id] ?? 0) + 1;
  }
  return { byCategory, videos };
}

export function withHiddenShorts(seen: Record<string, number>, videoIds: string[], now = Date.now()): Record<string, number> {
  const recent = Object.fromEntries(Object.entries(seen).filter(([, at]) => now - at <= WEEK_MS));
  for (const id of videoIds) recent[id] ??= now;
  return recent;
}

export function countRecent(seen: Record<string, number>, now = Date.now()): number {
  return Object.values(seen).filter((at) => now - at <= WEEK_MS).length;
}

export async function hiddenCounts(): Promise<HiddenCounts> {
  const [cache, settings, shorts] = await Promise.all([cacheItem.getValue(), readSettings(), hiddenShortsItem.getValue()]);
  const { byCategory, videos } = hiddenCountsByCategory(cache, settings);
  return { byCategory, categoryVideos: videos, shorts: countRecent(shorts) };
}

const shortsWrites = serialQueue();

export function recordHiddenShorts(videoIds: string[]): Promise<void> {
  return shortsWrites(async () => {
    await hiddenShortsItem.setValue(withHiddenShorts(await hiddenShortsItem.getValue(), videoIds));
  });
}
