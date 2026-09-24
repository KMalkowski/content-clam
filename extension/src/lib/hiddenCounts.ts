import { decide, type Settings } from "@content-clam/shared";
import type { CachedClassification } from "./storage";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function hiddenCountsByCategory(cache: Record<string, CachedClassification>, settings: Settings, now = Date.now()): Record<string, number> {
  const counts: Record<string, number> = {};
  const allIds = settings.categories.map((c) => c.id);
  for (const entry of Object.values(cache)) {
    if (now - entry.analyzedAt > WEEK_MS) continue;
    const decision = decide(entry.result, allIds);
    if (!decision.dimmed) continue;
    for (const id of decision.matchedCategoryIds) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
