import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { DELETION_TTL_MS } from "./settings";

const modules = import.meta.glob("./**/*.ts");
const T = Date.now();

type Collection = "categories" | "allowedTopics" | "allowedChannels";
const topic = (itemId: string, updatedAt: number, description = itemId) => ({ itemId, description, updatedAt });
const deletion = (itemId: string, deletedAt: number, collection: Collection = "allowedTopics") => ({ collection, itemId, deletedAt });

function changes(overrides: { allowedTopics?: ReturnType<typeof topic>[]; deletions?: ReturnType<typeof deletion>[] } = {}) {
  return { categories: [], allowedChannels: [], allowedTopics: [], deletions: [], ...overrides };
}

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { clerkId: "user_1", email: "a@b.c", balance: 0, chargedAnalyses: 0, trialGranted: true, createdAt: 0 }),
  );
  return { t, userId, user: t.withIdentity({ subject: "user_1" }) };
}

describe("settings sync", () => {
  it("keeps the newer version of an item", async () => {
    const { user } = await setup();
    await user.mutation(api.settings.applyChanges, changes({ allowedTopics: [topic("t1", T + 20, "new")] }));
    const result = await user.mutation(api.settings.applyChanges, changes({ allowedTopics: [topic("t1", T + 10, "old")] }));
    expect(result.allowedTopics).toEqual([topic("t1", T + 20, "new")]);
  });

  it("does not let a stale device bring back a deleted item", async () => {
    const { user } = await setup();
    await user.mutation(api.settings.applyChanges, changes({ allowedTopics: [topic("t1", T + 10)] }));
    await user.mutation(api.settings.applyChanges, changes({ deletions: [deletion("t1", T + 20)] }));
    const stale = await user.mutation(api.settings.applyChanges, changes({ allowedTopics: [topic("t1", T + 15, "stale edit")] }));
    expect(stale.allowedTopics).toEqual([]);
    const newer = await user.mutation(api.settings.applyChanges, changes({ allowedTopics: [topic("t1", T + 30, "edited after")] }));
    expect(newer.allowedTopics).toEqual([topic("t1", T + 30, "edited after")]);
  });

  it("ignores a deletion older than the latest edit", async () => {
    const { user } = await setup();
    await user.mutation(api.settings.applyChanges, changes({ allowedTopics: [topic("t1", T + 30)] }));
    const result = await user.mutation(api.settings.applyChanges, changes({ deletions: [deletion("t1", T + 20)] }));
    expect(result.allowedTopics).toEqual([topic("t1", T + 30)]);
  });

  it("records deletions when replacing everything", async () => {
    const { user } = await setup();
    await user.mutation(api.settings.applyChanges, changes({ allowedTopics: [topic("t1", T), topic("t2", T)] }));
    await user.mutation(api.settings.replaceAll, { paused: false, categories: [], allowedChannels: [], allowedTopics: [topic("t2", T)] });
    const stale = await user.mutation(api.settings.applyChanges, changes({ allowedTopics: [topic("t1", T + 1, "stale")] }));
    expect(stale.allowedTopics).toEqual([topic("t2", T)]);
  });

  it("forgets deletion records after the retention window", async () => {
    const { t, userId, user } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("settingsDeletions", { userId, ...deletion("old", T - DELETION_TTL_MS - 1) });
      await ctx.db.insert("settingsDeletions", { userId, ...deletion("recent", T - 1) });
    });
    await user.mutation(api.settings.applyChanges, changes());
    const left = await t.run(async (ctx) => ctx.db.query("settingsDeletions").collect());
    expect(left.map((d) => d.itemId)).toEqual(["recent"]);
  });
});
