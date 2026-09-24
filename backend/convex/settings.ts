import { v, type Infer } from "convex/values";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
import { categoryFields, channelFields, settingsCollection, topicFields } from "./schema";
import { findUser, requireUser } from "./users";
import { MAX_ALLOWED_CHANNELS, MAX_ALLOWED_TOPICS, MAX_CATEGORIES, MAX_DESCRIPTION_CHARS } from "@content-clam/shared";

type Collection = Infer<typeof settingsCollection>;
type ItemOf<C extends Collection> = Omit<WithoutSystemFields<Doc<C>>, "userId">;
type Entry = { [C in Collection]: { collection: C; item: ItemOf<C> } }[Collection];
type LiveDoc = Doc<Collection>;

const LIMITS: Record<Collection, number> = {
  categories: MAX_CATEGORIES,
  allowedTopics: MAX_ALLOWED_TOPICS,
  allowedChannels: MAX_ALLOWED_CHANNELS,
};
const COLLECTIONS = ["categories", "allowedTopics", "allowedChannels"] as const;
export const DELETION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const DELETION_PRUNE_BATCH = 100;

const remoteSettings = v.object({
  paused: v.boolean(),
  categories: v.array(v.object(categoryFields)),
  allowedTopics: v.array(v.object(topicFields)),
  allowedChannels: v.array(v.object(channelFields)),
});

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
  returns: v.union(v.null(), remoteSettings),
  handler: async (ctx) => {
    const user = await findUser(ctx);
    return user ? readAll(ctx, user._id) : null;
  },
});

export const applyChanges = mutation({
  args: {
    paused: v.optional(v.object({ value: v.boolean(), updatedAt: v.number() })),
    categories: v.array(v.object(categoryFields)),
    allowedTopics: v.array(v.object(topicFields)),
    allowedChannels: v.array(v.object(channelFields)),
    deletions: v.array(v.object({ collection: settingsCollection, itemId: v.string(), deletedAt: v.number() })),
  },
  returns: remoteSettings,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertWithinLimits(args);
    if (args.deletions.length > MAX_CATEGORIES + MAX_ALLOWED_TOPICS + MAX_ALLOWED_CHANNELS) throw new Error("too_many_deletions");
    if (args.paused) await setPaused(ctx, user._id, args.paused.value, args.paused.updatedAt);
    for (const { collection, itemId, deletedAt } of args.deletions) await deleteIfOlder(ctx, user._id, collection, itemId, deletedAt);
    const counts = new Map<Collection, number>();
    for (const collection of COLLECTIONS) counts.set(collection, (await liveItems(ctx, user._id, collection)).length);
    for (const entry of entries(args)) {
      if (await upsertIfNewer(ctx, user._id, entry, counts.get(entry.collection) ?? 0)) {
        counts.set(entry.collection, (counts.get(entry.collection) ?? 0) + 1);
      }
    }
    await pruneDeletions(ctx, user._id, Date.now());
    return readAll(ctx, user._id);
  },
});

export const replaceAll = mutation({
  args: remoteSettings.fields,
  returns: remoteSettings,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertWithinLimits(args);
    const now = Date.now();
    const incoming = entries(args);
    const kept = new Set(incoming.map(({ collection, item }) => `${collection}:${item.itemId}`));
    for (const collection of COLLECTIONS) {
      for (const doc of await liveItems(ctx, user._id, collection)) {
        if (kept.has(`${collection}:${doc.itemId}`)) continue;
        await ctx.db.delete(doc._id);
        await recordDeletion(ctx, user._id, collection, doc.itemId, now);
      }
    }
    for (const entry of incoming) {
      await clearDeletion(ctx, user._id, entry.collection, entry.item.itemId);
      await write(ctx, user._id, entry);
    }
    await setPaused(ctx, user._id, args.paused, now);
    return readAll(ctx, user._id);
  },
});

async function readAll(ctx: QueryCtx, userId: Id<"users">): Promise<Infer<typeof remoteSettings>> {
  const [meta, categories, allowedTopics, allowedChannels] = await Promise.all([
    ctx.db
      .query("settingsMeta")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
    liveItems(ctx, userId, "categories"),
    liveItems(ctx, userId, "allowedTopics"),
    liveItems(ctx, userId, "allowedChannels"),
  ]);
  return {
    paused: meta?.paused ?? false,
    categories: categories.map(({ itemId, name, description, enabled, updatedAt }) => ({ itemId, name, description, enabled, updatedAt })),
    allowedTopics: allowedTopics.map(({ itemId, description, updatedAt }) => ({ itemId, description, updatedAt })),
    allowedChannels: allowedChannels.map(({ itemId, channelKey, channelName, updatedAt }) => ({ itemId, channelKey, channelName, updatedAt })),
  };
}

function liveItems(ctx: QueryCtx, userId: Id<"users">, collection: "categories"): Promise<Doc<"categories">[]>;
function liveItems(ctx: QueryCtx, userId: Id<"users">, collection: "allowedTopics"): Promise<Doc<"allowedTopics">[]>;
function liveItems(ctx: QueryCtx, userId: Id<"users">, collection: "allowedChannels"): Promise<Doc<"allowedChannels">[]>;
function liveItems(ctx: QueryCtx, userId: Id<"users">, collection: Collection): Promise<LiveDoc[]>;
function liveItems(ctx: QueryCtx, userId: Id<"users">, collection: Collection): Promise<LiveDoc[]> {
  switch (collection) {
    case "categories":
      return ctx.db
        .query("categories")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    case "allowedTopics":
      return ctx.db
        .query("allowedTopics")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    case "allowedChannels":
      return ctx.db
        .query("allowedChannels")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
  }
}

