import { normalizeChannelKey } from "@content-clam/shared";
import { subscribedChannelsItem } from "./storage";

const FORGET_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export async function recordSubscriptions(channelKeys: string[]): Promise<void> {
  const now = Date.now();
  const known = { ...(await subscribedChannelsItem.getValue()) };
  for (const [key, seenAt] of Object.entries(known)) if (now - seenAt > FORGET_AFTER_MS) delete known[key];
  for (const raw of channelKeys) {
    const key = normalizeChannelKey(raw);
    if (key) known[key] = now;
  }
  await subscribedChannelsItem.setValue(known);
}

export async function subscribedChannelKeys(): Promise<Set<string>> {
  return new Set(Object.keys(await subscribedChannelsItem.getValue()));
}
