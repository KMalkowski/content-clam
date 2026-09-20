export const env = {
  clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string,
  convexUrl: import.meta.env.VITE_CONVEX_URL as string,
  storeUrl: (import.meta.env.VITE_CHROME_STORE_URL as string | undefined) ?? "#",
  supportEmail: (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? "support@example.com",
};
