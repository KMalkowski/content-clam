import type { AllowedChannel, AllowedTopic, Category, Settings } from "@content-clam/shared";

export type SyncedCollection = "categories" | "allowedTopics" | "allowedChannels";

export interface SettingsChanges {
  paused?: { value: boolean; updatedAt: number };
  categories: Category[];
  allowedTopics: AllowedTopic[];
  allowedChannels: AllowedChannel[];
  deletions: { collection: SyncedCollection; id: string; deletedAt: number }[];
}

const COLLECTIONS: SyncedCollection[] = ["categories", "allowedTopics", "allowedChannels"];

export function diffSettings(before: Settings, after: Settings, now: number): SettingsChanges {
  const changes: SettingsChanges = {
    categories: changedItems(before.categories, after.categories),
    allowedTopics: changedItems(before.allowedTopics, after.allowedTopics),
    allowedChannels: changedItems(before.allowedChannels, after.allowedChannels),
    deletions: [],
  };
  if (before.paused !== after.paused) changes.paused = { value: after.paused, updatedAt: now };
  for (const collection of COLLECTIONS) {
    const kept = new Set(after[collection].map((item) => item.id));
    for (const item of before[collection]) if (!kept.has(item.id)) changes.deletions.push({ collection, id: item.id, deletedAt: now });
  }
  return changes;
}

export function applyChanges(base: Settings, changes: SettingsChanges): Settings {
  const deleted = (collection: SyncedCollection) => new Set(changes.deletions.filter((d) => d.collection === collection).map((d) => d.id));
  return {
    ...base,
    paused: changes.paused?.value ?? base.paused,
    categories: withChanges(base.categories, changes.categories, deleted("categories")),
    allowedTopics: withChanges(base.allowedTopics, changes.allowedTopics, deleted("allowedTopics")),
    allowedChannels: withChanges(base.allowedChannels, changes.allowedChannels, deleted("allowedChannels")),
  };
}

export function keepEarlierStamps(changes: SettingsChanges, earlier: SettingsChanges | undefined): SettingsChanges {
  if (!earlier) return changes;
  const deletedAt = new Map(earlier.deletions.map((d) => [`${d.collection}:${d.id}`, d.deletedAt]));
  const paused = changes.paused && earlier.paused?.value === changes.paused.value ? earlier.paused : changes.paused;
  return {
    ...changes,
    ...(paused ? { paused } : {}),
    deletions: changes.deletions.map((d) => ({ ...d, deletedAt: deletedAt.get(`${d.collection}:${d.id}`) ?? d.deletedAt })),
  };
}

export function hasChanges(changes: SettingsChanges): boolean {
  return Boolean(changes.paused) || changes.deletions.length > 0 || COLLECTIONS.some((collection) => changes[collection].length > 0);
}

function changedItems<T extends { id: string }>(before: T[], after: T[]): T[] {
  const previous = new Map(before.map((item) => [item.id, item]));
  return after.filter((item) => {
    const old = previous.get(item.id);
    return !old || !sameFields(old, item);
  });
}

function withChanges<T extends { id: string }>(base: T[], upserts: T[], deleted: Set<string>): T[] {
  const byId = new Map(upserts.map((item) => [item.id, item]));
  const merged = base.filter((item) => !deleted.has(item.id)).map((item) => byId.get(item.id) ?? item);
  const present = new Set(merged.map((item) => item.id));
  return [...merged, ...upserts.filter((item) => !present.has(item.id))];
}

function sameFields<T extends object>(a: T, b: T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof T>;
  return [...keys].every((key) => a[key] === b[key]);
}
