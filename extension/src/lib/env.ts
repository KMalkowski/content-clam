export const env = {
  clerkPublishableKey: import.meta.env.WXT_CLERK_PUBLISHABLE_KEY as string | undefined,
  clerkSyncHost: import.meta.env.WXT_CLERK_SYNC_HOST as string | undefined,
  convexUrl: import.meta.env.WXT_CONVEX_URL as string | undefined,
  webUrl: (import.meta.env.WXT_WEB_URL as string | undefined) ?? "http://localhost:5173",
};

export const hostedModeAvailable = Boolean(env.clerkPublishableKey && env.convexUrl);
