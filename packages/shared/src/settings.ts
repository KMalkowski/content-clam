import { BUILT_IN_CATEGORIES } from "./categories";

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
  categories: Category[];
  allowedTopics: AllowedTopic[];
  allowedChannels: AllowedChannel[];
}

export function defaultSettings(now = Date.now()): Settings {
  return {
    paused: false,
    hideShorts: false,
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
