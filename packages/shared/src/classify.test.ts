import { describe, expect, it } from "vitest";
import { batchQuestions, buildQuestions, classify, decide, IncompleteClassification } from "./classify";
import type { JevCaller } from "./jev";
import { defaultSettings } from "./settings";
import type { VideoMetadata } from "./metadata";

const meta: VideoMetadata = { videoId: "abc", title: "You WON'T believe this", isShort: false };

describe("buildQuestions", () => {
  it("creates one noul question per category and topic", () => {
    const settings = defaultSettings();
    const questions = buildQuestions(settings.categories, [
      { id: "t1", description: "woodworking", updatedAt: 0 },
    ]);
    expect(questions).toHaveLength(7);
    expect(questions.filter((q) => q.kind === "topic")).toHaveLength(1);
    expect(new Set(questions.map((q) => q.key)).size).toBe(7);
  });
});

describe("batchQuestions", () => {
  it("splits by count and by characters", () => {
    const questions = Array.from({ length: 7 }, (_, i) => ({
      key: `k${i}`,
      kind: "category" as const,
      ruleId: `r${i}`,
      question: { type: "noul" as const, instructions: "x".repeat(100) },
    }));
    expect(batchQuestions(questions, 3, 10_000).map((b) => b.length)).toEqual([3, 3, 1]);
    expect(batchQuestions(questions, 100, 250).map((b) => b.length)).toEqual([2, 2, 2, 1]);
  });
});

describe("classify", () => {
  it("merges answers across batches by rule id", async () => {
    const settings = defaultSettings();
    const calls: number[] = [];
    const caller: JevCaller = async (req) => {
      const keys = Object.keys(req.questions);
      calls.push(keys.length);
      return {
        model: "jev-1.13.0",
        usage: { input_tokens: 10, output_tokens: 0 },
        answers: Object.fromEntries(keys.map((k) => [k, { type: "noul", noul: k === "c_clickbait" ? 0.95 : 0.1 }])),
      };
    };
    const result = await classify(meta, settings.categories, [], caller);
    expect(result.categoryScores.clickbait).toBe(0.95);
    expect(Object.keys(result.categoryScores)).toHaveLength(6);
    expect(result.inputTokens).toBe(10 * calls.length);
  });

  it("fails loudly when an answer is missing", async () => {
    const settings = defaultSettings();
    const caller: JevCaller = async () => ({
      model: "jev-1.13.0",
      usage: { input_tokens: 1, output_tokens: 0 },
      answers: {},
    });
    await expect(classify(meta, settings.categories, [], caller)).rejects.toBeInstanceOf(IncompleteClassification);
  });
});

describe("decide", () => {
  it("dims on a confident category match", () => {
    const d = decide({ categoryScores: { clickbait: 0.9, gossip: 0.2 }, topicScores: {} }, ["clickbait", "gossip"]);
    expect(d.dimmed).toBe(true);
    expect(d.matchedCategoryIds).toEqual(["clickbait"]);
  });

  it("ignores matches for disabled categories", () => {
    const d = decide({ categoryScores: { clickbait: 0.9 }, topicScores: {} }, []);
    expect(d.dimmed).toBe(false);
  });

  it("lets an allowed topic override every category", () => {
    const d = decide({ categoryScores: { clickbait: 0.99 }, topicScores: { t1: 0.8 } }, ["clickbait"]);
    expect(d.dimmed).toBe(false);
    expect(d.allowedByTopicIds).toEqual(["t1"]);
  });
});
