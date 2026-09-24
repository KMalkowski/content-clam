import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newOperationId, type HostedAnalyzeRequest } from "@content-clam/shared";
import schema from "./schema";
import { api } from "./_generated/api";
import { requestHash } from "./analyze";

const modules = import.meta.glob("./**/*.ts");

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

describe("hosted analysis", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function setup(balance: number) {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { clerkId: "user_1", email: "a@b.c", balance, chargedAnalyses: 0, trialGranted: true, createdAt: 0 }),
    );
    const asUser = t.withIdentity({ subject: "user_1" });
    const run = () => asUser.action(api.analyze.run, { ...base, operationId: newOperationId() });
    const account = () => t.run(async (ctx) => ctx.db.get(userId));
    const receipts = () => t.run(async (ctx) => ctx.db.query("receipts").collect());
    return { run, account, receipts };
  }

  it("reserves nothing when the provider key is missing", async () => {
    vi.stubEnv("JEV_API_KEY", "");
    const { run, account, receipts } = await setup(2);
    expect(await run()).toMatchObject({ ok: false, code: "provider_error" });
    expect((await account())!.balance).toBe(2);
    expect(await receipts()).toEqual([]);
  });

  it("returns the credit when the provider rejects the request", async () => {
    vi.stubEnv("JEV_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad key", { status: 401 })),
    );
    const { run, account, receipts } = await setup(2);
    expect(await run()).toMatchObject({ ok: false, code: "provider_error" });
    expect((await account())!).toMatchObject({ balance: 2, chargedAnalyses: 0 });
    expect((await receipts()).map((r) => r.status)).toEqual(["released"]);
  });
});
