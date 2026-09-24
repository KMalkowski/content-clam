import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { operationExpiresAt, OPERATION_TTL_MS } from "@content-clam/shared";

export const RECEIPT_TTL_MS = OPERATION_TTL_MS;
export const LEASE_MS = 5 * 60 * 1000;
export const SWEEP_BATCH = 200;

export type ReserveOutcome =
  | { status: "reserved"; balance: number }
  | { status: "already_charged"; balance: number }
  | { status: "in_progress" }
  | { status: "mismatch" }
  | { status: "no_credits"; balance: number }
  | { status: "expired" };

export interface Attempt {
  operationId: string;
  requestHash: string;
  attemptId: string;
}

export async function reserveCredit(ctx: MutationCtx, user: Doc<"users">, attempt: Attempt, now: number): Promise<ReserveOutcome> {
  const expiresAt = operationExpiresAt(attempt.operationId, now);
  if (expiresAt === null || expiresAt <= now) return { status: "expired" };

  const receipt = await findReceipt(ctx, user._id, attempt.operationId);
  if (receipt) {
    if (receipt.requestHash !== attempt.requestHash) return { status: "mismatch" };
    if (receipt.status === "charged") return { status: "already_charged", balance: user.balance };
    if (receipt.status === "reserved") {
      if (receipt.leaseExpiresAt > now) return { status: "in_progress" };
      await ctx.db.patch(receipt._id, { attemptId: attempt.attemptId, leaseExpiresAt: now + LEASE_MS });
      return { status: "reserved", balance: user.balance };
    }
    await ctx.db.delete(receipt._id);
  }
  if (user.balance < 1) return { status: "no_credits", balance: user.balance };
  await ctx.db.patch(user._id, { balance: user.balance - 1 });
  await ctx.db.insert("receipts", {
    userId: user._id,
    operationId: attempt.operationId,
    requestHash: attempt.requestHash,
    attemptId: attempt.attemptId,
    leaseExpiresAt: now + LEASE_MS,
    status: "reserved",
    credits: 1,
    expiresAt,
  });
  return { status: "reserved", balance: user.balance - 1 };
}

export async function settleCredit(
  ctx: MutationCtx,
  userId: Id<"users">,
  attempt: Pick<Attempt, "operationId" | "attemptId">,
  outcome: "charged" | "released",
): Promise<number> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("user_missing");
  const receipt = await findReceipt(ctx, userId, attempt.operationId);
  if (receipt?.status !== "reserved" || receipt.attemptId !== attempt.attemptId) return user.balance;
  if (outcome === "charged") {
    await ctx.db.patch(receipt._id, { status: "charged" });
    await ctx.db.patch(userId, { chargedAnalyses: user.chargedAnalyses + receipt.credits });
    return user.balance;
  }
  await ctx.db.patch(receipt._id, { status: "released" });
  await ctx.db.patch(userId, { balance: user.balance + receipt.credits });
  return user.balance + receipt.credits;
}

async function findReceipt(ctx: MutationCtx, userId: Id<"users">, operationId: string) {
  return ctx.db
    .query("receipts")
    .withIndex("by_user_operation", (q) => q.eq("userId", userId).eq("operationId", operationId))
    .unique();
}

const attemptArgs = { operationId: v.string(), requestHash: v.string(), attemptId: v.string() };

export const reserve = internalMutation({
  args: { clerkId: v.string(), ...attemptArgs },
  returns: v.union(
    v.object({ status: v.literal("reserved"), balance: v.number() }),
    v.object({ status: v.literal("already_charged"), balance: v.number() }),
    v.object({ status: v.literal("in_progress") }),
    v.object({ status: v.literal("mismatch") }),
    v.object({ status: v.literal("no_credits"), balance: v.number() }),
    v.object({ status: v.literal("expired") }),
    v.object({ status: v.literal("unauthenticated") }),
  ),
  handler: async (ctx, { clerkId, ...attempt }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return { status: "unauthenticated" as const };
    return reserveCredit(ctx, user, attempt, Date.now());
  },
});

export const settle = internalMutation({
  args: {
    userId: v.id("users"),
    operationId: v.string(),
    attemptId: v.string(),
    outcome: v.union(v.literal("charged"), v.literal("released")),
  },
  returns: v.number(),
  handler: async (ctx, { userId, operationId, attemptId, outcome }) => settleCredit(ctx, userId, { operationId, attemptId }, outcome),
});

export const sweepExpiredReceipts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("receipts")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(SWEEP_BATCH);
    for (const receipt of expired) {
      if (receipt.status === "reserved") {
        const user = await ctx.db.get(receipt.userId);
        if (user) await ctx.db.patch(user._id, { balance: user.balance + receipt.credits });
      }
      await ctx.db.delete(receipt._id);
    }
    if (expired.length === SWEEP_BATCH) await ctx.scheduler.runAfter(0, internal.billing.sweepExpiredReceipts, {});
    return expired.length;
  },
});
