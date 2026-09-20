import "./style.css";
import { defineContentScript } from "wxt/utils/define-content-script";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { LOOKAHEAD_PX, normalizeChannelKey, type VideoMetadata } from "@content-clam/shared";
import { CARD_SELECTOR, SHORTS_VIDEO_SELECTOR, extractCard, extractShortsPlayer, currentShortsId, isNestedCard } from "./extract";
import { applyOutcome, clearDim, DIM_CLASS } from "./dimming";
import { sendToBackground, type AnalysisOutcome } from "../../lib/messages";

const RETRY_DELAY_MS = 60_000;

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",
  cssInjectionMode: "manifest",
  main(ctx) {
    const page = new PageController(ctx);
    page.start();
  },
});

class PageController {
  private outcomes = new Map<string, AnalysisOutcome>();
  private retryAfter = new Map<string, number>();
  private revealed = new Set<string>();
  private queued = new Set<string>();
  private pendingCards = new Map<string, Set<HTMLElement>>();
  private flushTimer: number | null = null;
  private shorts: ShortsController;

  constructor(private ctx: ContentScriptContext) {
    this.shorts = new ShortsController(ctx, (video) => this.requestAnalysis([video]), (id) => this.outcomes.get(id), (id) => this.reveal(id));
  }

  start() {
    const observer = new MutationObserver(() => this.scheduleScan());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    this.ctx.onInvalidated(() => observer.disconnect());
    this.ctx.addEventListener(window, "scroll", () => this.scheduleScan(), { passive: true });
    this.ctx.addEventListener(window, "wxt:locationchange", () => {
      this.shorts.onNavigate();
      this.scheduleScan();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && (changes.settings || changes.fundingMode || changes.personalKey)) this.resetForNewRules();
    });
    this.scheduleScan();
    this.shorts.onNavigate();
  }

  private scheduleScan() {
    if (this.flushTimer !== null) return;
    this.flushTimer = this.ctx.setTimeout(() => {
      this.flushTimer = null;
      this.scan();
    }, 150);
  }

  private scan() {
    const limit = window.innerHeight + LOOKAHEAD_PX;
    const batch: VideoMetadata[] = [];
    for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
      if (isNestedCard(card)) continue;
      const rect = card.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > limit) continue;
      const meta = extractCard(card);
      if (!meta) continue;
      if (card.dataset.ccVideo && card.dataset.ccVideo !== meta.videoId) clearDim(card);
      const known = this.outcomes.get(meta.videoId);
      if (known) {
        this.paint(card, known);
        continue;
      }
      if (this.revealed.has(meta.videoId)) continue;
      if ((this.retryAfter.get(meta.videoId) ?? 0) > Date.now()) continue;
      this.trackCard(meta.videoId, card);
      if (!this.queued.has(meta.videoId)) {
        this.queued.add(meta.videoId);
        batch.push(meta);
      }
    }
    if (batch.length) this.requestAnalysis(batch.sort((a, b) => viewportDistance(a) - viewportDistance(b)));
  }

  private trackCard(videoId: string, card: HTMLElement) {
    let set = this.pendingCards.get(videoId);
    if (!set) this.pendingCards.set(videoId, (set = new Set()));
    set.add(card);
  }

  private async requestAnalysis(videos: VideoMetadata[]) {
    for (const chunk of chunks(videos, 12)) {
      try {
        const response = await sendToBackground({ type: "analyze", videos: chunk });
        if (response.type !== "analysis") continue;
        for (const outcome of response.outcomes) this.receive(outcome);
      } catch {
        for (const v of chunk) {
          this.queued.delete(v.videoId);
          this.retryAfter.set(v.videoId, Date.now() + RETRY_DELAY_MS);
        }
      }
    }
  }

  private receive(outcome: AnalysisOutcome) {
    this.queued.delete(outcome.videoId);
    if (outcome.decision) this.outcomes.set(outcome.videoId, outcome);
    else this.retryAfter.set(outcome.videoId, Date.now() + RETRY_DELAY_MS);
    const cards = this.pendingCards.get(outcome.videoId);
    if (cards) for (const card of cards) if (card.isConnected) this.paint(card, outcome);
    this.shorts.onOutcome(outcome);
  }

  private paint(card: HTMLElement, outcome: AnalysisOutcome) {
    if (this.revealed.has(outcome.videoId)) {
      clearDim(card);
      return;
    }
    applyOutcome(card, outcome, {
      onReveal: (id) => this.reveal(id),
      onAllowChannel: (id) => this.allowChannel(id),
      onOpenSettings: () => void sendToBackground({ type: "openOptions" }),
    });
  }

  private reveal(videoId: string) {
    this.revealed.add(videoId);
    for (const card of document.querySelectorAll<HTMLElement>(`.${DIM_CLASS}[data-cc-video="${videoId}"]`)) clearDim(card);
    void sendToBackground({ type: "revealVideo", videoId });
    this.shorts.onReveal(videoId);
  }

  private async allowChannel(videoId: string) {
    const card = document.querySelector<HTMLElement>(`[data-cc-video="${videoId}"]`);
    const meta = card ? extractCard(card) : extractShortsPlayer();
    const key = meta?.channelHandle ?? meta?.channelName;
    if (!key) return;
    const response = await sendToBackground({ type: "getSettings" });
    if (response.type !== "settings") return;
    const settings = response.settings;
    const channelKey = normalizeChannelKey(key);
    if (!settings.allowedChannels.some((c) => c.channelKey === channelKey)) {
      settings.allowedChannels.push({ id: crypto.randomUUID(), channelKey, channelName: meta?.channelName ?? key, updatedAt: Date.now() });
      await sendToBackground({ type: "updateSettings", settings });
    }
    this.resetForNewRules();
  }

  private resetForNewRules() {
    this.outcomes.clear();
    this.retryAfter.clear();
    this.queued.clear();
    for (const card of document.querySelectorAll<HTMLElement>(`.${DIM_CLASS}`)) clearDim(card);
    this.shorts.reset();
    this.scheduleScan();
  }
}

