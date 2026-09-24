export const SHORTS_SHELF_SELECTOR = [
  "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])",
  "ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)",
  "ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model-v2)",
  "ytd-reel-shelf-renderer",
  "grid-shelf-view-model:has(ytm-shorts-lockup-view-model)",
  "grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2)",
  "ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model)",
  "ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model-v2)",
  "ytd-rich-item-renderer:has(> #content > ytd-reel-item-renderer)",
  'ytd-video-renderer:has(a[href*="/shorts/"]#thumbnail)',
  'ytd-compact-video-renderer:has(a[href*="/shorts/"]#thumbnail)',
  'ytd-shelf-renderer:has(ytd-grid-video-renderer a[href*="/shorts/"]#thumbnail)',
  'ytd-grid-video-renderer:has(a[href*="/shorts/"]#thumbnail)',
].join(",");

const SHORTS_MENU_SELECTOR = ['ytd-guide-entry-renderer:has(a[href="/shorts/"])', 'ytd-mini-guide-entry-renderer:has(a[href="/shorts/"])'].join(",");

const REMOVED_CLASS = "cc-shorts-removed";
const BLURRED_CLASS = "cc-shorts-blurred";

export function hideShortsOnPage(enabled: boolean) {
  if (!enabled) {
    for (const el of document.querySelectorAll(`.${REMOVED_CLASS}, .${BLURRED_CLASS}`)) {
      el.classList.remove(REMOVED_CLASS, BLURRED_CLASS);
    }
    return;
  }
  for (const el of document.querySelectorAll<HTMLElement>(SHORTS_MENU_SELECTOR)) el.classList.add(REMOVED_CLASS);
  for (const el of document.querySelectorAll<HTMLElement>(SHORTS_SHELF_SELECTOR)) {
    if (el.classList.contains(REMOVED_CLASS) || el.classList.contains(BLURRED_CLASS)) continue;
    const rect = el.getBoundingClientRect();
    const onScreen = rect.bottom > 0 && rect.top < window.innerHeight;
    el.classList.add(onScreen && rect.height > 0 ? BLURRED_CLASS : REMOVED_CLASS);
  }
}
