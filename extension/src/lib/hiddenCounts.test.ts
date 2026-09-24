import { describe, expect, it } from "vitest";
import { defaultSettings } from "@content-clam/shared";
import { hiddenCountsByCategory, WEEK_MS } from "./hiddenCounts";
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
    expect(counts).toEqual({ [a]: 2, [b]: 1 });
  });
});
