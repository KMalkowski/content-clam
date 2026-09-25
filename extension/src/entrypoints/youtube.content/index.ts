import "./style.css";
import { defineContentScript } from "wxt/utils/define-content-script";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { LOOKAHEAD_PX, normalizeChannelKey, type VideoMetadata } from "@content-clam/shared";
import { CARD_SELECTOR, extractCard, extractShortsPlayer, isNestedCard } from "./extract";
import { applyOutcome, clearDim, DIM_CLASS } from "./dimming";
import { hiddenShortsIds, hideShortsOnPage } from "./shorts";
import { ShortsController } from "./shortsPlayer";
import { AnalysisQueue } from "./analysisQueue";
import { subscribedChannelsFromFeed, subscribedChannelsOnPage } from "./subscriptions";
import { sendToBackground, type AnalysisOutcome } from "../../lib/messages";

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",
  cssInjectionMode: "manifest",
  main(ctx) {
    new PageController(ctx).start();
  },
});

class PageController {
  private revealed = new Set<string>();
  private scanTimer: number | null = null;
  private hideShorts = false;
  private keepSubscribed = true;
  private recordingSubscriptions = false;
  private seenSubscriptionKeys = new Set<string>();
  private reportedShorts = new Set<string>();
  private subscriptionsFromFeed: Promise<void> | null = null;
  private preferencesReady = false;
  private generation = 0;
  private analysis: AnalysisQueue;
  private shorts: ShortsController;

  constructor(private ctx: ContentScriptContext) {
    this.analysis = new AnalysisQueue({
      analyze: async (videos) => {
        const response = await sendToBackground({ type: "analyze", videos });
        return response.type === "analysis" ? response.outcomes : [];
      },
      onOutcome: (outcome) => this.onOutcome(outcome),
    });
    this.shorts = new ShortsController(
      ctx,
      (video) => this.analysis.request([video]),
      (id) => this.analysis.outcomeFor(id),
      (id) => this.reveal(id),
    );
  }

