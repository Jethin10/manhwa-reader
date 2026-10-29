import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for Android (and iOS on a Mac). Scraping and image processing need a Node
 * server, so the app opens a bundled connect screen (mobile/www) that remembers your Manhwa
 * server and loads it full screen.
 */
const config: CapacitorConfig = {
  appId: "com.jethin.manhwa",
  appName: "Manhwa",
  webDir: "mobile/www",
  // Lets the web app detect the native shell and its version (see NativeServerLink, AppUpdate).
  appendUserAgent: `ManhwaApp/${process.env.APP_VERSION ?? "0.0.0"}`,
  backgroundColor: "#000000",
  server: {
    androidScheme: "https",
    // Home servers usually run plain http on the LAN.
    cleartext: true,
    allowNavigation: ["*"],
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#000000",
  },
  ios: {
    backgroundColor: "#000000",
    contentInset: "never",
  },
  plugins: {
    SystemBars: { insetsHandling: "css", style: "DARK", initialViewportFitValueHint: "cover" },
    SplashScreen: { launchShowDuration: 600, backgroundColor: "#000000", showSpinner: false },
  },
};

export default config;
