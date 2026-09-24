import { ConvexHttpClient } from "convex/browser";
import { createClerkClient } from "@clerk/chrome-extension/client";
import type { HostedAnalyzeRequest, HostedAnalyzeResponse, Settings } from "@content-clam/shared";
import type { FunctionReturnType } from "convex/server";
import { api } from "@content-clam/backend/api";
import { env, hostedModeAvailable } from "./env";
import type { SettingsChanges, SyncedCollection } from "./settingsDiff";

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

export interface SessionInfo {
  signedIn: boolean;
  userId?: string;
  email?: string;
}

export async function sessionInfo(): Promise<SessionInfo> {
  if (!hostedModeAvailable) return { signedIn: false };
  try {
    const client = await clerk();
    const email = client.user?.primaryEmailAddress?.emailAddress;
    return { signedIn: Boolean(client.session), userId: client.user?.id, email };
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

export async function ensureAccount(): Promise<FunctionReturnType<typeof api.users.ensureUser>> {
  const client = await convex();
  return client.mutation(api.users.ensureUser, {});
}

export async function fetchAccount(): Promise<FunctionReturnType<typeof api.users.me>> {
  const client = await convex();
  return client.query(api.users.me, {});
}

export type RemoteSettings = FunctionReturnType<typeof api.settings.replaceAll>;

export async function fetchRemoteSettings(): Promise<RemoteSettings | null> {
  const client = await convex();
  return client.query(api.settings.get, {});
}

export async function replaceRemoteSettings(settings: Settings): Promise<RemoteSettings> {
  const client = await convex();
  return client.mutation(api.settings.replaceAll, { paused: settings.paused, ...remoteItems(settings) });
}

export async function sendSettingsChanges(changes: SettingsChanges): Promise<RemoteSettings> {
  const client = await convex();
  return client.mutation(api.settings.applyChanges, {
    ...(changes.paused ? { paused: changes.paused } : {}),
    ...remoteItems(changes),
    deletions: changes.deletions.map(({ collection, id, deletedAt }) => ({ collection, itemId: id, deletedAt })),
  });
}

function remoteItems(settings: Pick<Settings, SyncedCollection>) {
  const withItemId = <T extends { id: string }>({ id, ...rest }: T) => ({ itemId: id, ...rest });
  return {
    categories: settings.categories.map(withItemId),
    allowedTopics: settings.allowedTopics.map(withItemId),
    allowedChannels: settings.allowedChannels.map(withItemId),
  };
}

export function fromRemote(remote: RemoteSettings, local: Pick<Settings, "hideShorts" | "keepSubscribed">): Settings {
  const withId = <T extends { itemId: string }>({ itemId, ...rest }: T) => ({ id: itemId, ...rest });
  return {
    paused: remote.paused,
    hideShorts: local.hideShorts,
    keepSubscribed: local.keepSubscribed,
    categories: remote.categories.map(withId),
    allowedTopics: remote.allowedTopics.map(withId),
    allowedChannels: remote.allowedChannels.map(withId),
  };
}
