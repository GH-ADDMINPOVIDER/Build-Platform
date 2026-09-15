import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ai.ogenic.chat",
  appName: "OGENIC AI",
  webDir: "dist/client",
  // Staging/internal preview only. Native builds load the protected staging Worker,
  // which detects Capacitor and renders the dedicated mobile UI instead of Web Dev.
  server: {
    url: "https://ogenic-phase-vi-staging.tawatchaisamornrum11.workers.dev",
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
