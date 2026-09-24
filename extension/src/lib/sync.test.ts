import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { defaultSettings, type Settings } from "@content-clam/shared";
import { adoptRemoteSettings, pushIfSyncing, syncChoiceFor, uploadLocalSettings } from "./sync";
import { writeSettings } from "./storage";
import type { RemoteSettings } from "./hosted";

const hosted = vi.hoisted(() => ({
  sessionInfo: vi.fn<() => Promise<{ signedIn: boolean; userId?: string; email?: string }>>(),
  ensureAccount: vi.fn(async () => ({ balance: 0, trialGranted: true, created: false })),
  fetchRemoteSettings: vi.fn<() => Promise<RemoteSettings | null>>(),
  replaceRemoteSettings: vi.fn(async (_settings: Settings) => undefined),
  pushSettingsChanges: vi.fn(async (_previous: Settings | null, _next: Settings) => undefined),
}));
vi.mock("./hosted", async (importOriginal) => ({ ...(await importOriginal<typeof import("./hosted")>()), ...hosted }));
vi.mock("./env", () => ({ env: {}, hostedModeAvailable: true }));

const signedInAs = (userId: string) => hosted.sessionInfo.mockResolvedValue({ signedIn: true, userId, email: `${userId}@x.y` });

function withTopic(settings: Settings, id: string): Settings {
  return { ...settings, allowedTopics: [...settings.allowedTopics, { id, description: id, updatedAt: 1 }] };
}

beforeEach(() => {
  fakeBrowser.reset();
  for (const fn of Object.values(hosted)) fn.mockClear();
  hosted.fetchRemoteSettings.mockResolvedValue(null);
});

describe("account-scoped sync", () => {
  it("does not upload edits for an account that has not chosen sync", async () => {
    signedInAs("user_a");
    await uploadLocalSettings();
    expect(await syncChoiceFor("user_a")).toBe("asked");

    signedInAs("user_b");
    expect(await syncChoiceFor("user_b")).toBe("unasked");
    await pushIfSyncing(withTopic(defaultSettings(), "t1"));
    expect(hosted.pushSettingsChanges).not.toHaveBeenCalled();
  });

  it("keeps a separate baseline per account", async () => {
    const base = defaultSettings();
    signedInAs("user_a");
    await writeSettings(withTopic(base, "a1"));
    await uploadLocalSettings();

    signedInAs("user_b");
    await writeSettings(base);
    await uploadLocalSettings();
    const next = withTopic(base, "b1");
    await pushIfSyncing(next);
    expect(hosted.pushSettingsChanges).toHaveBeenCalledTimes(1);
    const [previous] = hosted.pushSettingsChanges.mock.calls[0]!;
    expect(previous!.allowedTopics.map((t) => t.id)).toEqual([]);

    signedInAs("user_a");
    await pushIfSyncing(withTopic(base, "a1"));
    const [previousA] = hosted.pushSettingsChanges.mock.calls[1]!;
    expect(previousA!.allowedTopics.map((t) => t.id)).toEqual(["a1"]);
  });

  it("records the choice for the account that adopted remote settings", async () => {
    signedInAs("user_a");
    hosted.fetchRemoteSettings.mockResolvedValue({ paused: false, categories: [], allowedTopics: [{ itemId: "r1", description: "remote", updatedAt: 1 }], allowedChannels: [] });
    const settings = await adoptRemoteSettings();
    expect(settings.allowedTopics.map((t) => t.id)).toEqual(["r1"]);
    expect(await syncChoiceFor("user_a")).toBe("asked");
    expect(await syncChoiceFor("user_b")).toBe("unasked");
  });

  it("refuses to sync without an identified account", async () => {
    hosted.sessionInfo.mockResolvedValue({ signedIn: true });
    await expect(uploadLocalSettings()).rejects.toThrow(/sign in/i);
    await pushIfSyncing(defaultSettings());
    expect(hosted.pushSettingsChanges).not.toHaveBeenCalled();
  });
});
