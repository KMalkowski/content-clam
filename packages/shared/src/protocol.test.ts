import { describe, expect, it } from "vitest";
import { canonicalAnalyzeRequest, type HostedAnalyzeRequest } from "./protocol";

const base: HostedAnalyzeRequest = {
  operationId: "1000.abcdefgh",
  metadata: { videoId: "v1", title: "Title", channelName: "Chan", viewsText: "1K views", publishedText: "1 day ago", isShort: false },
  categories: [{ id: "c1", name: "Clickbait", description: "Bait" }],
  topics: [{ id: "t1", description: "Cooking" }],
};

describe("canonicalAnalyzeRequest", () => {
  it("covers every field sent to the provider", () => {
    const a = canonicalAnalyzeRequest(base);
    expect(canonicalAnalyzeRequest({ ...base, metadata: { ...base.metadata, viewsText: "2K views" } })).not.toBe(a);
    expect(canonicalAnalyzeRequest({ ...base, metadata: { ...base.metadata, publishedText: "2 days ago" } })).not.toBe(a);
    expect(canonicalAnalyzeRequest({ ...base, operationId: "1000.zzzzzzzz" })).not.toBe(a);
    expect(canonicalAnalyzeRequest({ ...base, topics: [] })).not.toBe(a);
  });

  it("does not collide when field boundaries move", () => {
    const a = canonicalAnalyzeRequest({ ...base, metadata: { ...base.metadata, title: "A\u0000B", channelName: "C" } });
    const b = canonicalAnalyzeRequest({ ...base, metadata: { ...base.metadata, title: "A", channelName: "B\u0000C" } });
    expect(a).not.toBe(b);
  });

  it("treats missing and undefined optional fields alike and ignores extra keys", () => {
    const withUndefined = { ...base, metadata: { ...base.metadata, description: undefined } };
    const withExtra = { ...base, metadata: { ...base.metadata, extra: "x" } } as unknown as HostedAnalyzeRequest;
    expect(canonicalAnalyzeRequest(withUndefined)).toBe(canonicalAnalyzeRequest(base));
    expect(canonicalAnalyzeRequest(withExtra)).toBe(canonicalAnalyzeRequest(base));
  });
});
