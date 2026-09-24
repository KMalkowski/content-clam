import { describe, expect, it } from "vitest";
import { defaultSettings, parseSettings, sanitizeSettings } from "./settings";

describe("parseSettings", () => {
  it("accepts an exported settings file", () => {
    const settings = defaultSettings(5);
    expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  it("rejects categories without required fields", () => {
    expect(() => parseSettings({ categories: [{}], allowedTopics: [], allowedChannels: [] })).toThrow(/categories\[0\]\.id/);
    expect(sanitizeSettings({ categories: [{}] })).toBeNull();
  });

  it("rejects duplicate ids and missing lists", () => {
    const c = { id: "a", name: "A", description: "", enabled: true, updatedAt: 1 };
    expect(() => parseSettings({ categories: [c, c] })).toThrow(/duplicate/);
    expect(() => parseSettings({})).toThrow(/categories must be a list/);
  });

  it("fills optional fields and normalizes channel keys", () => {
    const parsed = parseSettings(
      { categories: [{ id: "x", name: "X", description: "d" }], allowedChannels: [{ id: "c", channelKey: "@Some Channel " }] },
      42,
    );
    expect(parsed.paused).toBe(false);
    expect(parsed.keepSubscribed).toBe(true);
    expect(parsed.categories[0]).toEqual({ id: "x", name: "X", description: "d", enabled: true, updatedAt: 42 });
    expect(parsed.allowedChannels[0]).toMatchObject({ channelKey: "some channel", channelName: "some channel" });
  });
});
