import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { newOperationId, OPERATION_CLOCK_SKEW_MS } from "@content-clam/shared";
import schema from "./schema";
import { LEASE_MS, RECEIPT_TTL_MS, reserveCredit, settleCredit, SWEEP_BATCH } from "./billing";
import { internal } from "./_generated/api";
import { fulfill } from "./purchases";

const modules = import.meta.glob("./**/*.ts");

async function seedUser(t: ReturnType<typeof convexTest>, balance: number) {
  return t.run(async (ctx) => ctx.db.insert("users", { clerkId: "user_1", email: "a@b.c", balance, chargedAnalyses: 0, trialGranted: true, createdAt: 0 }));
}

const attempt = (operationId: string, attemptId = "a1", requestHash = "h1") => ({ operationId, requestHash, attemptId });

describe("credit reservation", () => {
  it("charges exactly once across retries of the same operation", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 3);
    const op = newOperationId(1000);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, user, attempt(op), 1000)).toEqual({ status: "reserved", balance: 2 });
      expect(await settleCredit(ctx, userId, attempt(op), "charged")).toBe(2);
      const after = (await ctx.db.get(userId))!;
      expect(after.balance).toBe(2);
      expect(after.chargedAnalyses).toBe(1);
      expect(await reserveCredit(ctx, after, attempt(op, "a2"), 3000)).toEqual({ status: "already_charged", balance: 2 });
      expect(await settleCredit(ctx, userId, attempt(op, "a2"), "charged")).toBe(2);
      expect((await ctx.db.get(userId))!.chargedAnalyses).toBe(1);
    });
  });

  it("refuses a charged operation ID for a different request", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 1);
    const op = newOperationId(1000);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      await reserveCredit(ctx, user, attempt(op), 1000);
      await settleCredit(ctx, userId, attempt(op), "charged");
      const after = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, after, attempt(op, "a2", "other"), 2000)).toEqual({ status: "mismatch" });
    });
  });

  it("releases the credit when the analysis fails", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 1);
    const op = newOperationId(1000);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      await reserveCredit(ctx, user, attempt(op), 1000);
      expect((await ctx.db.get(userId))!.balance).toBe(0);
      expect(await settleCredit(ctx, userId, attempt(op), "released")).toBe(1);
      expect((await ctx.db.get(userId))!.chargedAnalyses).toBe(0);
    });
  });

  it("refuses when the balance is empty", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 0);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, user, attempt(newOperationId(1000)), 1000)).toEqual({ status: "no_credits", balance: 0 });
    });
  });

  it("rejects expired and malformed operation IDs even without a receipt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 2);
    const op = newOperationId(1000);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, user, attempt(op), 1000 + RECEIPT_TTL_MS)).toEqual({ status: "expired" });
      expect(await reserveCredit(ctx, user, attempt("random-uuid"), 1000)).toEqual({ status: "expired" });
      expect((await ctx.db.get(userId))!.balance).toBe(2);
    });
  });

  it("rejects operation IDs dated beyond the allowed clock skew", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 2);
    const now = 1000;
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      const farAhead = newOperationId(now + 2 * 365 * 24 * 60 * 60 * 1000);
      expect(await reserveCredit(ctx, user, attempt(farAhead), now)).toEqual({ status: "expired" });
      const justAhead = newOperationId(now + OPERATION_CLOCK_SKEW_MS + 1);
      expect(await reserveCredit(ctx, user, attempt(justAhead), now)).toEqual({ status: "expired" });
      expect((await ctx.db.get(userId))!.balance).toBe(2);
      const withinSkew = newOperationId(now + OPERATION_CLOCK_SKEW_MS);
      expect(await reserveCredit(ctx, user, attempt(withinSkew), now)).toEqual({ status: "reserved", balance: 1 });
    });
  });

  it("does not charge again when a swept operation is retried", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 2);
    const op = newOperationId(1000);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      await reserveCredit(ctx, user, attempt(op), 1000);
      await settleCredit(ctx, userId, attempt(op), "charged");
      for (const r of await ctx.db.query("receipts").collect()) await ctx.db.delete(r._id);
      const after = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, after, attempt(op, "a2"), 1000 + RECEIPT_TTL_MS + 1)).toEqual({ status: "expired" });
      expect((await ctx.db.get(userId))!.balance).toBe(1);
    });
  });

  it("lets only the leased attempt settle", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 3);
    const op = newOperationId(1000);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, user, attempt(op, "a1"), 1000)).toEqual({ status: "reserved", balance: 2 });
      const during = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, during, attempt(op, "a2"), 2000)).toEqual({ status: "in_progress" });
      expect(await settleCredit(ctx, userId, attempt(op, "a2"), "released")).toBe(2);
      expect((await ctx.db.get(userId))!.balance).toBe(2);
      expect(await settleCredit(ctx, userId, attempt(op, "a1"), "charged")).toBe(2);
      expect((await ctx.db.get(userId))!.chargedAnalyses).toBe(1);
    });
  });

  it("hands a stale lease to a new attempt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 3);
    const op = newOperationId(1000);
    await t.run(async (ctx) => {
      const user = (await ctx.db.get(userId))!;
      await reserveCredit(ctx, user, attempt(op, "a1"), 1000);
      const later = (await ctx.db.get(userId))!;
      expect(await reserveCredit(ctx, later, attempt(op, "a2"), 1000 + LEASE_MS)).toEqual({ status: "reserved", balance: 2 });
      expect(await settleCredit(ctx, userId, attempt(op, "a1"), "charged")).toBe(2);
      expect((await ctx.db.get(userId))!.chargedAnalyses).toBe(0);
      expect(await settleCredit(ctx, userId, attempt(op, "a2"), "charged")).toBe(2);
      expect((await ctx.db.get(userId))!.chargedAnalyses).toBe(1);
    });
  });
});

describe("receipt sweep", () => {
  it("refunds reserved receipts and keeps draining when a batch is full", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 0);
    await t.run(async (ctx) => {
      for (let i = 0; i < SWEEP_BATCH + 1; i++) {
        await ctx.db.insert("receipts", {
          userId,
          operationId: `op-${i}`,
          requestHash: "h",
          attemptId: "a",
          leaseExpiresAt: 0,
          status: i === 0 ? "reserved" : "charged",
          credits: 1,
          expiresAt: 1,
        });
      }
    });
    vi.useFakeTimers();
    expect(await t.mutation(internal.billing.sweepExpiredReceipts, {})).toBe(SWEEP_BATCH);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.get(userId)))!.balance).toBe(1);
  });
});

describe("purchase fulfillment", () => {
  it("grants credits once per checkout session", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, 0);
    await t.run(async (ctx) => {
      await ctx.db.insert("purchases", {
        userId,
        packId: "starter",
        credits: 500,
        amountCents: 100,
        currency: "usd",
        stripeCheckoutSessionId: "cs_1",
        status: "pending",
        createdAt: 0,
      });
    });
    expect(await t.mutation(fulfill as any, { stripeCheckoutSessionId: "cs_1", paid: true })).toBe("fulfilled");
    expect(await t.mutation(fulfill as any, { stripeCheckoutSessionId: "cs_1", paid: true })).toBe("already_fulfilled");
    expect(await t.mutation(fulfill as any, { stripeCheckoutSessionId: "cs_missing", paid: true })).toBe("unknown_session");
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user!.balance).toBe(500);
  });
});
