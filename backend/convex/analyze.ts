import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  classify,
  createFetchJevCaller,
  withBackoff,
  MAX_CATEGORIES,
  MAX_ALLOWED_TOPICS,
  MAX_DESCRIPTION_CHARS,
  type HostedAnalyzeResponse,
} from "@content-clam/shared";
import { rateLimiter } from "./rateLimits";

const ruleValidator = v.object({ id: v.string(), name: v.string(), description: v.string() });
const topicValidator = v.object({ id: v.string(), description: v.string() });

export const run = action({
  args: {
    operationId: v.string(),
    metadata: v.object({
      videoId: v.string(),
      title: v.string(),
      channelName: v.optional(v.string()),
      channelHandle: v.optional(v.string()),
      description: v.optional(v.string()),
      durationText: v.optional(v.string()),
      viewsText: v.optional(v.string()),
      publishedText: v.optional(v.string()),
      badges: v.optional(v.array(v.string())),
      isShort: v.boolean(),
    }),
    categories: v.array(ruleValidator),
    topics: v.array(topicValidator),
  },
  handler: async (ctx, args): Promise<HostedAnalyzeResponse> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false, code: "unauthenticated", message: "Sign in to use credits." };

    const invalid = validateRules(args);
    if (invalid) return { ok: false, code: "invalid_request", message: invalid };

    const limit = await rateLimiter.limit(ctx, "analyze", { key: identity.subject });
    if (!limit.ok) return { ok: false, code: "rate_limited", message: "Too many requests. Slow down a little." };

    const reservation = await ctx.runMutation(internal.billing.reserve, {
      clerkId: identity.subject,
      operationId: args.operationId,
    });
    if (reservation.status === "unauthenticated") {
      return { ok: false, code: "unauthenticated", message: "Account not found. Open the popup to finish sign-in." };
    }
    if (reservation.status === "no_credits") {
      return { ok: false, code: "no_credits", message: "No credits left.", balance: reservation.balance };
    }
    if (reservation.status === "expired") {
      return { ok: false, code: "expired_operation", message: "This request expired. Start a new one." };
    }

    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey) throw new Error("JEV_API_KEY is not configured");
    const callJev = createFetchJevCaller(apiKey);

    const userId = await ctx.runQuery(internal.settings.userIdByClerkId, { clerkId: identity.subject });
    if (!userId) return { ok: false, code: "unauthenticated", message: "Account not found." };

    try {
      const result = await classify(
        args.metadata,
        args.categories.map((c) => ({ ...c, enabled: true, updatedAt: 0 })),
        args.topics.map((t) => ({ ...t, updatedAt: 0 })),
        (request) => withBackoff(() => callJev(request)),
      );
      const balance = await ctx.runMutation(internal.billing.settle, {
        userId,
        operationId: args.operationId,
        outcome: "charged",
      });
      return { ok: true, result, balance };
    } catch (error) {
      if (reservation.status === "reserved") {
        await ctx.runMutation(internal.billing.settle, {
          userId,
          operationId: args.operationId,
          outcome: "released",
        });
      }
      return { ok: false, code: "provider_error", message: describe(error) };
    }
  },
});

function validateRules(args: {
  categories: { description: string }[];
  topics: { description: string }[];
}): string | null {
  if (args.categories.length > MAX_CATEGORIES) return `At most ${MAX_CATEGORIES} categories.`;
  if (args.topics.length > MAX_ALLOWED_TOPICS) return `At most ${MAX_ALLOWED_TOPICS} allowed topics.`;
  for (const rule of [...args.categories, ...args.topics]) {
    if (rule.description.length > MAX_DESCRIPTION_CHARS) return `Descriptions are limited to ${MAX_DESCRIPTION_CHARS} characters.`;
  }
  if (args.categories.length === 0 && args.topics.length === 0) return "Nothing to analyze.";
  return null;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.name === "JevError" ? "The classification service is unavailable." : error.message;
  return "Classification failed.";
}
