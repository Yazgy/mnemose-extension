// Downloads the signed .xpi for the current package.json version from AMO.
// Unlisted files need JWT auth — this is how the release workflow gets the
// file to host on GitHub Releases.
//
//   FIREFOX_JWT_ISSUER=... FIREFOX_JWT_SECRET=... node scripts/fetch-signed-xpi.mjs
//
// Writes ./mnemose-<version>.xpi. No deps — Node 18+.

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const ADDON_ID = "mnemose@yazgy";
const ISSUER = process.env.FIREFOX_JWT_ISSUER;
const SECRET = process.env.FIREFOX_JWT_SECRET;
if (!ISSUER || !SECRET) {
  console.error("Missing FIREFOX_JWT_ISSUER / FIREFOX_JWT_SECRET");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ iss: ISSUER, jti: randomBytes(8).toString("hex"), iat: now, exp: now + 240 });
  const s = createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
const auth = () => ({ Authorization: `JWT ${jwt()}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findFile() {
  const res = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${ADDON_ID}/versions/?filter=all_with_unlisted`,
    { headers: auth() },
  );
  if (!res.ok) throw new Error(`versions API ${res.status}: ${await res.text()}`);
  const { results } = await res.json();
  const v = results.find((x) => x.version === version);
  return v?.file ?? null;
}

// AMO's automated signing is usually fast, but isn't guaranteed to finish
// within a few minutes (e.g. a first-time submission needing a closer look).
// 60 * 20s = 20 minutes before giving up.
const MAX_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 20_000;

let file = null;
let signed = false;
for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
  file = await findFile();
  if (file?.url && (file.status === "public" || file.status === "approved" || file.signed)) {
    signed = true;
    break;
  }
  console.log(`waiting for signing… (${i + 1}/${MAX_ATTEMPTS}, status=${file?.status ?? "?"})`);
  await sleep(POLL_INTERVAL_MS);
}
if (!signed) {
  // Never publish an unsigned build — fail loudly instead. Once AMO shows
  // it as approved (addons.mozilla.org/developers/addon/mnemose/versions),
  // re-run this release with `republish_only` to fetch + publish it without
  // resubmitting.
  console.error(
    `Gave up waiting for AMO to sign ${version} after ${MAX_ATTEMPTS} attempts ` +
      `(last status: ${file?.status ?? "unknown"}). Check ` +
      "https://addons.mozilla.org/developers/addon/mnemose/versions — once it shows " +
      "as approved, re-run this workflow with republish_only=true.",
  );
  process.exit(1);
}

const dl = await fetch(file.url, { headers: auth() });
if (!dl.ok) throw new Error(`download ${dl.status}: ${await dl.text()}`);
writeFileSync(`mnemose-${version}.xpi`, Buffer.from(await dl.arrayBuffer()));
console.log(`saved mnemose-${version}.xpi`);
