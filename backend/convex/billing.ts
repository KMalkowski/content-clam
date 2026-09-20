import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const RECEIPT_TTL_MS = 15 * 60 * 1000;

export type ReserveOutcome =
  | { status: "reserved"; balance: number }
  | { status: "already_charged"; balance: number }
  | { status: "no_credits"; balance: number }
  | { status: "expired" };

export async function reserveCredit(
  ctx: MutationCtx,
  user: Doc<"users">,
  operationId: string,
  now: number,
): Promise<ReserveOutcome> {
  const receipt = await findReceipt(ctx, user._id, operationId);
  if (receipt) {
    if (receipt.status === "charged") return { status: "already_charged", balance: user.balance };
    if (receipt.expiresAt <= now) return { status: "expired" };
    if (receipt.status === "reserved") return { status: "reserved", balance: user.balance };
    await ctx.db.delete(receipt._id);
  }
  if (user.balance < 1) return { status: "no_credits", balance: user.balance };
  await ctx.db.patch(user._id, { balance: user.balance - 1 });
  await ctx.db.insert("receipts", {
    userId: user._id,
    operationId,
    status: "reserved",
    credits: 1,
    expiresAt: now + RECEIPT_TTL_MS,
  });
  return { status: "reserved", balance: user.balance - 1 };
}

export async function settleCredit(
  ctx: MutationCtx,
  userId: Id<"users">,
  operationId: string,
  outcome: "charged" | "released",
): Promise<number> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("user_missing");
  const receipt = await findReceipt(ctx, userId, operationId);
  if (!receipt || receipt.status !== "reserved") return user.balance;
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

export const reserve = internalMutation({
  args: { clerkId: v.string(), operationId: v.string() },
  returns: v.union(
    v.object({ status: v.literal("reserved"), balance: v.number() }),
    v.object({ status: v.literal("already_charged"), balance: v.number() }),
    v.object({ status: v.literal("no_credits"), balance: v.number() }),
    v.object({ status: v.literal("expired") }),
    v.object({ status: v.literal("unauthenticated") }),
  ),
  handler: async (ctx, { clerkId, operationId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return { status: "unauthenticated" as const };
    return reserveCredit(ctx, user, operationId, Date.now());
  },
});

export const settle = internalMutation({
  args: {
    userId: v.id("users"),
    operationId: v.string(),
    outcome: v.union(v.literal("charged"), v.literal("released")),
  },
  returns: v.number(),
  handler: async (ctx, { userId, operationId, outcome }) => settleCredit(ctx, userId, operationId, outcome),
});

export const sweepExpiredReceipts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("receipts")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(200);
    for (const receipt of expired) {
      if (receipt.status === "reserved") {
        const user = await ctx.db.get(receipt.userId);
        if (user) await ctx.db.patch(user._id, { balance: user.balance + receipt.credits });
      }
      await ctx.db.delete(receipt._id);
    }
    return expired.length;
  },
});
