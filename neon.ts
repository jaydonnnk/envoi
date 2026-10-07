import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Managed auth off: sessions and the anonymous-user policy live in our app.
  auth: false,
  preview: {
    // Upgrade to a paid plan to enable AI Gateway for your project.
    // aiGateway: true,
  },
});
