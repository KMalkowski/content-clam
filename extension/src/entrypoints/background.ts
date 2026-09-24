import { defineBackground } from "wxt/utils/define-background";
import { analyzeVideos } from "../lib/analyzer";
import type { BackgroundRequest, BackgroundResponse, Status } from "../lib/messages";
import { cacheItem, fundingModeItem, lastErrorItem, personalKeyItem, readSettings, revealedItem, writeSettings } from "../lib/storage";
import { recordSubscriptions } from "../lib/subscriptions";
import { hiddenCountsByCategory } from "../lib/hiddenCounts";
import { env, hostedModeAvailable } from "../lib/env";
import { ensureAccount, fetchAccount, sessionInfo } from "../lib/hosted";
import { adoptRemoteSettings, pushIfSyncing, syncChoiceFor, uploadLocalSettings } from "../lib/sync";

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
      return { type: "settings", settings: await readSettings() };
    case "updateSettings": {
      const settings = await writeSettings(request.settings);
      void pushIfSyncing(settings);
      return { type: "ok" };
    }
    case "getStatus":
      return { type: "status", status: await status() };
    case "getHiddenCounts": {
      const [cache, settings] = await Promise.all([cacheItem.getValue(), readSettings()]);
      return { type: "hiddenCounts", counts: hiddenCountsByCategory(cache, settings) };
    }
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
    case "recordSubscriptions":
      await recordSubscriptions(request.channelKeys);
      return { type: "ok" };
    case "syncFromServer":
      return { type: "settings", settings: await adoptRemoteSettings() };
    case "pushSettingsToServer":
      await uploadLocalSettings();
      return { type: "ok" };
    case "openSignIn":
      await chrome.tabs.create({ url: `${env.webUrl}/sign-in` });
      return { type: "ok" };
    case "openOptions":
      await chrome.runtime.openOptionsPage();
      return { type: "ok" };
  }
}

async function status(): Promise<Status> {
  const [fundingMode, personalKey, lastError] = await Promise.all([fundingModeItem.getValue(), personalKeyItem.getValue(), lastErrorItem.getValue()]);
  const base: Status = { fundingMode, hasPersonalKey: Boolean(personalKey), hostedAvailable: hostedModeAvailable, signedIn: false, lastError: lastError ?? undefined, syncChoice: "unasked" };
  if (!hostedModeAvailable) return base;
  const session = await sessionInfo();
  if (!session.signedIn) return base;
  const syncChoice = await syncChoiceFor(session.userId);
  try {
    const account = (await fetchAccount()) ?? (await ensureAccount().then(() => fetchAccount()));
    return { ...base, signedIn: true, syncChoice, email: session.email ?? account?.email, balance: account?.balance };
  } catch (error) {
    return { ...base, signedIn: true, syncChoice, email: session.email, lastError: error instanceof Error ? error.message : String(error) };
  }
}
