import { browser } from "#imports";
import type { DetectedTab } from "./types";

// Runs IN the page (must be fully self-contained — no outside references).
function scrapePage(): {
  url: string;
  title: string;
  ogTitle?: string;
  jsonLdTitle?: string;
  episode?: number;
} {
  const meta = (selector: string): string | undefined =>
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || undefined;

  const ogTitle =
    meta('meta[property="og:title"]') || meta('meta[name="title"]');

  let jsonLdTitle: string | undefined;
  let episode: number | undefined;
  for (const node of Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    ),
  )) {
    try {
      const parsed = JSON.parse(node.textContent || "null");
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        const type = String(entry?.["@type"] || "").toLowerCase();
        if (
          !jsonLdTitle &&
          ["movie", "tvseries", "tvepisode", "videoobject", "creativework"].includes(
            type,
          )
        ) {
          jsonLdTitle =
            entry?.partOfSeries?.name || entry?.partOfTVSeries?.name || entry?.name;
        }
        if (episode === undefined && entry?.episodeNumber != null) {
          const num = Number(entry.episodeNumber);
          if (Number.isFinite(num)) episode = num;
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  const haystack = `${ogTitle || ""} ${document.title}`;
  if (episode === undefined) {
    const m =
      haystack.match(/S\d+\s*[:\s]?\s*E(?:p|pisode)?\s*(\d{1,4})/i) ||
      haystack.match(/(?:episode|épisode|\bep\.?)\s*(\d{1,4})/i);
    if (m) episode = Number(m[1]);
  }

  return { url: location.href, title: document.title, ogTitle, jsonLdTitle, episode };
}

function hostFrom(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function detectActiveTab(): Promise<DetectedTab | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  // Reading the page directly (activeTab grant from the toolbar click) is the
  // reliable path: it works even if Firefox withholds the `tabs` fields, and it
  // sees the *current* title on JS-heavy streaming SPAs.
  try {
    const [res] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePage,
    });
    const s = res?.result as ReturnType<typeof scrapePage> | undefined;
    if (s) {
      const url = s.url || tab.url || "";
      return {
        url,
        hostname: hostFrom(url),
        title: s.title || tab.title || "",
        ogTitle: s.ogTitle,
        jsonLdTitle: s.jsonLdTitle,
        episode: s.episode,
      };
    }
  } catch {
    // privileged page (about:, addons, PDF viewer…) — fall back to tab fields
  }

  const url = tab.url ?? "";
  const title = tab.title ?? "";
  if (!url && !title) return null;
  return { url, hostname: hostFrom(url), title };
}

// Best guess at a searchable title from what the page gave us.
const SITE_SUFFIX =
  /\s*[|·–—-]\s*(netflix|crunchyroll|prime\s*video|disney\+?|adn|animation digital network|wakanim|voiranime|anime-?sama|vostfree|max|hbo\s*max|hulu|paramount\+?|apple\s*tv\+?|youtube).*$/i;
const EPISODE_TAIL =
  /\s*(?:[|·–—-]\s*)?\b(?:episode|épisode|ep\.?|s\d+\s*e\d+|saison\s*\d+|season\s*\d+|vostfr|vf|vo|streaming)\b.*$/i;

export function guessQuery(detected: DetectedTab): string {
  const raw = detected.jsonLdTitle || detected.ogTitle || detected.title || "";
  return raw
    .replace(SITE_SUFFIX, "")
    .replace(EPISODE_TAIL, "")
    .replace(/\bwatch\b/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
