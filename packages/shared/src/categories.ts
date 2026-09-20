export interface BuiltInCategory {
  id: string;
  name: string;
  description: string;
  reason: string;
}

export const BUILT_IN_CATEGORIES: readonly BuiltInCategory[] = [
  {
    id: "clickbait",
    name: "Clickbait",
    reason: "Looks like clickbait",
    description:
      "The available metadata uses exaggerated stakes, sensational promises, or deliberate withholding to pressure a click. Do not classify a title as clickbait merely because it is enthusiastic, asks a question, or uses capital letters. Metadata can suggest clickbait but cannot prove that the video fails to deliver.",
  },
  {
    id: "outrage-bait",
    name: "Outrage bait",
    reason: "Looks like outrage bait",
    description:
      "The presentation primarily invites anger, contempt, or conflict. A controversial subject, critical analysis, or reporting on harm is not enough by itself.",
  },
  {
    id: "gossip-drama",
    name: "Gossip and drama",
    reason: "Looks like gossip or drama",
    description:
      "The main attraction is personal rumors, feuds, or interpersonal spectacle. Distinguish this from reporting or analysis of matters with clear public consequences.",
  },
  {
    id: "low-effort-reactions",
    name: "Reactions with little added analysis",
    reason: "Looks like a reaction with little analysis",
    description:
      "The available evidence presents the video mainly as someone watching or reacting to other content, with little indication of explanation or original analysis. A reaction format alone is insufficient. Expert commentary and educational breakdowns should survive when the metadata supports that distinction.",
  },
  {
    id: "pranks-stunts",
    name: "Pranks and stunts",
    reason: "Looks like a prank or stunt",
    description:
      "The main attraction is a practical joke, spectacle, dare, or entertainment challenge. Do not include instructional demonstrations or substantive experiments merely because they use the word challenge.",
  },
  {
    id: "promotion-hype",
    name: "Promotion and hype",
    reason: "Looks like promotion or hype",
    description:
      "The main purpose appears to be pushing a purchase, signup, investment, or money-making promise through promotional claims. Do not treat every product review, tutorial, or sponsorship disclosure as a match.",
  },
];

export const BUILT_IN_CATEGORY_IDS = new Set(BUILT_IN_CATEGORIES.map((c) => c.id));
