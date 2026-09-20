import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { TRIAL_ANALYSES } from "@content-clam/shared";
import { TRIAL_BUDGET_TOTAL } from "./packs";
import { rateLimiter } from "./rateLimits";

export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("unauthenticated");
  return identity;
}

export async function findUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await findUser(ctx);
  if (!user) throw new Error("unauthenticated");
  return user;
}

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      balance: v.number(),
      chargedAnalyses: v.number(),
      trialGranted: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await findUser(ctx);
    if (!user) return null;
    return {
      email: user.email,
      balance: user.balance,
      chargedAnalyses: user.chargedAnalyses,
      trialGranted: user.trialGranted,
    };
  },
});

export const ensureUser = mutation({
  args: {},
  returns: v.object({ balance: v.number(), trialGranted: v.boolean(), created: v.boolean() }),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (existing) {
      return { balance: existing.balance, trialGranted: existing.trialGranted, created: false };
    }

    await rateLimiter.limit(ctx, "signup", { throws: true });

    const email = identity.email?.toLowerCase();
    const verified = identity.emailVerified === true;
    if (!email || !verified) throw new Error("email_not_verified");

    const sameEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    const trialCredits = sameEmail ? 0 : await takeTrialBudget(ctx);

    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      balance: trialCredits,
      chargedAnalyses: 0,
      trialGranted: trialCredits > 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("settingsMeta", { userId, paused: false, updatedAt: Date.now() });
    return { balance: trialCredits, trialGranted: trialCredits > 0, created: true };
  },
});

async function takeTrialBudget(ctx: MutationCtx): Promise<number> {
  const budget = await ctx.db
    .query("trialBudget")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .unique();
  const granted = budget?.granted ?? 0;
  if (granted + TRIAL_ANALYSES > TRIAL_BUDGET_TOTAL) return 0;
  if (budget) {
    await ctx.db.patch(budget._id, { granted: granted + TRIAL_ANALYSES });
  } else {
    await ctx.db.insert("trialBudget", { key: "global", granted: TRIAL_ANALYSES });
  }
  return TRIAL_ANALYSES;
}
