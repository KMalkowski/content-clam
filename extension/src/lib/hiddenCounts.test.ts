import { describe, expect, it } from "vitest";
import { defaultSettings } from "@content-clam/shared";
import { countRecent, hiddenCountsByCategory, WEEK_MS, withHiddenShorts } from "./hiddenCounts";
import type { CachedClassification } from "./storage";

const settings = defaultSettings(0);
const a = settings.categories[0]!.id;
const b = settings.categories[1]!.id;

function entry(scores: Record<string, number>, analyzedAt: number, topicScores: Record<string, number> = {}): CachedClassification {
  return { fingerprint: "f", rulesHash: "r", analyzedAt, result: { categoryScores: scores, topicScores } };
}

describe("hiddenCountsByCategory", () => {
  it("counts dimmed videos per matched category within the last week", () => {
    const now = WEEK_MS * 2;
    const counts = hiddenCountsByCategory(
      {
        v1: entry({ [a]: 0.9 }, now - 1000),
        v2: entry({ [a]: 0.95, [b]: 0.85 }, now - 2000),
        v3: entry({ [a]: 0.9 }, now - WEEK_MS - 1),
        v4: entry({ [a]: 0.5 }, now),
        v5: entry({ [a]: 0.9 }, now, { t: 0.9 }),
      },
      settings,
      now,
    );
    expect(counts).toEqual({ byCategory: { [a]: 2, [b]: 1 }, videos: 2 });
  });
});

describe("hidden Shorts", () => {
  it("counts each Short once and forgets ones older than a week", () => {
    const now = WEEK_MS * 2;
    const seen = withHiddenShorts({ old: now - WEEK_MS - 1, kept: now - 1000 }, ["kept", "new", "new"], now);
    expect(seen).toEqual({ kept: now - 1000, new: now });
    expect(countRecent(seen, now + WEEK_MS - 500)).toBe(1);
  });
});
