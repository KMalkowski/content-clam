import { defineBackground } from "wxt/utils/define-background";
import { analyzeVideos } from "../lib/analyzer";
import type { BackgroundRequest, BackgroundResponse, Status } from "../lib/messages";
import { fundingModeItem, personalKeyItem, revealedItem, settingsItem, syncChoiceItem } from "../lib/storage";
import { env, hostedModeAvailable } from "../lib/env";
import { ensureAccount, fetchAccount, fetchRemoteSettings, fromRemote, pushSettings, sessionInfo } from "../lib/hosted";

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
    handle(request)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ type: "error", message: error instanceof Error ? error.message : String(error) }));
    return true;
  });
});

async function handle(request: BackgroundRequest): Promise<BackgroundResponse> {
  switch (request.type) {
    case "analyze":
      return { type: "analysis", outcomes: await analyzeVideos(request.videos) };
    case "getSettings":
      return { type: "settings", settings: await settingsItem.getValue() };
    case "updateSettings": {
      await settingsItem.setValue(request.settings);
      void pushIfSyncing(request);
      return { type: "ok" };
    }
    case "getStatus":
      return { type: "status", status: await status() };
    case "setFundingMode":
      await fundingModeItem.setValue(request.mode);
      return { type: "ok" };
    case "setPersonalKey":
      await personalKeyItem.setValue(request.key);
      return { type: "ok" };
    case "revealVideo": {
      const revealed = await revealedItem.getValue();
      revealed[request.videoId] = Date.now();
      await revealedItem.setValue(revealed);
      return { type: "ok" };
    }
    case "syncFromServer": {
      await ensureAccount();
      const remote = await fetchRemoteSettings();
      if (remote) await settingsItem.setValue(fromRemote(remote));
      await syncChoiceItem.setValue("asked");
      return { type: "settings", settings: await settingsItem.getValue() };
    }
    case "pushSettingsToServer": {
      await ensureAccount();
      await pushSettings(await settingsItem.getValue());
      await syncChoiceItem.setValue("asked");
      return { type: "ok" };
    }
    case "openSignIn":
      await chrome.tabs.create({ url: `${env.webUrl}/sign-in` });
      return { type: "ok" };
    case "openOptions":
      await chrome.runtime.openOptionsPage();
      return { type: "ok" };
  }
}

async function pushIfSyncing(request: { settings: unknown }) {
  const mode = await fundingModeItem.getValue();
  if (mode !== "hosted") return;
  const session = await sessionInfo();
  if (!session.signedIn) return;
  await pushSettings(request.settings as Awaited<ReturnType<typeof settingsItem.getValue>>).catch(() => undefined);
}

async function status(): Promise<Status> {
  const [fundingMode, personalKey] = await Promise.all([fundingModeItem.getValue(), personalKeyItem.getValue()]);
  const base: Status = { fundingMode, hasPersonalKey: Boolean(personalKey), hostedAvailable: hostedModeAvailable, signedIn: false };
  if (!hostedModeAvailable) return base;
  const session = await sessionInfo();
  if (!session.signedIn) return base;
  try {
    const account = (await fetchAccount()) ?? (await ensureAccount().then(() => fetchAccount()));
    return { ...base, signedIn: true, email: session.email ?? account?.email, balance: account?.balance };
  } catch (error) {
    return { ...base, signedIn: true, email: session.email, lastError: error instanceof Error ? error.message : String(error) };
  }
}
