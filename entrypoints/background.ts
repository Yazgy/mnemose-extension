import { defineBackground, browser } from "#imports";
import {
  clearSession,
  getSession,
  getToken,
  setSession,
} from "@/lib/storage";
import type { BgRequest, BgResponse, Profile } from "@/lib/types";

const BASE = (import.meta.env.WXT_MNEMOSE_URL as string) || "https://mnemose.com";

async function apiFetch(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<BgResponse> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (data && data.error) || `HTTP ${res.status}`,
      };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}

async function handle(msg: BgRequest): Promise<BgResponse> {
  switch (msg.type) {
    case "GET_SESSION": {
      const session = await getSession();
      return { ok: true, data: session };
    }

    case "SET_TOKEN": {
      const probe = await apiFetch("/api/extension/me", msg.token, {
        method: "GET",
      });
      if (!probe.ok) return probe;
      const profile = probe.data as Profile;
      await setSession({ token: msg.token, profile });
      return { ok: true, data: profile };
    }

    case "CLEAR_TOKEN": {
      await clearSession();
      return { ok: true, data: null };
    }

    case "RESOLVE": {
      const token = await getToken();
      if (!token) return { ok: false, error: "no_token", status: 401 };
      return apiFetch("/api/extension/resolve", token, {
        method: "POST",
        body: JSON.stringify({ input: msg.input, lang: msg.lang }),
      });
    }

    case "PROGRESS": {
      const token = await getToken();
      if (!token) return { ok: false, error: "no_token", status: 401 };
      return apiFetch("/api/extension/progress", token, {
        method: "POST",
        body: JSON.stringify(msg.payload),
      });
    }

    default:
      return { ok: false, error: "unknown_message" };
  }
}

export default defineBackground(() => {
  // webextension-polyfill: returning a Promise is the portable way to answer
  // asynchronously (works the same in Firefox and Chrome).
  browser.runtime.onMessage.addListener((message) => handle(message as BgRequest));
});
