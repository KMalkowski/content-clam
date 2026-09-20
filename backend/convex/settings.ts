import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { categoryFields, channelFields, topicFields } from "./schema";
import { requireUser } from "./users";
import {
  MAX_ALLOWED_CHANNELS,
  MAX_ALLOWED_TOPICS,
  MAX_CATEGORIES,
  MAX_DESCRIPTION_CHARS,
} from "@content-clam/shared";

type Collection = "categories" | "allowedTopics" | "allowedChannels";
const LIMITS: Record<Collection, number> = {
  categories: MAX_CATEGORIES,
  allowedTopics: MAX_ALLOWED_TOPICS,
  allowedChannels: MAX_ALLOWED_CHANNELS,
};

export const userIdByClerkId = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    return user?._id ?? null;
  },
});

export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      paused: v.boolean(),
      categories: v.array(v.object(categoryFields)),
      allowedTopics: v.array(v.object(topicFields)),
      allowedChannels: v.array(v.object(channelFields)),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    const [meta, categories, allowedTopics, allowedChannels] = await Promise.all([
      ctx.db.query("settingsMeta").withIndex("by_user", (q) => q.eq("userId", user._id)).unique(),
      ctx.db.query("categories").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("allowedTopics").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("allowedChannels").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
    ]);
    return {
      paused: meta?.paused ?? false,
      categories: categories.map(({ itemId, name, description, enabled, updatedAt }) => ({ itemId, name, description, enabled, updatedAt })),
      allowedTopics: allowedTopics.map(({ itemId, description, updatedAt }) => ({ itemId, description, updatedAt })),
      allowedChannels: allowedChannels.map(({ itemId, channelKey, channelName, updatedAt }) => ({ itemId, channelKey, channelName, updatedAt })),
    };
  },
});

export const setPaused = mutation({
  args: { paused: v.boolean(), updatedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { paused, updatedAt }) => {
    const user = await requireUser(ctx);
    const meta = await ctx.db.query("settingsMeta").withIndex("by_user", (q) => q.eq("userId", user._id)).unique();
    if (meta && meta.updatedAt > updatedAt) return null;
    if (meta) await ctx.db.patch(meta._id, { paused, updatedAt });
    else await ctx.db.insert("settingsMeta", { userId: user._id, paused, updatedAt });
    return null;
  },
});

export const upsertCategory = mutation({
  args: categoryFields,
  returns: v.null(),
  handler: async (ctx, item) => {
    assertLength(item.description);
    await upsert(ctx, "categories", item);
    return null;
  },
});

export const upsertTopic = mutation({
  args: topicFields,
  returns: v.null(),
  handler: async (ctx, item) => {
    assertLength(item.description);
    await upsert(ctx, "allowedTopics", item);
    return null;
  },
});

export const upsertChannel = mutation({
  args: channelFields,
  returns: v.null(),
  handler: async (ctx, item) => {
    await upsert(ctx, "allowedChannels", item);
    return null;
  },
});

export const remove = mutation({
  args: {
    collection: v.union(v.literal("categories"), v.literal("allowedTopics"), v.literal("allowedChannels")),
    itemId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { collection, itemId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query(collection)
      .withIndex("by_user_item", (q) => q.eq("userId", user._id).eq("itemId", itemId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const replaceAll = mutation({
  args: {
    paused: v.boolean(),
    categories: v.array(v.object(categoryFields)),
    allowedTopics: v.array(v.object(topicFields)),
    allowedChannels: v.array(v.object(channelFields)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    for (const collection of ["categories", "allowedTopics", "allowedChannels"] as const) {
      if (args[collection].length > LIMITS[collection]) throw new Error(`too_many_${collection}`);
      const existing = await ctx.db.query(collection).withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
      await Promise.all(existing.map((doc) => ctx.db.delete(doc._id)));
    }
    for (const c of args.categories) {
      assertLength(c.description);
      await ctx.db.insert("categories", { userId: user._id, ...c });
    }
    for (const t of args.allowedTopics) {
      assertLength(t.description);
      await ctx.db.insert("allowedTopics", { userId: user._id, ...t });
    }
    for (const ch of args.allowedChannels) await ctx.db.insert("allowedChannels", { userId: user._id, ...ch });
    const meta = await ctx.db.query("settingsMeta").withIndex("by_user", (q) => q.eq("userId", user._id)).unique();
    const now = Date.now();
    if (meta) await ctx.db.patch(meta._id, { paused: args.paused, updatedAt: now });
    else await ctx.db.insert("settingsMeta", { userId: user._id, paused: args.paused, updatedAt: now });
    return null;
  },
});

async function upsert<C extends Collection>(
  ctx: Parameters<typeof requireUser>[0] & { db: any },
  collection: C,
  item: { itemId: string; updatedAt: number } & Record<string, unknown>,
) {
  const user = await requireUser(ctx);
  const existing = await ctx.db
    .query(collection)
    .withIndex("by_user_item", (q: any) => q.eq("userId", user._id).eq("itemId", item.itemId))
    .unique();
  if (existing) {
    if (existing.updatedAt > item.updatedAt) return;
    await ctx.db.patch(existing._id, item);
    return;
  }
  const count = (await ctx.db.query(collection).withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect()).length;
  if (count >= LIMITS[collection]) throw new Error(`too_many_${collection}`);
  await ctx.db.insert(collection, { userId: user._id, ...item });
}

function assertLength(description: string) {
  if (description.length > MAX_DESCRIPTION_CHARS) throw new Error("description_too_long");
}
