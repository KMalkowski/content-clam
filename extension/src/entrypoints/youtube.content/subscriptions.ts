import type { VideoMetadata } from "@content-clam/shared";
import { handleFromHref } from "./extract";

const GUIDE_CHANNEL_SELECTOR = 'ytd-guide-renderer ytd-guide-entry-renderer a[href^="/@"], ytd-guide-renderer ytd-guide-entry-renderer a[href^="/channel/"]';
const CHANNEL_PAGE_SELECTOR = 'ytd-channel-renderer a[href^="/@"], ytd-channel-renderer a[href^="/channel/"]';
const INITIAL_DATA_MARKERS = ["var ytInitialData =", "window['ytInitialData'] =", 'window["ytInitialData"] =', "ytInitialData ="];

export function onSubscriptionsFeed(): boolean {
  return location.pathname.startsWith("/feed/subscriptions");
}

export function subscribedChannelsOnPage(cards: VideoMetadata[]): string[] {
  const keys = new Set<string>();
  const add = (value: string | undefined) => {
    const key = value?.trim();
    if (key) keys.add(key);
  };
  for (const link of document.querySelectorAll<HTMLAnchorElement>(GUIDE_CHANNEL_SELECTOR)) {
    add(handleFromHref(link.getAttribute("href")));
    add(link.getAttribute("title") ?? link.querySelector(".title")?.textContent ?? undefined);
  }
  if (location.pathname.startsWith("/feed/channels")) {
    for (const link of document.querySelectorAll<HTMLAnchorElement>(CHANNEL_PAGE_SELECTOR)) {
      add(handleFromHref(link.getAttribute("href")));
      add(link.textContent ?? undefined);
    }
  }
  if (onSubscriptionsFeed()) {
    for (const card of cards) {
      add(card.channelHandle);
      add(card.channelName);
    }
  }
  return [...keys];
}

export async function subscribedChannelsFromFeed(request: typeof fetch = fetch): Promise<string[]> {
  const response = await request("/feed/channels", { credentials: "same-origin" });
  if (!response.ok) throw new Error(`YouTube returned ${response.status} while loading subscriptions.`);
  return subscriptionKeysFromHtml(await response.text());
}

export function subscriptionKeysFromHtml(html: string): string[] {
  const data = readInitialData(html);
  if (!data) return [];
  const keys = new Set<string>();
  visit(data, (renderer) => {
    const title = textFromRuns(renderer.title);
    if (title) keys.add(title);
    const endpoint = asRecord(renderer.navigationEndpoint);
    const browse = asRecord(endpoint?.browseEndpoint);
    const command = asRecord(endpoint?.commandMetadata);
    const web = asRecord(command?.webCommandMetadata);
    for (const value of [browse?.canonicalBaseUrl, web?.url]) {
      const key = typeof value === "string" ? handleFromHref(value) : undefined;
      if (key) keys.add(key);
    }
    if (typeof renderer.channelId === "string" && renderer.channelId) keys.add(renderer.channelId);
  });
  return [...keys];
}

function readInitialData(html: string): unknown {
  for (const marker of INITIAL_DATA_MARKERS) {
    let start = html.indexOf(marker);
    while (start >= 0) {
      start = html.indexOf("{", start + marker.length);
      if (start < 0) break;
      const json = balancedObject(html, start);
      if (json) {
        try {
          return JSON.parse(json);
        } catch {
          break;
        }
      }
      start = html.indexOf(marker, start + 1);
    }
  }
  return null;
}

function balancedObject(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

function visit(value: unknown, collect: (renderer: Record<string, unknown>) => void) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, collect);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if ((key === "channelRenderer" || key === "gridChannelRenderer") && child && typeof child === "object" && !Array.isArray(child)) {
      collect(child as Record<string, unknown>);
    }
    visit(child, collect);
  }
}

function textFromRuns(value: unknown): string | undefined {
  const record = asRecord(value);
  if (typeof record?.simpleText === "string") return record.simpleText.trim() || undefined;
  if (!Array.isArray(record?.runs)) return undefined;
  const valueText = record.runs
    .map((run) => asRecord(run)?.text)
    .filter((part): part is string => typeof part === "string")
    .join("")
    .trim();
  return valueText || undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
