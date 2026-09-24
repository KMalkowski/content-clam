import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categoryFields = {
  itemId: v.string(),
  name: v.string(),
  description: v.string(),
  enabled: v.boolean(),
  updatedAt: v.number(),
};

export const topicFields = {
  itemId: v.string(),
  description: v.string(),
  updatedAt: v.number(),
};

export const channelFields = {
  itemId: v.string(),
  channelKey: v.string(),
  channelName: v.string(),
  updatedAt: v.number(),
};

export const settingsCollection = v.union(v.literal("categories"), v.literal("allowedTopics"), v.literal("allowedChannels"));

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    balance: v.number(),
    chargedAnalyses: v.number(),
    trialGranted: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  categories: defineTable({ userId: v.id("users"), ...categoryFields })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "itemId"]),

  allowedTopics: defineTable({ userId: v.id("users"), ...topicFields })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "itemId"]),

  allowedChannels: defineTable({ userId: v.id("users"), ...channelFields })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "itemId"]),

  settingsDeletions: defineTable({
    userId: v.id("users"),
    collection: settingsCollection,
    itemId: v.string(),
    deletedAt: v.number(),
  })
    .index("by_user_item", ["userId", "collection", "itemId"])
    .index("by_user_deletedAt", ["userId", "deletedAt"]),

  settingsMeta: defineTable({
    userId: v.id("users"),
    paused: v.boolean(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  receipts: defineTable({
    userId: v.id("users"),
    operationId: v.string(),
    requestHash: v.string(),
    attemptId: v.string(),
    leaseExpiresAt: v.number(),
    status: v.union(v.literal("reserved"), v.literal("charged"), v.literal("released")),
    credits: v.number(),
    expiresAt: v.number(),
  })
    .index("by_user_operation", ["userId", "operationId"])
    .index("by_expiresAt", ["expiresAt"]),

  purchases: defineTable({
    userId: v.id("users"),
    packId: v.string(),
    credits: v.number(),
    amountCents: v.number(),
    currency: v.string(),
    stripeCheckoutSessionId: v.string(),
    status: v.union(v.literal("pending"), v.literal("fulfilled"), v.literal("failed")),
    createdAt: v.number(),
    fulfilledAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_session", ["stripeCheckoutSessionId"]),

  trialBudget: defineTable({
    key: v.literal("global"),
    granted: v.number(),
  }).index("by_key", ["key"]),
});
