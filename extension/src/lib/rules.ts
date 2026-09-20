import {
  BUILT_IN_CATEGORIES,
  enabledCategories,
  hash,
  type Category,
  type Decision,
  type Settings,
} from "@content-clam/shared";

export function rulesHash(settings: Settings): string {
  const enabled = enabledCategories(settings).map((c) => `${c.id}:${c.description}`);
  const topics = settings.allowedTopics.map((t) => `${t.id}:${t.description}`);
  return hash([...enabled, "|", ...topics].join("\n"));
}

export function reasonsFor(decision: Decision, settings: Settings): string[] {
  const byId = new Map(settings.categories.map((c) => [c.id, c]));
  const builtIn = new Map(BUILT_IN_CATEGORIES.map((c) => [c.id, c.reason]));
  return decision.matchedCategoryIds.map((id) => builtIn.get(id) ?? byId.get(id)?.name ?? "Matched a filter");
}

export function categoryPayload(categories: Category[]) {
  return categories.map(({ id, name, description }) => ({ id, name, description }));
}
