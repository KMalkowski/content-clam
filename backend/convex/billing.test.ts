import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { RECEIPT_TTL_MS, reserveCredit, settleCredit } from "./billing";
import { fulfill } from "./purchases";

const modules = import.meta.glob("./**/*.ts");

async function seedUser(t: ReturnType<typeof convexTest>, balance: number) {
  return t.run(async (ctx) =>
    ctx.db.insert("users", { clerkId: "user_1", email: "a@b.c", balance, chargedAnalyses: 0, trialGranted: true, createdAt: 0 }),
  );
}

describe("credit reservation", () => {
  it("charges exactly once across retries of the same operation", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 3);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, user, "op-1", 1000)).toEqual({ status: "reserved", balance: 2 });
      const again = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, again, "op-1", 2000)).toEqual({ status: "reserved", balance: 2 });
      expect(await settleCredit(ctx, userId, "op-1", "charged")).toBe(2);
      const after = (await ctx.db.get(userId))!;
      expect(after.balance).toBe(2);
      expect(after.chargedAnalyses).toBe(1);
      expect(await reserveCredit(ctx, after, "op-1", 3000)).toEqual({ status: "already_charged", balance: 2 });
      expect(await settleCredit(ctx, userId, "op-1", "charged")).toBe(2);
      expect((await ctx.db.get(userId))!.chargedAnalyses).toBe(1);
    });
  });

  it("releases the credit when the analysis fails", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 1);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      await reserveCredit(ctx, user, "op-2", 1000);
      expect((await ctx.db.get(userId))!.balance).toBe(0);
      expect(await settleCredit(ctx, userId, "op-2", "released")).toBe(1);
      expect((await ctx.db.get(userId))!.chargedAnalyses).toBe(0);
    });
  });

  it("refuses when the balance is empty", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 0);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, user, "op-3", 1000)).toEqual({ status: "no_credits", balance: 0 });
    });
  });

  it("rejects retries after the receipt expires", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 2);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      await reserveCredit(ctx, user, "op-4", 1000);
      const later = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, later, "op-4", 1000 + RECEIPT_TTL_MS + 1)).toEqual({ status: "expired" });
    });
  });
});

describe("purchase fulfillment", () => {
  it("grants credits once per checkout session", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 0);
    await t.run(async (ctx) => {
      await ctx.db.insert("purchases", {
        userId, packId: "starter", credits: 500, amountCents: 100, currency: "usd",
        stripeCheckoutSessionId: "cs_1", status: "pending", createdAt: 0,
      });
    });
    expect(await t.mutation(fulfill as any, { stripeCheckoutSessionId: "cs_1", paid: true })).toBe("fulfilled");
    expect(await t.mutation(fulfill as any, { stripeCheckoutSessionId: "cs_1", paid: true })).toBe("already_fulfilled");
    expect(await t.mutation(fulfill as any, { stripeCheckoutSessionId: "cs_missing", paid: true })).toBe("unknown_session");
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user!.balance).toBe(500);
  });
});
