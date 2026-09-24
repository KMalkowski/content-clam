import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  CACHE_TTL_MS,
  OPERATION_TTL_MS,
  defaultSettings,
  type HostedAnalyzeRequest,
  type HostedAnalyzeResponse,
  type VideoMetadata,
} from "@content-clam/shared";
import { analyzeVideos } from "./analyzer";
import { fundingModeItem, pendingOperationsItem, settingsItem } from "./storage";
import { recordSubscriptions } from "./subscriptions";

const hostedAnalyze = vi.fn<(request: HostedAnalyzeRequest) => Promise<HostedAnalyzeResponse>>();
vi.mock("./hosted", () => ({ hostedAnalyze: (request: HostedAnalyzeRequest) => hostedAnalyze(request) }));

const video: VideoMetadata = { videoId: "v1", title: "Video", channelName: "Chan", viewsText: "1K views", isShort: false };
const success = (): HostedAnalyzeResponse => ({
  ok: true,
  balance: 1,
  result: { categoryScores: {}, topicScores: {}, model: "test", inputTokens: 0, requestCount: 1 },
});
const sentOperationIds = () => hostedAnalyze.mock.calls.map((c) => c[0].operationId);

let now = 1_000_000;

beforeEach(async () => {
  fakeBrowser.reset();
  hostedAnalyze.mockReset();
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  await fundingModeItem.setValue("hosted");
});

afterEach(() => vi.restoreAllMocks());

describe("hosted analysis operations", () => {
  it("reuses the same operation id while it is still valid", async () => {
    hostedAnalyze.mockRejectedValueOnce(new Error("network"));
    await analyzeVideos([video]);
    now += 60_000;
    hostedAnalyze.mockResolvedValue(success());
    const [result] = await analyzeVideos([video]);
    expect(result!.decision).not.toBeNull();
    expect(new Set(sentOperationIds()).size).toBe(1);
  });

  it("does not mint a new paid operation after the previous one expired", async () => {
    hostedAnalyze.mockRejectedValueOnce(new Error("network"));
    await analyzeVideos([video]);
    now += OPERATION_TTL_MS + 1;
    const [expired] = await analyzeVideos([video]);
    expect(expired!.decision).toBeNull();
    expect(expired!.error).toMatch(/expired/i);
    hostedAnalyze.mockResolvedValue(success());
    now += 60_000;
    const [again] = await analyzeVideos([video]);
    expect(again!.decision).toBeNull();
    expect(sentOperationIds()).toHaveLength(1);
  });

  it("keeps the operation blocked when the server reports it expired", async () => {
    hostedAnalyze.mockResolvedValueOnce({ ok: false, code: "expired_operation", message: "This request expired." });
    await analyzeVideos([video]);
    hostedAnalyze.mockResolvedValue(success());
    const [again] = await analyzeVideos([video]);
    expect(again!.decision).toBeNull();
    expect(hostedAnalyze).toHaveBeenCalledTimes(1);
  });

  it("forgets an expired operation once the cache window has passed", async () => {
    hostedAnalyze.mockResolvedValueOnce({ ok: false, code: "expired_operation", message: "This request expired." });
    await analyzeVideos([video]);
    now += CACHE_TTL_MS + 1;
    hostedAnalyze.mockResolvedValue(success());
    const [result] = await analyzeVideos([video]);
    expect(result!.decision).not.toBeNull();
    expect(new Set(sentOperationIds()).size).toBe(2);
  });

  it("resends the original payload on retry even if the page metadata changed", async () => {
    hostedAnalyze.mockRejectedValueOnce(new Error("network"));
    await analyzeVideos([video]);
    hostedAnalyze.mockResolvedValue(success());
    const [result] = await analyzeVideos([{ ...video, viewsText: "2K views" }]);
    expect(result!.decision).not.toBeNull();
    const [first, second] = hostedAnalyze.mock.calls.map((c) => c[0]);
    expect(second!.operationId).toBe(first!.operationId);
    expect(second!.metadata.viewsText).toBe("1K views");
  });

  it("analyzes a changed title separately instead of reusing the old operation", async () => {
    hostedAnalyze.mockRejectedValueOnce(new Error("network"));
    await analyzeVideos([video]);
    hostedAnalyze.mockResolvedValue(success());
    const renamed = { ...video, title: "Renamed video" };
    await analyzeVideos([renamed]);
    const [first, second] = hostedAnalyze.mock.calls.map((c) => c[0]);
    expect(second!.operationId).not.toBe(first!.operationId);
    expect(second!.metadata.title).toBe("Renamed video");
    await analyzeVideos([renamed]);
    expect(hostedAnalyze).toHaveBeenCalledTimes(2);
  });

  it("clears the pending record after a successful result", async () => {
    hostedAnalyze.mockResolvedValue(success());
    await analyzeVideos([video]);
    expect(await pendingOperationsItem.getValue()).toEqual({});
  });
});

describe("subscribed channels", () => {
  it.each([
    ["channel name", ["Chan"], { channelName: "Chan", channelHandle: undefined }],
    ["handle", ["@real-handle"], { channelName: "Different display name", channelHandle: "real-handle" }],
    ["channel id", ["UC_ABC"], { channelName: "Different display name", channelHandle: "uc_abc" }],
  ])("leaves a subscribed channel visible by %s without spending an analysis", async (_label, keys, channel) => {
    await recordSubscriptions(keys);
    hostedAnalyze.mockResolvedValue(success());
    const [result] = await analyzeVideos([{ ...video, ...channel }]);
    expect(result!.decision?.dimmed).toBe(false);
    expect(hostedAnalyze).not.toHaveBeenCalled();
  });

  it("bypasses an earlier hidden result after learning the subscription", async () => {
    hostedAnalyze.mockResolvedValue({
      ok: true,
      balance: 1,
      result: { categoryScores: { clickbait: 0.99 }, topicScores: {}, model: "test", inputTokens: 0, requestCount: 1 },
    });
    const [before] = await analyzeVideos([video]);
    expect(before!.decision?.dimmed).toBe(true);
    await recordSubscriptions(["Chan"]);
    const [after] = await analyzeVideos([video]);
    expect(after!.decision?.dimmed).toBe(false);
    expect(hostedAnalyze).toHaveBeenCalledTimes(1);
  });

  it("analyzes subscribed channels when the option is off", async () => {
    await recordSubscriptions(["@Chan"]);
    await settingsItem.setValue({ ...defaultSettings(), keepSubscribed: false });
    hostedAnalyze.mockResolvedValue(success());
    await analyzeVideos([video]);
    expect(hostedAnalyze).toHaveBeenCalledTimes(1);
  });
});
