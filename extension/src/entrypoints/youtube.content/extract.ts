import type { VideoMetadata } from "@content-clam/shared";

export const CARD_SELECTOR = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-reel-item-renderer",
  "ytm-shorts-lockup-view-model",
  "ytm-shorts-lockup-view-model-v2",
  "yt-lockup-view-model",
].join(",");

export function isNestedCard(card: Element): boolean {
  return card.parentElement?.closest(CARD_SELECTOR) !== null;
}

export function extractCard(card: Element): VideoMetadata | null {
  const link = card.querySelector<HTMLAnchorElement>('a[href*="/watch?v="], a[href*="/shorts/"]');
  const href = link?.getAttribute("href") ?? "";
  const videoId = parseVideoId(href);
  if (!videoId) return null;

  const isShort = href.includes("/shorts/");
  const title = text(card.querySelector("#video-title, #video-title-link, h3, .yt-lockup-metadata-view-model__title, .shortsLockupViewModelHostMetadataTitle")) || link?.getAttribute("title") || link?.getAttribute("aria-label") || "";
  if (!title) return null;

  const channelLink = card.querySelector<HTMLAnchorElement>('a[href^="/@"], a[href*="/channel/"], a[href*="/c/"]');
  const channelName = text(card.querySelector("ytd-channel-name #text a, ytd-channel-name #text, .yt-content-metadata-view-model__metadata-row a, #channel-name")) || text(channelLink) || undefined;
  const channelHandle = handleFromHref(channelLink?.getAttribute("href"));
  const description = text(card.querySelector("#description-text, .metadata-snippet-text, yt-formatted-string.metadata-snippet-text")) || undefined;
  const durationText = text(card.querySelector(".badge-shape-wiz__text, .yt-badge-shape__text, #time-status #text, #time-status, ytd-thumbnail-overlay-time-status-renderer")) || undefined;
  const metadataLine = [...card.querySelectorAll("#metadata-line span, .inline-metadata-item, .yt-content-metadata-view-model__metadata-text")].map((el) => text(el)).filter(Boolean);
  const viewsText = metadataLine.find((s) => /view/i.test(s));
  const publishedText = metadataLine.find((s) => /ago|streamed|premiere/i.test(s));
  const badges = [...card.querySelectorAll("ytd-badge-supported-renderer .badge, .yt-badge-shape__text, ytd-badge-supported-renderer span")].map((el) => text(el)).filter((s) => s && !/^\d+:\d+/.test(s));

  return {
    videoId,
    title: clip(title, 300),
    channelName: channelName ? clip(channelName, 120) : undefined,
    channelHandle,
    description: description ? clip(description, 600) : undefined,
    durationText,
    viewsText,
    publishedText,
    badges: badges.length ? [...new Set(badges)].slice(0, 5) : undefined,
    isShort,
  };
}

export function parseVideoId(href: string): string | null {
  const watch = href.match(/[?&]v=([\w-]{11})/);
  if (watch?.[1]) return watch[1];
  const short = href.match(/\/shorts\/([\w-]{11})/);
  return short?.[1] ?? null;
}

export function handleFromHref(href: string | null | undefined): string | undefined {
  const match = href?.match(/\/(?:@|channel\/|c\/)([^/?#]+)/);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

function text(el: Element | null | undefined): string {
  return collapseRepeat((el?.textContent ?? "").replace(/\s+/g, " ").trim());
}

function collapseRepeat(s: string): string {
  const half = Math.floor(s.length / 2);
  if (s.length % 2 === 1 && s.slice(0, half) === s.slice(half + 1) && s[half] === " ") return s.slice(0, half);
  return s;
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function currentShortsId(): string | null {
  return parseVideoId(location.pathname);
}

export const SHORTS_VIDEO_SELECTOR = "#shorts-player video, ytd-shorts video";

export function activeShortsReel(): Element | null {
  return document.querySelector(SHORTS_VIDEO_SELECTOR)?.closest("ytd-reel-video-renderer") ?? document.querySelector("ytd-reel-video-renderer[is-active]");
}

export function extractShortsPlayer(): VideoMetadata | null {
  const videoId = currentShortsId();
  if (!videoId) return null;
  const active = activeShortsReel() ?? document;
  const title = text(active.querySelector(".ytShortsVideoTitleViewModelShortsVideoTitle, yt-shorts-video-title-view-model, h2.title, #shorts-title")) || text(document.querySelector("title")).replace(/ - YouTube$/, "");
  if (!title) return null;
  const channelLink = active.querySelector<HTMLAnchorElement>('a[href^="/@"]');
  return {
    videoId,
    title: clip(title, 300),
    channelName: text(channelLink) || undefined,
    channelHandle: handleFromHref(channelLink?.getAttribute("href")),
    isShort: true,
  };
}
