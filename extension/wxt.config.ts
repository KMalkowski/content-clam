import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: ({ mode }) => {
    const syncHost = process.env.WXT_CLERK_SYNC_HOST;
    const frontendApi = process.env.WXT_CLERK_FRONTEND_API;
    const hostPermissions = ["*://*.youtube.com/*"];
    if (syncHost) hostPermissions.push(`${syncHost}/*`);
    if (frontendApi) hostPermissions.push(`${frontendApi}/*`);
    return {
      name: mode === "development" ? "Content Clam (dev)" : "Content Clam",
      description: "Dims YouTube videos that match categories you choose to filter.",
      permissions: ["storage", "cookies", "alarms"],
      host_permissions: hostPermissions,
      key: process.env.WXT_CRX_PUBLIC_KEY,
    };
  },
});
