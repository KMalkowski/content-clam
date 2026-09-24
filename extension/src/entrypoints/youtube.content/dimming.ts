import type { AnalysisOutcome } from "../../lib/messages";

export const DIM_CLASS = "cc-dimmed";
const OVERLAY_CLASS = "cc-overlay";

export interface DimHandlers {
  onReveal: (videoId: string) => void;
  onAllowChannel: (videoId: string) => void;
  onOpenSettings: () => void;
}

export function applyOutcome(card: HTMLElement, outcome: AnalysisOutcome, handlers: DimHandlers) {
  const shouldDim = outcome.decision?.dimmed === true;
  if (!shouldDim) {
    clearDim(card);
    return;
  }
  if (!card.classList.contains(DIM_CLASS)) card.classList.add(DIM_CLASS);
  if (card.dataset.ccVideo !== outcome.videoId) card.dataset.ccVideo = outcome.videoId;
  let overlay = card.querySelector<HTMLElement>(`.${OVERLAY_CLASS}`);
  if (!overlay) {
    overlay = buildOverlay(outcome.videoId, handlers);
    card.append(overlay);
  }
  const reason = overlay.querySelector<HTMLElement>(".cc-reason");
  const text = outcome.reasons[0] ?? "Matched a filter";
  if (reason && reason.textContent !== text) reason.textContent = text;
}

export function clearDim(card: HTMLElement) {
  if (card.classList.contains(DIM_CLASS)) card.classList.remove(DIM_CLASS);
  card.querySelector(`.${OVERLAY_CLASS}`)?.remove();
  if (card.dataset.ccVideo !== undefined) delete card.dataset.ccVideo;
}

function buildOverlay(videoId: string, handlers: DimHandlers): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = OVERLAY_CLASS;
  overlay.setAttribute("role", "group");
  overlay.setAttribute("aria-label", "Content Clam filter");

  const label = document.createElement("span");
  label.className = "cc-label";
  label.textContent = "Hidden by Content Clam";

  const reason = document.createElement("span");
  reason.className = "cc-reason";

  const reveal = button("Reveal", () => handlers.onReveal(videoId));
  reveal.classList.add("cc-primary");

  const menuWrap = document.createElement("div");
  menuWrap.className = "cc-menu";
  const menuButton = button("⋯", () => menu.classList.toggle("cc-open"));
  menuButton.setAttribute("aria-label", "More options");
  const menu = document.createElement("div");
  menu.className = "cc-menu-items";
  menu.append(
    button("Always allow this channel", () => handlers.onAllowChannel(videoId)),
    button("Filter settings", () => handlers.onOpenSettings()),
  );
  menuWrap.append(menuButton, menu);

  overlay.append(label, reason, reveal, menuWrap);
  overlay.addEventListener("click", (e) => e.stopPropagation());
  return overlay;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return el;
}
