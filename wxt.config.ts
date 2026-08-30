import { defineConfig } from "wxt";

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  // The Mnemose dev server owns port 3000 — keep WXT's HMR server off it.
  dev: {
    server: { port: 3199 },
  },
  // `npm run dev:firefox` opens a dedicated Firefox window. Keep its profile
  // between runs so the pasted token (and any login) survives a restart.
  webExt: {
    keepProfileChanges: true,
    firefoxProfile: ".wxt/firefox-profile",
  },
  manifest: ({ mode }) => ({
    name: "Mnemose",
    description:
      "Update your Mnemose watch progress straight from the streaming page.",
    // activeTab + scripting: read the current tab's title/metadata only when
    // the user clicks the toolbar icon — no persistent content script, no
    // broad host access on streaming sites.
    permissions: ["activeTab", "scripting", "storage"],
    // Only the Mnemose API. In dev we also allow the local server.
    host_permissions:
      mode === "development"
        ? ["https://mnemose.com/*", "http://localhost:3000/*"]
        : ["https://mnemose.com/*"],
    browser_specific_settings: {
      gecko: {
        id: "mnemose@yazgy",
        // 128+ for scripting.executeScript({ func }); 140+ so Firefox
        // understands the data_collection_permissions key below.
        strict_min_version: "140.0",
        // Self-distributed (unlisted) add-ons don't auto-update via AMO —
        // Firefox polls this manifest instead. Regenerated + committed by
        // the release workflow.
        update_url:
          "https://raw.githubusercontent.com/Yazgy/mnemose-extension/main/updates.json",
        // Required by AMO for new extensions. We read the page title /
        // og:title / JSON-LD of the tab you're on and send it (plus your
        // chosen status / episode / rating) to your own Mnemose account.
        // https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
        data_collection_permissions: {
          required: ["websiteContent"],
          optional: [],
          has_previous_consent: false,
        },
      },
    },
  }),
});
