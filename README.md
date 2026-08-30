# Mnemose — Browser Extension

A companion browser extension for [Mnemose](https://mnemose.com), the
movie / TV / anime tracker. It lets you update your watch progress **from the
page you are actually watching on**, instead of switching tabs to Mnemose and
searching for the title every time.

> **Status: early / pre-alpha.** Nothing is published to any store yet. This
> repository currently holds the design and the roadmap. See
> [Project status](#project-status).

---

## Why this exists

Mnemose already tracks what you watch, but logging progress is a manual chore:
open Mnemose, search the title, set the episode, save. You do that dozens of
times per season and eventually stop bothering — so the data drifts away from
reality.

The extension closes that gap. It recognises the work open in your current
tab, and either:

- lets you mark it watched / bump the episode in **one click** from the
  toolbar popup (works everywhere), or
- on sites you explicitly enable, **updates the episode for you** as you
  watch (opt-in, site by site).

### Why an action from the extension is better than "automatic tracking"

Streaming accounts are often shared — a family Netflix profile, a Jellyfin
server hosted by a friend, a shared login. Pure playback-based tracking cannot
know *who* is actually watching. An action taken through the extension always
originates from the Mnemose account of the person who clicked (or who enabled
auto-tracking in their own browser), so there is never any ambiguity.

---

## What it does

### V1 — assisted, manual (all sites)

1. A content script reads the **title** and, when present, the **episode
   number** from the current page (URL + DOM), without contacting the site's
   servers.
2. The title is matched against the Mnemose catalogue (fuzzy match, done
   server-side). If the guess is wrong, or the site is unknown, you paste the
   Mnemose link once and the extension remembers the association for that
   series.
3. From the popup you set status / rating / episode and it is pushed to your
   Mnemose library. Every update is an explicit action.

### V2 — per-site auto-tracking (opt-in, incremental)

For a site that has a stable enough **adapter**, the extension can advance your
episode progress automatically. Two levels, robust first:

- **Navigation heuristic (default).** Landing on "episode N" implies episodes
  `1 … N-1` are watched. This never touches the video player, so it keeps
  working even when playback happens inside a third‑party `<iframe>`. Low
  maintenance.
- **Playback hook (optional).** Listen to the `<video>` element
  (`timeupdate` / `ended`) and mark an episode done at ~90 %. More precise
  (catches "watched ep 12 but didn't open ep 13"), more fragile.

Auto-tracking is **off by default** and enabled per site by the user. Enabling
a site is what grants the extension permission to run on it.

### Special case — Jellyfin

Jellyfin exposes an official server-side **webhook**. Where the user controls
their Jellyfin server and has a personal profile on it, that is a cleaner path
than DOM scraping and may be supported directly (server → Mnemose), without the
extension. Tracked here for completeness; not part of the initial scope.

---

## How it works

```
┌─────────────┐   reads title / episode      ┌──────────────────┐
│  Web page   │◀──────────────────────────── │  content script  │
│ (any site)  │   URL + DOM only, no fetch   │  + site adapter  │
└─────────────┘                              └────────┬─────────┘
                                                      │ runtime messaging
                                             ┌────────▼─────────┐
┌─────────────┐   "mark watched" UI          │   background     │
│    popup    │◀────────────────────────────▶│  (service worker)│
└─────────────┘                              │  holds token,    │
                                             │  offline queue   │
                                             └────────┬─────────┘
                                                      │ HTTPS, Bearer token
                                             ┌────────▼─────────┐
                                             │  Mnemose API     │
                                             │  /api/extension/*│
                                             └──────────────────┘
```

### Pieces

| Part | Role |
|---|---|
| **content script** | Injected into pages. Reads URL + DOM via the active site adapter. Talks only to the background, never to the page's origin server. |
| **background (service worker)** | Holds the auth token, calls the Mnemose API, runs the retry queue. Keeps no in-memory state (MV3 workers are short-lived) — everything in `storage`. |
| **popup** | The toolbar UI: current detection, one-click "mark watched / +1 episode", link to the Mnemose page. |
| **options page** | Link / unlink the Mnemose account, per-site auto-tracking toggles. |
| **site adapters** | Declarative descriptors (URL patterns, CSS selectors, episode-number regex). Interpreted by code shipped in the extension — **never executed as remote code** (forbidden by MV3). The descriptor list can be refreshed from Mnemose so a new site does not require a new store release. |

### Mnemose side (to be built in the main repo)

- `extension_tokens` table — same idea as the existing Discord account-link
  tokens. One revocable, narrowly-scoped bearer token per browser.
- `POST /api/extension/progress` — `{ item_id, source_api, media_type, episode, status?, rating? }`
  → upserts `user_interactions`, reusing the existing status-automation rules.
  Rate-limited per token.
- `GET /api/extension/match?q=<title>&type=<movie|tv|anime>` — server-side fuzzy
  match against the catalogue, returns candidates.
- A "Connect the browser extension" flow in Settings that issues the token.

### Data flow / privacy

The extension sends to Mnemose, over HTTPS:

- the detected title (for matching) or a resolved work id,
- the episode / status / rating you are setting,
- your extension token.

It does **not** send browsing history, does not track pages other than the one
you are on, does not contact any server other than Mnemose, and does not touch
sites you have not enabled for auto-tracking. The token is stored in
`storage.local`, is scoped to progress writes only, and can be revoked from
Mnemose Settings at any time. A full privacy policy will ship with the first
release.

---

## Browser support

**One codebase, two builds.** Chrome and Firefox share the vast majority of the
WebExtensions API (both on Manifest V3). Build tooling produces a
Chrome package and a Firefox package from the same source, handling the small
differences (`chrome.*` vs `browser.*`, background worker declaration, Firefox's
`browser_specific_settings.gecko.id`).

| Target | Store | Notes |
|---|---|---|
| Chrome / Chromium (Edge, Brave, …) | Chrome Web Store | one-time developer fee |
| Firefox | addons.mozilla.org (AMO) | free; also allows a Mozilla-signed self-hosted build |

Planned toolchain: [WXT](https://wxt.dev) + TypeScript, lightweight popup
(vanilla or Preact), `webextension-polyfill` semantics.

---

## Project status

Design stage. Not yet published. Not yet installable.

### Roadmap

- [ ] **Mnemose API** — `extension_tokens` table, `/api/extension/progress`,
      `/api/extension/match`, Settings connect flow
- [ ] **Extension scaffold** — WXT project, manifest, messaging, token storage
- [ ] **V1** — generic title/episode detection, popup, one-click update,
      manual link-pasting fallback, offline retry queue
- [ ] **Adapter format** — descriptor schema + interpreter + bundled defaults
- [ ] **V2 — navigation heuristic** for the first supported site
- [ ] **V2 — optional playback hook**
- [ ] Remote adapter refresh
- [ ] Store submissions (AMO, then Chrome Web Store)
- [ ] Privacy policy, store listing copy, screenshots

### Planned repository layout

```
wxt.config.ts
src/
  entrypoints/
    background.ts
    content.ts
    popup/
    options/
  lib/
    api.ts          # Mnemose API client
    auth.ts         # token storage + connect handshake
    match.ts        # title -> work resolution (via Mnemose)
    queue.ts        # offline retry queue
  adapters/
    schema.ts       # adapter descriptor type
    registry.ts     # bundled defaults + remote refresh
    interpret.ts    # apply a descriptor to a page
```

---

## Contributing

The most useful contribution will be **site adapters** once the format lands: a
small declarative descriptor for a site (how to read the title and the episode
number, whether the navigation heuristic or a playback hook applies). Adapters
are data, not code.

Please keep store-facing materials (README aside), issue titles and adapter
metadata **generic**. The extension is content-source-agnostic by design; it
does not endorse or target any particular site.

---

## Relationship to Mnemose

This extension is a companion to Mnemose and requires a Mnemose account. It has
no function on its own. Main project: <https://github.com/Yazgy/Mnemose>.

---

## License

TBD.
