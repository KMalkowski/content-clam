import { describe, expect, it, vi } from "vitest";
import type { VideoMetadata } from "@content-clam/shared";
import type { AnalysisOutcome } from "../../lib/messages";
import { AnalysisQueue, RETRY_DELAY_MS } from "./analysisQueue";

const video = (videoId: string): VideoMetadata => ({ videoId, title: videoId, isShort: false });
const dimmed = (videoId: string): AnalysisOutcome => ({ videoId, decision: { dimmed: true, matchedCategoryIds: ["c"], allowedByTopicIds: [] }, reasons: [] });
const failed = (videoId: string): AnalysisOutcome => ({ videoId, decision: null, reasons: [], error: "boom" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup(implementation: (videos: VideoMetadata[]) => Promise<AnalysisOutcome[]>) {
  let now = 0;
  const analyze = vi.fn(implementation);
  const onOutcome = vi.fn<(outcome: AnalysisOutcome) => void>();
  const queue = new AnalysisQueue({ analyze, onOutcome, now: () => now });
  return { queue, onOutcome, analyze, advance: (ms: number) => (now += ms) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("analysis queue", () => {
  it("sends each video once while it is waiting or known", async () => {
    const { queue, analyze } = setup(async (videos) => videos.map((v) => dimmed(v.videoId)));
    queue.request([video("a"), video("a"), video("b")]);
    queue.request([video("a")]);
    await flush();
    queue.request([video("a"), video("b")]);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]![0].map((v) => v.videoId)).toEqual(["a", "b"]);
    expect(queue.outcomeFor("a")?.decision?.dimmed).toBe(true);
  });

  it("splits large requests into chunks", async () => {
    const { queue, analyze } = setup(async (videos) => videos.map((v) => dimmed(v.videoId)));
    queue.request(Array.from({ length: 30 }, (_, i) => video(`v${i}`)));
    await flush();
    expect(analyze.mock.calls.map(([chunk]) => chunk.length)).toEqual([12, 12, 6]);
  });

  it("waits before retrying a failed analysis", async () => {
    const { queue, analyze, advance } = setup(async (videos) => videos.map((v) => failed(v.videoId)));
    queue.request([video("a")]);
    await flush();
    queue.request([video("a")]);
    expect(analyze).toHaveBeenCalledTimes(1);
    advance(RETRY_DELAY_MS + 1);
    queue.request([video("a")]);
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("treats a rejected request as a failure for every video in it", async () => {
    const { queue, onOutcome } = setup(async () => {
      throw new Error("extension reloaded");
    });
    queue.request([video("a"), video("b")]);
    await flush();
    expect(onOutcome.mock.calls.map(([o]) => o.videoId)).toEqual(["a", "b"]);
    expect(queue.isWaiting("a")).toBe(true);
  });

  it("drops results that arrive after a reset", async () => {
    const pending = deferred<AnalysisOutcome[]>();
    const { queue, onOutcome, analyze } = setup(() => pending.promise);
    queue.request([video("a")]);
    queue.reset();
    pending.resolve([dimmed("a")]);
    await flush();
    expect(onOutcome).not.toHaveBeenCalled();
    expect(queue.outcomeFor("a")).toBeUndefined();
    queue.request([video("a")]);
    expect(analyze).toHaveBeenCalledTimes(2);
  });
});
