import type { Settings } from "@content-clam/shared";
import { serialQueue } from "@content-clam/shared";
import { hostedModeAvailable } from "./env";
import { ensureAccount, fetchRemoteSettings, fromRemote, replaceRemoteSettings, sendSettingsChanges, sessionInfo, type RemoteSettings } from "./hosted";
import { updateSettings } from "./settings";
import { applyChanges, diffSettings, hasChanges, keepEarlierStamps } from "./settingsDiff";
import { readSettings, syncAccountsItem, type SyncAccount } from "./storage";

export const RETRY_ALARM = "settings-sync-retry";
const MAX_RETRY_MINUTES = 30;

const syncWork = serialQueue();

export interface SyncState {
  choice: "asked" | "unasked";
  error?: string;
}

export async function syncStateFor(userId: string | undefined): Promise<SyncState> {
  const account = userId ? (await syncAccountsItem.getValue())[userId] : undefined;
  return account ? { choice: "asked", error: account.error } : { choice: "unasked" };
}

export function startSettingsSync() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETRY_ALARM) void syncSettings();
  });
  void syncAccountsItem.getValue().then((accounts) => {
    if (Object.values(accounts).some((account) => account.error)) void syncSettings();
  });
}

export async function adoptRemoteSettings(): Promise<Settings> {
  const userId = await requireUserId();
  await ensureAccount();
  return syncWork(async () => {
    const remote = await fetchRemoteSettings();
    if (remote && hasItems(remote)) {
      const settings = await updateSettings((local) => fromRemote(remote, local));
      await saveAccount(userId, { baseline: settings });
      return settings;
    }
    const local = await readSettings();
    await saveAccount(userId, { baseline: fromRemote(await replaceRemoteSettings(local), local) });
    return local;
  });
}

export async function uploadLocalSettings(): Promise<void> {
  const userId = await requireUserId();
  await ensureAccount();
  await syncWork(async () => {
    const local = await readSettings();
    await saveAccount(userId, { baseline: fromRemote(await replaceRemoteSettings(local), local) });
  });
}

export function syncSettings(): Promise<void> {
  if (!hostedModeAvailable) return Promise.resolve();
  return syncWork(async () => {
    const session = await sessionInfo();
    if (!session.signedIn || !session.userId) return;
    const userId = session.userId;
    const account = (await syncAccountsItem.getValue())[userId];
    if (!account) return;
    const sent = await readSettings();
    const changes = keepEarlierStamps(diffSettings(account.baseline, sent, Date.now()), account.unsent);
    if (!hasChanges(changes)) {
      if (account.error || account.unsent) await saveAccount(userId, { baseline: account.baseline });
      return;
    }
    try {
      const remote = await sendSettingsChanges(changes, userId);
      if ((await sessionInfo()).userId !== userId) {
        await saveAccount(userId, { ...account, unsent: changes });
        return;
      }
      await updateSettings((current) => applyChanges(fromRemote(remote, current), diffSettings(sent, current, Date.now())));
      await saveAccount(userId, { baseline: fromRemote(remote, sent) });
      await chrome.alarms.clear(RETRY_ALARM);
    } catch (error) {
      const failures = (account.failures ?? 0) + 1;
      await saveAccount(userId, { ...account, unsent: changes, failures, error: error instanceof Error ? error.message : String(error) });
      await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: Math.min(2 ** (failures - 1), MAX_RETRY_MINUTES) });
    }
  });
}

async function requireUserId(): Promise<string> {
  const session = await sessionInfo();
  if (!session.signedIn || !session.userId) throw new Error("Sign in to sync settings.");
  return session.userId;
}

async function saveAccount(userId: string, account: SyncAccount) {
  const accounts = { ...(await syncAccountsItem.getValue()) };
  accounts[userId] = account;
  await syncAccountsItem.setValue(accounts);
}

function hasItems(remote: RemoteSettings): boolean {
  return remote.categories.length + remote.allowedTopics.length + remote.allowedChannels.length > 0;
}
