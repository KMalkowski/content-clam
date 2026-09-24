import type { Settings } from "@content-clam/shared";
import { serialQueue } from "@content-clam/shared";
import { hostedModeAvailable } from "./env";
import { ensureAccount, fetchRemoteSettings, fromRemote, pushSettingsChanges, replaceRemoteSettings, sessionInfo, type RemoteSettings } from "./hosted";
import { readSettings, syncAccountsItem, writeSettings } from "./storage";

const syncWrites = serialQueue();

export async function syncChoiceFor(userId: string | undefined): Promise<"asked" | "unasked"> {
  if (!userId) return "unasked";
  return userId in (await syncAccountsItem.getValue()) ? "asked" : "unasked";
}

export async function adoptRemoteSettings(): Promise<Settings> {
  const userId = await requireUserId();
  await ensureAccount();
  const remote = await fetchRemoteSettings();
  const local = await readSettings();
  if (remote && hasItems(remote)) {
    const settings = await writeSettings({ ...fromRemote(remote), hideShorts: local.hideShorts, keepSubscribed: local.keepSubscribed });
    await setBaseline(userId, settings);
    return settings;
  }
  await syncWrites(async () => {
    await replaceRemoteSettings(local);
    await setBaseline(userId, local);
  });
  return local;
}

export async function uploadLocalSettings(): Promise<void> {
  const userId = await requireUserId();
  await ensureAccount();
  const settings = await readSettings();
  await syncWrites(async () => {
    await replaceRemoteSettings(settings);
    await setBaseline(userId, settings);
  });
}

export async function pushIfSyncing(settings: Settings): Promise<void> {
  if (!hostedModeAvailable) return;
  const session = await sessionInfo();
  if (!session.signedIn || !session.userId) return;
  const userId = session.userId;
  await syncWrites(async () => {
    const account = (await syncAccountsItem.getValue())[userId];
    if (!account) return;
    await pushSettingsChanges(account.baseline, settings);
    await setBaseline(userId, settings);
  }).catch(() => undefined);
}

async function requireUserId(): Promise<string> {
  const session = await sessionInfo();
  if (!session.signedIn || !session.userId) throw new Error("Sign in to sync settings.");
  return session.userId;
}

async function setBaseline(userId: string, baseline: Settings) {
  const accounts = { ...(await syncAccountsItem.getValue()) };
  accounts[userId] = { baseline };
  await syncAccountsItem.setValue(accounts);
}

function hasItems(remote: RemoteSettings): boolean {
  return remote.categories.length + remote.allowedTopics.length + remote.allowedChannels.length > 0;
}
