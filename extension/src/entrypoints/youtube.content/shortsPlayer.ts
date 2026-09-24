import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { VideoMetadata } from "@content-clam/shared";
import { SHORTS_VIDEO_SELECTOR, currentShortsId, extractShortsPlayer } from "./extract";
import type { AnalysisOutcome } from "../../lib/messages";

export class ShortsController {
  private banner: HTMLElement | null = null;
  private pausedFor: string | null = null;
  private releaseGuard: (() => void) | null = null;
  private revealed = new Set<string>();
  private pollTimer: number | null = null;

  constructor(
    private ctx: ContentScriptContext,
    private analyze: (video: VideoMetadata) => void,
    private lookup: (videoId: string) => AnalysisOutcome | undefined,
    private revealCard: (videoId: string) => void,
  ) {
    ctx.onInvalidated(() => this.releasePlayer());
  }

  onNavigate() {
    this.releasePlayer();
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
    this.releasePlayer();
    video.pause();
    this.pausedFor = outcome.videoId;
    const keepPaused = () => {
      if (this.pausedFor === outcome.videoId && currentShortsId() === outcome.videoId && !this.revealed.has(outcome.videoId)) video.pause();
    };
    video.addEventListener("play", keepPaused);
    this.releaseGuard = () => video.removeEventListener("play", keepPaused);
    this.showBanner(outcome);
  }

  onReveal(videoId: string) {
    this.revealed.add(videoId);
    if (this.pausedFor === videoId) {
      this.releasePlayer();
      document
        .querySelector<HTMLVideoElement>(SHORTS_VIDEO_SELECTOR)
        ?.play()
        .catch(() => undefined);
    }
    this.removeBanner();
  }

  reset() {
    this.releasePlayer();
    this.removeBanner();
  }

  private releasePlayer() {
    this.pausedFor = null;
    this.releaseGuard?.();
    this.releaseGuard = null;
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