  start() {
    const observer = new MutationObserver(() => this.scheduleScan());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && (changes.settings || changes.fundingMode || changes.personalKey)) this.resetForNewRules();
    };
    chrome.storage.onChanged.addListener(onStorageChange);
    this.ctx.onInvalidated(() => {
      observer.disconnect();
      chrome.storage.onChanged.removeListener(onStorageChange);
      this.generation++;
      this.analysis.reset();
      this.shorts.reset();
    });
    this.ctx.addEventListener(window, "scroll", () => this.scheduleScan(), { passive: true });
    this.ctx.addEventListener(window, "wxt:locationchange", () => {
      this.shorts.onNavigate();
      this.scheduleScan();
    });
    void this.loadPreferences();
    this.shorts.onNavigate();
  }

  private async loadPreferences() {
    const generation = this.generation;
    const response = await sendToBackground({ type: "getSettings" }).catch(() => null);
    if (generation !== this.generation) return;
    if (response?.type === "settings") {
      this.hideShorts = response.settings.hideShorts;
      this.keepSubscribed = response.settings.keepSubscribed;
    }
    if (this.keepSubscribed) await this.loadSubscriptionsFromFeed();
    if (generation !== this.generation) return;
    this.preferencesReady = true;
    this.applyShortsRule();
    this.scheduleScan();
  }

  private applyShortsRule() {
    hideShortsOnPage(this.hideShorts);
    if (!this.hideShorts) return;
    const fresh = [...new Set(hiddenShortsIds())].filter((id) => !this.reportedShorts.has(id));
    if (!fresh.length) return;
    for (const id of fresh) this.reportedShorts.add(id);
    void sendToBackground({ type: "recordHiddenShorts", videoIds: fresh }).catch(() => undefined);
  }

  private loadSubscriptionsFromFeed(): Promise<void> {
    this.subscriptionsFromFeed ??= subscribedChannelsFromFeed()
      .then(async (keys) => {
        if (!keys.length) return;
        for (const key of keys) this.seenSubscriptionKeys.add(normalizeChannelKey(key));
        await sendToBackground({ type: "recordSubscriptions", channelKeys: keys });
      })
      .catch(() => undefined);
    return this.subscriptionsFromFeed;
  }

  private scheduleScan() {
    if (this.scanTimer !== null) return;
    this.scanTimer = this.ctx.setTimeout(() => {
      this.scanTimer = null;
      this.scan();
    }, 150);
  }

  private scan() {
    if (!this.preferencesReady) return;
    this.applyShortsRule();
    const limit = window.innerHeight + LOOKAHEAD_PX;
    const wanted: { meta: VideoMetadata; distance: number }[] = [];
    const cardsOnPage: VideoMetadata[] = [];
    for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
      if (isNestedCard(card)) continue;
      if (this.hideShorts && card.closest(".cc-shorts-removed, .cc-shorts-blurred")) continue;
      const rect = card.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > limit) continue;
      const meta = extractCard(card);
      if (!meta) continue;
      cardsOnPage.push(meta);
      if (card.dataset.ccVideo && card.dataset.ccVideo !== meta.videoId) clearDim(card);
      const known = this.analysis.outcomeFor(meta.videoId);
      if (known) this.paint(card, known);
      else if (!this.revealed.has(meta.videoId)) wanted.push({ meta, distance: rect.top < 0 ? Math.abs(rect.bottom) : rect.top });
    }
    if (this.keepSubscribed && this.recordNewSubscriptions(cardsOnPage, wanted)) return;
    if (this.recordingSubscriptions || !wanted.length) return;
    wanted.sort((a, b) => a.distance - b.distance);
    this.analysis.request(wanted.map((w) => w.meta));
  }

  private recordNewSubscriptions(cardsOnPage: VideoMetadata[], wanted: { meta: VideoMetadata }[]): boolean {
    const fresh = subscribedChannelsOnPage(cardsOnPage).filter((key) => !this.seenSubscriptionKeys.has(normalizeChannelKey(key)));
    if (!fresh.length) return false;
    const normalized = fresh.map(normalizeChannelKey);
    for (const key of normalized) this.seenSubscriptionKeys.add(key);
    this.recordingSubscriptions = true;
    sendToBackground({ type: "recordSubscriptions", channelKeys: fresh }).then(
      () => {
        this.recordingSubscriptions = false;
        this.resetForNewRules();
      },
      () => {
        this.recordingSubscriptions = false;
        for (const key of normalized) this.seenSubscriptionKeys.delete(key);
        this.analysis.request(wanted.map((w) => w.meta));
      },
    );
    return true;
  }

  private onOutcome(outcome: AnalysisOutcome) {
    this.scheduleScan();
    this.shorts.onOutcome(outcome);
  }

  private paint(card: HTMLElement, outcome: AnalysisOutcome) {
    if (this.revealed.has(outcome.videoId)) {
      clearDim(card);
      return;
    }
    applyOutcome(card, outcome, {
      onReveal: (id) => this.reveal(id),
      onAllowChannel: (id) => void this.allowChannel(id),
      onOpenSettings: () => void sendToBackground({ type: "openOptions" }).catch(() => undefined),
    });
  }

  private reveal(videoId: string) {
    this.revealed.add(videoId);
    for (const card of document.querySelectorAll<HTMLElement>(`.${DIM_CLASS}[data-cc-video="${videoId}"]`)) clearDim(card);
    void sendToBackground({ type: "revealVideo", videoId }).catch(() => undefined);
    this.shorts.onReveal(videoId);
  }

  private async allowChannel(videoId: string) {
    const card = document.querySelector<HTMLElement>(`[data-cc-video="${videoId}"]`);
    const meta = card ? extractCard(card) : extractShortsPlayer();
    const channel = meta?.channelHandle ?? meta?.channelName;
    if (!channel) return;
    await sendToBackground({ type: "changeSettings", change: { type: "allowChannel", channel, channelName: meta?.channelName } }).catch(() => undefined);
  }

  private resetForNewRules() {
    this.generation++;
    this.preferencesReady = false;
    this.analysis.reset();
    for (const card of document.querySelectorAll<HTMLElement>(`.${DIM_CLASS}`)) clearDim(card);
    this.shorts.reset();
    void this.loadPreferences();
  }
}
