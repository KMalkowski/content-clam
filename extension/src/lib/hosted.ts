import { ConvexHttpClient } from "convex/browser";
import { createClerkClient } from "@clerk/chrome-extension/client";
import type { HostedAnalyzeRequest, HostedAnalyzeResponse, Settings } from "@content-clam/shared";
import { anyApi } from "convex/server";
import { env, hostedModeAvailable } from "./env";

const api = anyApi as any;

type ClerkClient = Awaited<ReturnType<typeof createClerkClient>>;
let clerkPromise: Promise<ClerkClient> | null = null;

function clerk(): Promise<ClerkClient> {
  if (!env.clerkPublishableKey) throw new Error("Hosted mode is not configured in this build.");
  clerkPromise ??= createClerkClient({
    publishableKey: env.clerkPublishableKey,
    syncHost: env.clerkSyncHost,
    background: true,
  });
  return clerkPromise;
}

export async function getToken(): Promise<string | null> {
  if (!hostedModeAvailable) return null;
  const client = await clerk();
  const session = client.session;
  if (!session) return null;
  return (await session.getToken({ template: "convex" })) ?? null;
}

export async function sessionInfo(): Promise<{ signedIn: boolean; email?: string }> {
  if (!hostedModeAvailable) return { signedIn: false };
  try {
    const client = await clerk();
    const email = client.user?.primaryEmailAddress?.emailAddress;
    return { signedIn: Boolean(client.session), email };
  } catch {
    return { signedIn: false };
  }
}

async function convex(): Promise<ConvexHttpClient> {
  if (!env.convexUrl) throw new Error("Hosted mode is not configured in this build.");
  const token = await getToken();
  if (!token) throw new Error("Sign in to use credits.");
  const client = new ConvexHttpClient(env.convexUrl);
  client.setAuth(token);
  return client;
}

export async function hostedAnalyze(request: HostedAnalyzeRequest): Promise<HostedAnalyzeResponse> {
  const client = await convex();
  return client.action(api.analyze.run, request);
}

export async function ensureAccount(): Promise<{ balance: number; trialGranted: boolean; created: boolean }> {
  const client = await convex();
  return client.mutation(api.users.ensureUser, {});
}

export async function fetchAccount(): Promise<{ email: string; balance: number } | null> {
  const client = await convex();
  return client.query(api.users.me, {});
}

export interface RemoteSettings {
  paused: boolean;
  categories: { itemId: string; name: string; description: string; enabled: boolean; updatedAt: number }[];
  allowedTopics: { itemId: string; description: string; updatedAt: number }[];
  allowedChannels: { itemId: string; channelKey: string; channelName: string; updatedAt: number }[];
}

export async function fetchRemoteSettings(): Promise<RemoteSettings | null> {
  const client = await convex();
  return client.query(api.settings.get, {});
}

export async function pushSettings(settings: Settings): Promise<void> {
  const client = await convex();
  await client.mutation(api.settings.replaceAll, toRemote(settings));
}

export function toRemote(settings: Settings): RemoteSettings {
  return {
    paused: settings.paused,
    categories: settings.categories.map(({ id, ...rest }) => ({ itemId: id, ...rest })),
    allowedTopics: settings.allowedTopics.map(({ id, ...rest }) => ({ itemId: id, ...rest })),
    allowedChannels: settings.allowedChannels.map(({ id, ...rest }) => ({ itemId: id, ...rest })),
  };
}

export function fromRemote(remote: RemoteSettings): Settings {
  return {
    paused: remote.paused,
    categories: remote.categories.map(({ itemId, ...rest }) => ({ id: itemId, ...rest })),
    allowedTopics: remote.allowedTopics.map(({ itemId, ...rest }) => ({ id: itemId, ...rest })),
    allowedChannels: remote.allowedChannels.map(({ itemId, ...rest }) => ({ id: itemId, ...rest })),
  };
}

export function mergeByNewest(local: Settings, remote: Settings): Settings {
  const pick = <T extends { id: string; updatedAt: number }>(a: T[], b: T[]) => {
    const map = new Map<string, T>();
    for (const item of [...a, ...b]) {
      const current = map.get(item.id);
      if (!current || item.updatedAt > current.updatedAt) map.set(item.id, item);
    }
    return [...map.values()];
  };
  return {
    paused: local.paused,
    categories: pick(local.categories, remote.categories),
    allowedTopics: pick(local.allowedTopics, remote.allowedTopics),
    allowedChannels: pick(local.allowedChannels, remote.allowedChannels),
  };
}
