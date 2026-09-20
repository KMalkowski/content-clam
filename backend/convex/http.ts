import { httpRouter } from "convex/server";
import { registerRoutes } from "@convex-dev/stripe";
import { components, internal } from "./_generated/api";

const http = httpRouter();

registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  events: {
    "checkout.session.completed": async (ctx, event) => {
      const session = event.data.object;
      if (session.mode !== "payment") return;
      await ctx.runMutation(internal.purchases.fulfill, {
        stripeCheckoutSessionId: session.id,
        paid: session.payment_status === "paid",
      });
    },
    "checkout.session.async_payment_succeeded": async (ctx, event) => {
      await ctx.runMutation(internal.purchases.fulfill, {
        stripeCheckoutSessionId: event.data.object.id,
        paid: true,
      });
    },
    "checkout.session.async_payment_failed": async (ctx, event) => {
      await ctx.runMutation(internal.purchases.fulfill, {
        stripeCheckoutSessionId: event.data.object.id,
        paid: false,
      });
    },
  },
});

export default http;
