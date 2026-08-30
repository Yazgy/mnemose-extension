// Regenerates updates.json for the current package.json version.
//
// Unlisted (self-distributed) AMO files are NOT publicly downloadable, so the
// signed .xpi is hosted on GitHub Releases instead. This just points
// updates.json at the release asset for the current version — the release
// workflow uploads the actual file.
//
//   node scripts/sync-updates-json.mjs
//
// No deps — Node 18+.

import { readFileSync, writeFileSync } from "node:fs";

const REPO = "Yazgy/mnemose-extension";
const ADDON_ID = "mnemose@yazgy";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const updates = {
  addons: {
    [ADDON_ID]: {
      updates: [
        {
          version,
          update_link: `https://github.com/${REPO}/releases/download/v${version}/mnemose-${version}.xpi`,
        },
      ],
    },
  },
};

writeFileSync("updates.json", JSON.stringify(updates, null, 2) + "\n");
console.log(`updates.json -> ${version}`);
