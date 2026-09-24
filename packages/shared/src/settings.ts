import { BUILT_IN_CATEGORIES } from "./categories";
import { MAX_ALLOWED_CHANNELS, MAX_ALLOWED_TOPICS, MAX_CATEGORIES, MAX_DESCRIPTION_CHARS } from "./limits";

export interface Category {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  updatedAt: number;
}

export interface AllowedTopic {
  id: string;
  description: string;
  updatedAt: number;
}

export interface AllowedChannel {
  id: string;
  channelKey: string;
  channelName: string;
  updatedAt: number;
}

export interface Settings {
  paused: boolean;
  hideShorts: boolean;
  keepSubscribed: boolean;
  categories: Category[];
  allowedTopics: AllowedTopic[];
  allowedChannels: AllowedChannel[];
}

export function defaultSettings(now = Date.now()): Settings {
  return {
    paused: false,
    hideShorts: false,
    keepSubscribed: true,
    categories: BUILT_IN_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      enabled: true,
      updatedAt: now,
    })),
    allowedTopics: [],
    allowedChannels: [],
  };
}

export function enabledCategories(settings: Settings): Category[] {
  return settings.categories.filter((c) => c.enabled && c.description.trim().length > 0);
}

export function normalizeChannelKey(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function isChannelAllowed(settings: Settings, channelKey: string | undefined): boolean {
  if (!channelKey) return false;
  const key = normalizeChannelKey(channelKey);
  return settings.allowedChannels.some((c) => c.channelKey === key);
}

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}

export function parseSettings(input: unknown, now = Date.now()): Settings {
  const fail = (message: string): never => {
    throw new InvalidSettingsError(message);
  };
  if (!isRecord(input)) return fail("Settings must be an object.");
  const categories = readList(input.categories, "categories", MAX_CATEGORIES, fail);
  const allowedTopics = readList(input.allowedTopics ?? [], "allowedTopics", MAX_ALLOWED_TOPICS, fail);
  const allowedChannels = readList(input.allowedChannels ?? [], "allowedChannels", MAX_ALLOWED_CHANNELS, fail);
  const settings: Settings = {
    paused: input.paused === undefined ? false : readBoolean(input.paused, "paused", fail),
    hideShorts: input.hideShorts === undefined ? false : readBoolean(input.hideShorts, "hideShorts", fail),
    keepSubscribed: input.keepSubscribed === undefined ? true : readBoolean(input.keepSubscribed, "keepSubscribed", fail),
    categories: categories.map((raw, i) => ({
      id: readId(raw.id, `categories[${i}].id`, fail),
      name: readText(raw.name, `categories[${i}].name`, 200, fail),
      description: readText(raw.description, `categories[${i}].description`, MAX_DESCRIPTION_CHARS, fail),
      enabled: raw.enabled === undefined ? true : readBoolean(raw.enabled, `categories[${i}].enabled`, fail),
      updatedAt: readTime(raw.updatedAt, now),
    })),
    allowedTopics: allowedTopics.map((raw, i) => ({
      id: readId(raw.id, `allowedTopics[${i}].id`, fail),
      description: readText(raw.description, `allowedTopics[${i}].description`, MAX_DESCRIPTION_CHARS, fail),
      updatedAt: readTime(raw.updatedAt, now),
    })),
    allowedChannels: allowedChannels.map((raw, i) => {
      const channelKey = normalizeChannelKey(readText(raw.channelKey, `allowedChannels[${i}].channelKey`, 200, fail));
      if (!channelKey) fail(`allowedChannels[${i}].channelKey is empty.`);
      return {
        id: readId(raw.id, `allowedChannels[${i}].id`, fail),
        channelKey,
        channelName: raw.channelName === undefined ? channelKey : readText(raw.channelName, `allowedChannels[${i}].channelName`, 200, fail),
        updatedAt: readTime(raw.updatedAt, now),
      };
    }),
  };
  for (const [name, items] of [
    ["categories", settings.categories],
    ["allowedTopics", settings.allowedTopics],
    ["allowedChannels", settings.allowedChannels],
  ] as const) {
    if (new Set(items.map((item) => item.id)).size !== items.length) fail(`${name} contains duplicate ids.`);
  }
  return settings;
}

export function sanitizeSettings(input: unknown): Settings | null {
  try {
    return parseSettings(input);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readList(value: unknown, name: string, max: number, fail: (m: string) => never): Record<string, unknown>[] {
  if (!Array.isArray(value)) fail(`${name} must be a list.`);
  const list = value as unknown[];
  if (list.length > max) fail(`${name} holds at most ${max} items.`);
  return list.map((item, i) => (isRecord(item) ? item : fail(`${name}[${i}] must be an object.`)));
}

function readBoolean(value: unknown, name: string, fail: (m: string) => never): boolean {
  return typeof value === "boolean" ? value : fail(`${name} must be true or false.`);
}

function readText(value: unknown, name: string, max: number, fail: (m: string) => never): string {
  if (typeof value !== "string") fail(`${name} must be text.`);
  const text = value as string;
  if (text.length > max) fail(`${name} is longer than ${max} characters.`);
  return text;
}

function readId(value: unknown, name: string, fail: (m: string) => never): string {
  const id = readText(value, name, 200, fail);
  return id.trim().length > 0 ? id : fail(`${name} is empty.`);
}

function readTime(value: unknown, now: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : now;
}