class ShortsController {
  private banner: HTMLElement | null = null;
  private pausedFor: string | null = null;
  private revealed = new Set<string>();
  private pollTimer: number | null = null;

  constructor(
    private ctx: ContentScriptContext,
    private analyze: (video: VideoMetadata) => void,
    private lookup: (videoId: string) => AnalysisOutcome | undefined,
    private revealCard: (videoId: string) => void,
  ) {}

  onNavigate() {
    this.removeBanner();
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (!currentShortsId()) return;
    let attempts = 0;
    this.pollTimer = this.ctx.setInterval(() => {
      const meta = extractShortsPlayer();
      attempts++;
      if (meta || attempts > 20) {
        if (this.pollTimer !== null) clearInterval(this.pollTimer);
        this.pollTimer = null;
        if (meta) {
          const known = this.lookup(meta.videoId);
          if (known) this.onOutcome(known);
          else this.analyze(meta);
        }
      }
    }, 250);
  }

  onOutcome(outcome: AnalysisOutcome) {
    if (outcome.videoId !== currentShortsId()) return;
    if (!outcome.decision?.dimmed || this.revealed.has(outcome.videoId)) return;
    const video = document.querySelector<HTMLVideoElement>(SHORTS_VIDEO_SELECTOR);
    if (!video) return;
    video.pause();
    this.pausedFor = outcome.videoId;
    const keepPaused = () => {
      if (this.pausedFor === outcome.videoId && !this.revealed.has(outcome.videoId)) video.pause();
    };
    this.ctx.addEventListener(video, "play", keepPaused);
    this.showBanner(outcome);
  }

  onReveal(videoId: string) {
    this.revealed.add(videoId);
    if (this.pausedFor === videoId) {
      this.pausedFor = null;
      document.querySelector<HTMLVideoElement>(SHORTS_VIDEO_SELECTOR)?.play().catch(() => undefined);
    }
    this.removeBanner();
  }

  reset() {
    this.pausedFor = null;
    this.removeBanner();
  }

  private showBanner(outcome: AnalysisOutcome) {
    this.removeBanner();
    const banner = document.createElement("div");
    banner.className = "cc-shorts-banner";
    const reason = document.createElement("span");
    reason.textContent = outcome.reasons[0] ?? "Matched a filter";
    const play = document.createElement("button");
    play.type = "button";
    play.textContent = "Play anyway";
    play.addEventListener("click", () => this.revealCard(outcome.videoId));
    banner.append(reason, play);
    document.body.append(banner);
    this.banner = banner;
  }

  private removeBanner() {
    this.banner?.remove();
    this.banner = null;
  }
}

function viewportDistance(meta: VideoMetadata): number {
  const card = document.querySelector<HTMLElement>(`a[href*="${meta.videoId}"]`)?.closest(CARD_SELECTOR) as HTMLElement | null;
  if (!card) return Number.MAX_SAFE_INTEGER;
  const rect = card.getBoundingClientRect();
  return rect.top < 0 ? Math.abs(rect.bottom) : rect.top;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
