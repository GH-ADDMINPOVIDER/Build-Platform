import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ai.ogenic.chat",
  appName: "OGENIC AI",
  webDir: "dist/client",
  server: {
    androidScheme: "https",
  },
};

export default config;
