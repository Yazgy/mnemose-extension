import { browser } from "#imports";
import type { DetectedTab } from "./types";

// Runs IN the page (must be fully self-contained — no outside references).
function scrapePage(): {
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

  return { title: document.title, ogTitle, jsonLdTitle, episode };
}

export async function detectActiveTab(): Promise<DetectedTab | null> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id || !tab.url) return null;

  let hostname = "";
  try {
    hostname = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    hostname = "";
  }

  const base: DetectedTab = {
    url: tab.url,
    hostname,
    title: tab.title ?? "",
  };

  // executeScript fails on privileged pages (about:, addons, the store) — that
  // is fine, we still have the tab title/url.
  if (!/^https?:/.test(tab.url)) return base;

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePage,
    });
    const scraped = results?.[0]?.result as
      | ReturnType<typeof scrapePage>
      | undefined;
    if (scraped) {
      return {
        ...base,
        title: scraped.title || base.title,
        ogTitle: scraped.ogTitle,
        jsonLdTitle: scraped.jsonLdTitle,
        episode: scraped.episode,
      };
    }
  } catch {
    // no scripting permission for this page — keep the basics
  }

  return base;
}

// Best guess at a searchable title from what the page gave us.
export function guessQuery(detected: DetectedTab): string {
  const raw = detected.jsonLdTitle || detected.ogTitle || detected.title || "";
  return raw
    .replace(/\s*[|–—-]\s*(netflix|crunchyroll|prime video|disney\+?|adn|wakanim|voiranime|anime-sama|max|hulu).*$/i, "")
    .replace(/\bwatch\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
