# Mnemose — Browser Extension

A companion browser extension for [Mnemose](https://mnemose.com), the
movie / TV / anime tracker.

It lets you update your watch progress **from the page you're watching on**,
instead of opening Mnemose and searching for the title every time. When you
click the toolbar icon it reads the title of the current tab, matches it
against your Mnemose catalogue, and lets you bump the episode / status / rating
in two clicks.

> **Status: pre-alpha.** Nothing is published to the stores yet.

## How V1 works

- **Click the toolbar icon** (nothing runs on a page until you do — that click
  is the trust boundary). The popup reads the active tab's title, `og:title`
  and JSON-LD and resolves the work **automatically** — no button to press.
- If it picked the wrong thing, a field at the bottom lets you **paste a link**
  — a Mnemose URL, or a TMDB / MyAnimeList / AniList / IMDb / Letterboxd link —
  or type a title and pick from the results.
- Pick the work, set **status / episode / rating**, hit save. The update goes
  to your Mnemose library through a token tied to your account.
- The extension **remembers which work a site maps to**, so the next time you
  open the popup on that domain it's already selected.

Because detection is generic (tab title + `og:title` + JSON-LD) it works on any
streaming site — official or not, present or future — without a per-site list.

Automatic playback tracking (hooking the `<video>` element) is **out of scope**
for V1.

## Development

Requires Node 20+.

```bash
npm install
npm run dev:firefox        # opens Firefox Developer Edition with the extension loaded
```

Or build and load it manually:

```bash
npm run build:firefox      # -> .output/firefox-mv3/
```

then go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
pick `.output/firefox-mv3/manifest.json`.

A Chrome build exists (`npm run build`, load `.output/chrome-mv3/` as an
unpacked extension) but Firefox is the tested target for now.

## Configuration

The Mnemose instance the extension talks to is set by `WXT_MNEMOSE_URL`:

- `.env` → `https://mnemose.com` — used by production builds / the signed `.xpi`
- `.env.development` → `http://localhost:3000` — used automatically by `npm run dev*`

`npm run dev*` also whitelists `http://localhost:3000` in the manifest.

## Releasing (Firefox, self-distributed)

The add-on is **unlisted** on AMO: Mozilla signs it but doesn't list it and —
importantly — **doesn't host a public download** for it. So the signed `.xpi`
is hosted on **GitHub Releases**, and `updates.json` (polled by Firefox via the
manifest's `update_url`) points there. That's what makes installs auto-update.

The **first** version is created through the AMO website (the source-code review
can't be skipped by the API). After that, a release is just:

1. bump `version` in `package.json` (AMO rejects a re-upload of the same version)
2. `git commit`, then `git tag vX.Y.Z && git push --follow-tags`

The `Release` GitHub Action then:
- `wxt zip -b firefox` → `wxt submit` (uploads to AMO, which signs it)
- `scripts/fetch-signed-xpi.mjs` → pulls the signed `.xpi` back via the AMO API
- creates GitHub Release `vX.Y.Z` with `mnemose-X.Y.Z.xpi` attached
- `scripts/sync-updates-json.mjs` → repoints `updates.json`, commits it to `main`

> Repo secrets: `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`,
> `FIREFOX_JWT_SECRET` (AMO → Developer Hub → Manage API Keys).

**By hand** (first release, or without CI):
1. `npx wxt zip -b firefox`, upload both zips on the AMO version page
2. once signed, get the `.xpi`: right-click the AMO download link → *Save Link
   As* (a plain click installs it), or copy it from
   `~/.mozilla/firefox/<profile>/extensions/mnemose@yazgy.xpi` after installing
3. create GitHub Release `vX.Y.Z`, attach the file twice — as `mnemose-X.Y.Z.xpi`
   (referenced by `updates.json`) and as `mnemose-firefox.xpi` (the constant
   "latest" link the Mnemose Settings button uses)
4. `node scripts/sync-updates-json.mjs` and commit `updates.json`

## Connecting

1. On Mnemose, go to **Settings → Extension** and generate a token.
2. Click the extension's toolbar icon and paste the token.

Tokens are revocable from the same settings page. The extension only ever sends
the detected title / the work id / your chosen status-episode-rating, plus that
token — no browsing history.

## Requirements

A Mnemose account. Main project: <https://github.com/Yazgy/Mnemose>

## License

TBD
