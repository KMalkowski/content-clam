import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { findPack, PACKS } from "./packs";
import { findUser } from "./users";
import { rateLimiter } from "./rateLimits";

const stripe = new StripeSubscriptions(components.stripe, {});

export const listPacks = query({
  args: {},
  returns: v.array(v.object({ id: v.string(), name: v.string(), credits: v.number(), amountCents: v.number(), currency: v.string() })),
  handler: async () => PACKS.map(({ id, name, credits, amountCents, currency }) => ({ id, name, credits, amountCents, currency })),
});

export const startCheckout = action({
  args: { packId: v.string(), returnUrl: v.string() },
  returns: v.object({ url: v.union(v.string(), v.null()) }),
  handler: async (ctx, { packId, returnUrl }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("unauthenticated");
    const pack = findPack(packId);
    if (!pack) throw new Error("unknown_pack");
    const priceId = process.env[pack.stripePriceEnv];
    if (!priceId) throw new Error(`${pack.stripePriceEnv} is not configured`);
    await rateLimiter.limit(ctx, "checkout", { key: identity.subject, throws: true });

    const userId = await ctx.runQuery(internal.settings.userIdByClerkId, { clerkId: identity.subject });
    if (!userId) throw new Error("unauthenticated");

    const customer = await stripe.getOrCreateCustomer(ctx, {
      userId: identity.subject,
      email: identity.email,
      name: identity.name,
    });
    const url = new URL(returnUrl);
    url.searchParams.set("checkout", "success");
    const cancel = new URL(returnUrl);
    cancel.searchParams.set("checkout", "cancelled");

    const session = await stripe.createCheckoutSession(ctx, {
      priceId,
      customerId: customer.customerId,
      mode: "payment",
      successUrl: url.toString(),
      cancelUrl: cancel.toString(),
      metadata: { packId: pack.id, userId },
      paymentIntentMetadata: { userId: identity.subject, packId: pack.id },
    });
    await ctx.runMutation(internal.purchases.recordPending, {
      userId,
      packId: pack.id,
      stripeCheckoutSessionId: session.sessionId,
    });
    return { url: session.url };
  },
});

export const recordPending = internalMutation({
  args: { userId: v.id("users"), packId: v.string(), stripeCheckoutSessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, packId, stripeCheckoutSessionId }) => {
    const pack = findPack(packId);
    if (!pack) throw new Error("unknown_pack");
    await ctx.db.insert("purchases", {
      userId,
      packId,
      credits: pack.credits,
      amountCents: pack.amountCents,
      currency: pack.currency,
      stripeCheckoutSessionId,
      status: "pending",
      createdAt: Date.now(),
    });
    return null;
  },
});

export const fulfill = internalMutation({
  args: { stripeCheckoutSessionId: v.string(), paid: v.boolean() },
  returns: v.union(v.literal("fulfilled"), v.literal("already_fulfilled"), v.literal("failed"), v.literal("unknown_session")),
  handler: async (ctx, { stripeCheckoutSessionId, paid }) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("stripeCheckoutSessionId", stripeCheckoutSessionId))
      .unique();
    if (!purchase) return "unknown_session";
    if (purchase.status === "fulfilled") return "already_fulfilled";
    if (!paid) {
      await ctx.db.patch(purchase._id, { status: "failed" });
      return "failed";
    }
    const user = await ctx.db.get(purchase.userId);
    if (!user) throw new Error("user_missing");
    await ctx.db.patch(user._id, { balance: user.balance + purchase.credits });
    await ctx.db.patch(purchase._id, { status: "fulfilled", fulfilledAt: Date.now() });
    return "fulfilled";
  },
});

export const history = query({
  args: {},
  returns: v.array(
    v.object({
      packId: v.string(),
      credits: v.number(),
      amountCents: v.number(),
      currency: v.string(),
      status: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await findUser(ctx);
    if (!user) return [];
    const purchases = await ctx.db
      .query("purchases")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
    return purchases.map(({ packId, credits, amountCents, currency, status, createdAt }) => ({ packId, credits, amountCents, currency, status, createdAt }));
  },
});