function findItem(ctx: QueryCtx, userId: Id<"users">, collection: "categories", itemId: string): Promise<Doc<"categories"> | null>;
function findItem(ctx: QueryCtx, userId: Id<"users">, collection: "allowedTopics", itemId: string): Promise<Doc<"allowedTopics"> | null>;
function findItem(ctx: QueryCtx, userId: Id<"users">, collection: "allowedChannels", itemId: string): Promise<Doc<"allowedChannels"> | null>;
function findItem(ctx: QueryCtx, userId: Id<"users">, collection: Collection, itemId: string): Promise<LiveDoc | null>;
function findItem(ctx: QueryCtx, userId: Id<"users">, collection: Collection, itemId: string): Promise<LiveDoc | null> {
  switch (collection) {
    case "categories":
      return ctx.db
        .query("categories")
        .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("itemId", itemId))
        .unique();
    case "allowedTopics":
      return ctx.db
        .query("allowedTopics")
        .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("itemId", itemId))
        .unique();
    case "allowedChannels":
      return ctx.db
        .query("allowedChannels")
        .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("itemId", itemId))
        .unique();
  }
}

function findDeletion(ctx: QueryCtx, userId: Id<"users">, collection: Collection, itemId: string) {
  return ctx.db
    .query("settingsDeletions")
    .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("collection", collection).eq("itemId", itemId))
    .unique();
}

async function upsertIfNewer(ctx: MutationCtx, userId: Id<"users">, entry: Entry, liveCount: number): Promise<boolean> {
  const { collection, item } = entry;
  const deletion = await findDeletion(ctx, userId, collection, item.itemId);
  if (deletion && deletion.deletedAt >= item.updatedAt) return false;
  const existing = await findItem(ctx, userId, collection, item.itemId);
  if (existing && existing.updatedAt >= item.updatedAt) return false;
  if (!existing && liveCount >= LIMITS[collection]) throw new Error(`too_many_${collection}`);
  if (deletion) await ctx.db.delete(deletion._id);
  await write(ctx, userId, entry);
  return !existing;
}

async function deleteIfOlder(ctx: MutationCtx, userId: Id<"users">, collection: Collection, itemId: string, deletedAt: number) {
  const existing = await findItem(ctx, userId, collection, itemId);
  if (existing && existing.updatedAt > deletedAt) return;
  if (existing) await ctx.db.delete(existing._id);
  await recordDeletion(ctx, userId, collection, itemId, deletedAt);
}

async function write(ctx: MutationCtx, userId: Id<"users">, entry: Entry) {
  switch (entry.collection) {
    case "categories": {
      const existing = await findItem(ctx, userId, "categories", entry.item.itemId);
      if (existing) await ctx.db.replace(existing._id, { ...entry.item, userId });
      else await ctx.db.insert("categories", { ...entry.item, userId });
      return;
    }
    case "allowedTopics": {
      const existing = await findItem(ctx, userId, "allowedTopics", entry.item.itemId);
      if (existing) await ctx.db.replace(existing._id, { ...entry.item, userId });
      else await ctx.db.insert("allowedTopics", { ...entry.item, userId });
      return;
    }
    case "allowedChannels": {
      const existing = await findItem(ctx, userId, "allowedChannels", entry.item.itemId);
      if (existing) await ctx.db.replace(existing._id, { ...entry.item, userId });
      else await ctx.db.insert("allowedChannels", { ...entry.item, userId });
      return;
    }
  }
}

function entries(args: { [C in Collection]: ItemOf<C>[] }): Entry[] {
  return [
    ...args.categories.map((item) => ({ collection: "categories" as const, item })),
    ...args.allowedTopics.map((item) => ({ collection: "allowedTopics" as const, item })),
    ...args.allowedChannels.map((item) => ({ collection: "allowedChannels" as const, item })),
  ];
}

async function recordDeletion(ctx: MutationCtx, userId: Id<"users">, collection: Collection, itemId: string, deletedAt: number) {
  const existing = await findDeletion(ctx, userId, collection, itemId);
  if (!existing) await ctx.db.insert("settingsDeletions", { userId, collection, itemId, deletedAt });
  else if (existing.deletedAt < deletedAt) await ctx.db.patch(existing._id, { deletedAt });
}

async function clearDeletion(ctx: MutationCtx, userId: Id<"users">, collection: Collection, itemId: string) {
  const existing = await findDeletion(ctx, userId, collection, itemId);
  if (existing) await ctx.db.delete(existing._id);
}

async function pruneDeletions(ctx: MutationCtx, userId: Id<"users">, now: number) {
  const old = await ctx.db
    .query("settingsDeletions")
    .withIndex("by_user_deletedAt", (q) => q.eq("userId", userId).lt("deletedAt", now - DELETION_TTL_MS))
    .take(DELETION_PRUNE_BATCH);
  for (const doc of old) await ctx.db.delete(doc._id);
}

async function setPaused(ctx: MutationCtx, userId: Id<"users">, paused: boolean, updatedAt: number) {
  const meta = await ctx.db
    .query("settingsMeta")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!meta) await ctx.db.insert("settingsMeta", { userId, paused, updatedAt });
  else if (meta.updatedAt <= updatedAt) await ctx.db.patch(meta._id, { paused, updatedAt });
}

function assertWithinLimits(args: { [C in Collection]: ItemOf<C>[] }) {
  for (const collection of COLLECTIONS) {
    if (args[collection].length > LIMITS[collection]) throw new Error(`too_many_${collection}`);
  }
  for (const item of [...args.categories, ...args.allowedTopics]) {
    if (item.description.length > MAX_DESCRIPTION_CHARS) throw new Error("description_too_long");
  }
}
