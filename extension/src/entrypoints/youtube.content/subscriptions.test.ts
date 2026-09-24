import { describe, expect, it, vi } from "vitest";
import { handleFromHref } from "./extract";
import { subscribedChannelsFromFeed, subscriptionKeysFromHtml } from "./subscriptions";

const initialData = {
  contents: {
    channelRenderer: {
      channelId: "UC_first",
      title: { simpleText: "First Channel" },
      navigationEndpoint: {
        browseEndpoint: { canonicalBaseUrl: "/@FirstHandle" },
      },
    },
    nested: [
      {
        gridChannelRenderer: {
          channelId: "UC_second",
          title: { runs: [{ text: "Second " }, { text: "Channel" }] },
          navigationEndpoint: {
            commandMetadata: { webCommandMetadata: { url: "/channel/UC_second" } },
          },
        },
      },
    ],
  },
};

describe("subscription feed", () => {
  it.each([
    `var ytInitialData = ${JSON.stringify(initialData)};</script>`,
    `window['ytInitialData'] = ${JSON.stringify(initialData)};`,
    `window["ytInitialData"] = ${JSON.stringify(initialData)};`,
  ])("reads subscribed channels from supported YouTube markup", (html) => {
    expect(subscriptionKeysFromHtml(html)).toEqual(expect.arrayContaining(["First Channel", "firsthandle", "UC_first", "Second Channel", "uc_second", "UC_second"]));
  });

  it.each([
    ["/@Some%20Handle/videos", "some handle"],
    ["/channel/UC_ABC?view=0", "uc_abc"],
    ["https://www.youtube.com/c/CustomName", "customname"],
  ])("gets a stable channel key from %s", (href, expected) => {
    expect(handleFromHref(href)).toBe(expected);
  });

  it("handles braces and escaped quotes inside channel names", () => {
    const data = { channelRenderer: { title: { simpleText: 'A {channel} called "One"' } } };
    expect(subscriptionKeysFromHtml(`var ytInitialData = ${JSON.stringify(data)};`)).toContain('A {channel} called "One"');
  });

  it.each(["", "var ytInitialData = broken;", "var ytInitialData = {oops"])("returns no channels for malformed markup", (html) => {
    expect(subscriptionKeysFromHtml(html)).toEqual([]);
  });

  it("loads the signed-in Channels feed with same-site credentials", async () => {
    const request = vi.fn(async () => new Response(`var ytInitialData = ${JSON.stringify(initialData)};`));
    const keys = await subscribedChannelsFromFeed(request as typeof fetch);
    expect(request).toHaveBeenCalledWith("/feed/channels", { credentials: "same-origin" });
    expect(keys).toContain("firsthandle");
  });

  it("rejects failed feed requests", async () => {
    const request = vi.fn(async () => new Response("nope", { status: 503 }));
    await expect(subscribedChannelsFromFeed(request as typeof fetch)).rejects.toThrow("503");
  });
});
