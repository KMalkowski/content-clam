import { BUILT_IN_CATEGORIES, normalizeChannelKey, parseSettings, serialQueue, type Category, type Settings } from "@content-clam/shared";
import { readSettings, settingsItem } from "./storage";

export type SettingsFlag = "paused" | "hideShorts" | "keepSubscribed";

export type SettingsChange =
  | { type: "setFlag"; flag: SettingsFlag; value: boolean }
  | { type: "addCategory"; name: string; description: string }
  | { type: "editCategory"; id: string; patch: Partial<Pick<Category, "name" | "description" | "enabled">> }
  | { type: "resetCategory"; id: string }
  | { type: "removeCategory"; id: string }
  | { type: "restoreCategory"; category: Category; index: number }
  | { type: "addTopic"; description: string }
  | { type: "editTopic"; id: string; description: string }
  | { type: "removeTopic"; id: string }
  | { type: "allowChannel"; channel: string; channelName?: string }
  | { type: "removeChannel"; id: string }
  | { type: "replaceAll"; settings: unknown };

const settingsWrites = serialQueue();

export function changeSettings(change: SettingsChange): Promise<Settings> {
  return updateSettings((current) => applySettingsChange(current, change));
}

export function updateSettings(update: (current: Settings) => Settings): Promise<Settings> {
  return settingsWrites(async () => {
    const next = parseSettings(update(await readSettings()));
    await settingsItem.setValue(next);
    return next;
  });
}

export function applySettingsChange(settings: Settings, change: SettingsChange, now = Date.now(), newId = () => crypto.randomUUID()): Settings {
  const editCategory = (id: string, patch: Partial<Category>) => ({
    ...settings,
    categories: settings.categories.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now } : c)),
  });
  switch (change.type) {
    case "setFlag":
      return { ...settings, [change.flag]: change.value };
    case "addCategory":
      return {
        ...settings,
        categories: [...settings.categories, { id: newId(), name: change.name, description: change.description, enabled: true, updatedAt: now }],
      };
    case "editCategory":
      return editCategory(change.id, change.patch);
    case "resetCategory": {
      const builtIn = BUILT_IN_CATEGORIES.find((c) => c.id === change.id);
      return builtIn ? editCategory(change.id, { name: builtIn.name, description: builtIn.description }) : settings;
    }
    case "removeCategory":
      return { ...settings, categories: settings.categories.filter((c) => c.id !== change.id) };
    case "restoreCategory": {
      if (settings.categories.some((c) => c.id === change.category.id)) return settings;
      const categories = [...settings.categories];
      categories.splice(Math.min(change.index, categories.length), 0, { ...change.category, updatedAt: now });
      return { ...settings, categories };
    }
    case "addTopic":
      return { ...settings, allowedTopics: [...settings.allowedTopics, { id: newId(), description: change.description, updatedAt: now }] };
    case "editTopic":
      return {
        ...settings,
        allowedTopics: settings.allowedTopics.map((t) => (t.id === change.id ? { ...t, description: change.description, updatedAt: now } : t)),
      };
    case "removeTopic":
      return { ...settings, allowedTopics: settings.allowedTopics.filter((t) => t.id !== change.id) };
    case "allowChannel": {
      const channelKey = normalizeChannelKey(change.channel);
      if (!channelKey || settings.allowedChannels.some((c) => c.channelKey === channelKey)) return settings;
      const channelName = change.channelName?.trim() || change.channel.trim();
      return { ...settings, allowedChannels: [...settings.allowedChannels, { id: newId(), channelKey, channelName, updatedAt: now }] };
    }
    case "removeChannel":
      return { ...settings, allowedChannels: settings.allowedChannels.filter((c) => c.id !== change.id) };
    case "replaceAll": {
      const imported = parseSettings(change.settings, now);
      const stamp = <T extends { updatedAt: number }>(items: T[]) => items.map((item) => ({ ...item, updatedAt: now }));
      return {
        ...imported,
        categories: stamp(imported.categories),
        allowedTopics: stamp(imported.allowedTopics),
        allowedChannels: stamp(imported.allowedChannels),
      };
    }
  }
}
