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

let file = null;
for (let i = 0; i < 20; i += 1) {
  file = await findFile();
  if (file?.url && (file.status === "public" || file.status === "approved" || file.signed)) break;
  console.log(`waiting for signing… (${i + 1}/20, status=${file?.status ?? "?"})`);
  await sleep(15_000);
}
if (!file?.url) {
  console.error(`No signed file for ${version}`);
  process.exit(1);
}

const dl = await fetch(file.url, { headers: auth() });
if (!dl.ok) throw new Error(`download ${dl.status}: ${await dl.text()}`);
writeFileSync(`mnemose-${version}.xpi`, Buffer.from(await dl.arrayBuffer()));
console.log(`saved mnemose-${version}.xpi`);
