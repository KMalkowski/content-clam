import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { BUILT_IN_CATEGORIES, defaultSettings } from "@content-clam/shared";
import { applySettingsChange, changeSettings } from "./settings";
import { readSettings } from "./storage";

beforeEach(() => fakeBrowser.reset());

describe("settings changes", () => {
  it("applies concurrent changes from different views without losing either", async () => {
    await Promise.all([
      changeSettings({ type: "addTopic", description: "woodworking" }),
      changeSettings({ type: "allowChannel", channel: "@SomeChannel" }),
      changeSettings({ type: "setFlag", flag: "hideShorts", value: true }),
    ]);
    const settings = await readSettings();
    expect(settings.allowedTopics.map((t) => t.description)).toEqual(["woodworking"]);
    expect(settings.allowedChannels.map((c) => c.channelKey)).toEqual(["somechannel"]);
    expect(settings.hideShorts).toBe(true);
  });

  it("stamps edited items with the edit time", () => {
    const base = defaultSettings(1);
    const id = BUILT_IN_CATEGORIES[0]!.id;
    const edited = applySettingsChange(base, { type: "editCategory", id, patch: { enabled: false } }, 50);
    expect(edited.categories.find((c) => c.id === id)).toMatchObject({ enabled: false, updatedAt: 50 });
    expect(edited.categories.filter((c) => c.updatedAt === 50)).toHaveLength(1);
  });

  it("does not add the same channel twice", () => {
    const once = applySettingsChange(defaultSettings(), { type: "allowChannel", channel: "@Chan" });
    const twice = applySettingsChange(once, { type: "allowChannel", channel: "chan" });
    expect(twice.allowedChannels).toHaveLength(1);
  });

  it("rejects invalid imports and leaves stored settings alone", async () => {
    await changeSettings({ type: "addTopic", description: "kept" });
    await expect(changeSettings({ type: "replaceAll", settings: { categories: "nope" } })).rejects.toThrow(/categories/);
    expect((await readSettings()).allowedTopics.map((t) => t.description)).toEqual(["kept"]);
  });
});
