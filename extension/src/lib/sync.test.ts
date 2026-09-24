import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { defaultSettings, type Settings } from "@content-clam/shared";
import { adoptRemoteSettings, RETRY_ALARM, syncSettings, syncStateFor, uploadLocalSettings } from "./sync";
import { readSettings, settingsItem } from "./storage";
import { updateSettings } from "./settings";
import type { RemoteSettings } from "./hosted";
import type { SettingsChanges } from "./settingsDiff";

const hosted = vi.hoisted(() => ({
  sessionInfo: vi.fn<() => Promise<{ signedIn: boolean; userId?: string; email?: string }>>(),
  ensureAccount: vi.fn(async () => ({ balance: 0, trialGranted: true, created: false })),
  fetchRemoteSettings: vi.fn<() => Promise<RemoteSettings | null>>(),
  replaceRemoteSettings: vi.fn<(settings: Settings) => Promise<RemoteSettings>>(),
  sendSettingsChanges: vi.fn<(changes: SettingsChanges) => Promise<RemoteSettings>>(),
}));
vi.mock("./hosted", async (importOriginal) => ({ ...(await importOriginal<typeof import("./hosted")>()), ...hosted }));
vi.mock("./env", () => ({ env: {}, hostedModeAvailable: true }));

const signedInAs = (userId: string) => hosted.sessionInfo.mockResolvedValue({ signedIn: true, userId, email: `${userId}@x.y` });

function remote(settings: Settings): RemoteSettings {
  const withItemId = <T extends { id: string }>({ id, ...rest }: T) => ({ itemId: id, ...rest });
  return {
    paused: settings.paused,
    categories: settings.categories.map(withItemId),
    allowedTopics: settings.allowedTopics.map(withItemId),
    allowedChannels: settings.allowedChannels.map(withItemId),
  };
}

function withTopic(settings: Settings, id: string, description = id, updatedAt = 1): Settings {
  return { ...settings, allowedTopics: [...settings.allowedTopics.filter((t) => t.id !== id), { id, description, updatedAt }] };
}

const topicIds = (settings: Settings) => settings.allowedTopics.map((t) => t.id);

beforeEach(() => {
  fakeBrowser.reset();
  for (const fn of Object.values(hosted)) fn.mockReset();
  hosted.ensureAccount.mockResolvedValue({ balance: 0, trialGranted: true, created: false });
  hosted.fetchRemoteSettings.mockResolvedValue(null);
  hosted.replaceRemoteSettings.mockImplementation(async (settings) => remote(settings));
  hosted.sendSettingsChanges.mockImplementation(async () => remote(await readSettings()));
});

describe("account-scoped sync", () => {
  it("does not upload edits for an account that has not chosen sync", async () => {
    signedInAs("user_a");
    await uploadLocalSettings();
    expect((await syncStateFor("user_a")).choice).toBe("asked");

    signedInAs("user_b");
    expect((await syncStateFor("user_b")).choice).toBe("unasked");
    await settingsItem.setValue(withTopic(defaultSettings(), "t1"));
    await syncSettings();
    expect(hosted.sendSettingsChanges).not.toHaveBeenCalled();
  });

  it("sends only the changes since each account's last sync", async () => {
    const base = defaultSettings();
    signedInAs("user_a");
    await settingsItem.setValue(withTopic(base, "a1"));
    await uploadLocalSettings();

    signedInAs("user_b");
    await settingsItem.setValue(base);
    await uploadLocalSettings();
    await settingsItem.setValue(withTopic(base, "b1"));
    await syncSettings();
    const [forB] = hosted.sendSettingsChanges.mock.calls[0]!;
    expect(forB.allowedTopics.map((t) => t.id)).toEqual(["b1"]);
    expect(forB.deletions).toEqual([]);

    signedInAs("user_a");
    await syncSettings();
    const [forA] = hosted.sendSettingsChanges.mock.calls[1]!;
    expect(forA.allowedTopics.map((t) => t.id)).toEqual(["b1"]);
    expect(forA.deletions).toEqual([expect.objectContaining({ collection: "allowedTopics", id: "a1" })]);
  });

  it("records the choice for the account that adopted remote settings", async () => {
    signedInAs("user_a");
    hosted.fetchRemoteSettings.mockResolvedValue({
      paused: false,
      categories: [],
      allowedTopics: [{ itemId: "r1", description: "remote", updatedAt: 1 }],
      allowedChannels: [],
    });
    const settings = await adoptRemoteSettings();
    expect(topicIds(settings)).toEqual(["r1"]);
    expect((await syncStateFor("user_a")).choice).toBe("asked");
    expect((await syncStateFor("user_b")).choice).toBe("unasked");
  });

  it("refuses to sync without an identified account", async () => {
    hosted.sessionInfo.mockResolvedValue({ signedIn: true });
    await expect(uploadLocalSettings()).rejects.toThrow(/sign in/i);
    await syncSettings();
    expect(hosted.sendSettingsChanges).not.toHaveBeenCalled();
  });
});

describe("sync results", () => {
  beforeEach(async () => {
    signedInAs("user_a");
    await settingsItem.setValue(defaultSettings());
    await uploadLocalSettings();
  });

  it("keeps the account's newer version when the server rejects a stale edit", async () => {
    await settingsItem.setValue(withTopic(defaultSettings(), "t1", "local", 5));
    hosted.sendSettingsChanges.mockResolvedValue(remote(withTopic(defaultSettings(), "t1", "from another device", 9)));
    await syncSettings();
    expect((await readSettings()).allowedTopics).toEqual([{ id: "t1", description: "from another device", updatedAt: 9 }]);
  });

  it("keeps edits made while an upload was in flight", async () => {
    await settingsItem.setValue(withTopic(defaultSettings(), "t1"));
    hosted.sendSettingsChanges.mockImplementation(async () => {
      const sent = await readSettings();
      await updateSettings((current) => withTopic(current, "t2"));
      return remote(sent);
    });
    await syncSettings();
    expect(topicIds(await readSettings())).toEqual(["t1", "t2"]);
    hosted.sendSettingsChanges.mockImplementation(async () => remote(await readSettings()));
    await syncSettings();
    expect(hosted.sendSettingsChanges.mock.calls[1]![0].allowedTopics.map((t) => t.id)).toEqual(["t2"]);
  });

  it("records a failed upload and retries it later", async () => {
    await settingsItem.setValue(withTopic(defaultSettings(), "t1"));
    hosted.sendSettingsChanges.mockRejectedValueOnce(new Error("offline"));
    await syncSettings();
    expect(await syncStateFor("user_a")).toEqual({ choice: "asked", error: "offline" });
    expect(await chrome.alarms.get(RETRY_ALARM)).toBeDefined();

    await syncSettings();
    expect(hosted.sendSettingsChanges).toHaveBeenCalledTimes(2);
    expect(hosted.sendSettingsChanges.mock.calls[1]![0].allowedTopics.map((t) => t.id)).toEqual(["t1"]);
    expect(await syncStateFor("user_a")).toEqual({ choice: "asked" });
    expect(await chrome.alarms.get(RETRY_ALARM)).toBeUndefined();
  });
});
