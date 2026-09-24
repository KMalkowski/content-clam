import { describe, expect, it } from "vitest";
import { requestHash } from "./analyze";
import type { HostedAnalyzeRequest } from "@content-clam/shared";

const base: HostedAnalyzeRequest = {
  operationId: "1000.abcdefgh",
  metadata: { videoId: "v1", title: "Title", channelName: "Chan", viewsText: "1K views", publishedText: "1 day ago", isShort: false },
  categories: [{ id: "c1", name: "Clickbait", description: "Bait" }],
  topics: [],
};

describe("requestHash", () => {
  it("changes when any provider input changes", async () => {
    const a = await requestHash(base);
    expect(await requestHash(base)).toBe(a);
    expect(await requestHash({ ...base, metadata: { ...base.metadata, viewsText: "5K views" } })).not.toBe(a);
    expect(await requestHash({ ...base, metadata: { ...base.metadata, publishedText: "3 days ago" } })).not.toBe(a);
    expect(await requestHash({ ...base, metadata: { ...base.metadata, title: "A\u0000Chan", channelName: "" } })).not.toBe(
      await requestHash({ ...base, metadata: { ...base.metadata, title: "A", channelName: "\u0000Chan" } }),
    );
  });
});
