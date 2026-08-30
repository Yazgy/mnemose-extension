import { storage } from "#imports";
import type { Profile, Work } from "./types";

// Per-viewer, on this browser only. `session` holds the connection; `sites`
// remembers which Mnemose work a given streaming domain maps to.

interface Session {
  token: string;
  profile: Profile;
}

const sessionItem = storage.defineItem<Session | null>("local:session", {
  fallback: null,
});

const sitesItem = storage.defineItem<Record<string, Work>>("local:sites", {
  fallback: {},
});

export async function getSession(): Promise<Session | null> {
  return sessionItem.getValue();
}

export async function setSession(session: Session): Promise<void> {
  await sessionItem.setValue(session);
}

export async function clearSession(): Promise<void> {
  await sessionItem.setValue(null);
}

export async function getToken(): Promise<string | null> {
  return (await sessionItem.getValue())?.token ?? null;
}

export async function getSiteMemory(hostname: string): Promise<Work | null> {
  if (!hostname) return null;
  const sites = await sitesItem.getValue();
  return sites[hostname] ?? null;
}

export async function rememberSite(
  hostname: string,
  work: Work,
): Promise<void> {
  if (!hostname) return;
  const sites = await sitesItem.getValue();
  sites[hostname] = work;
  await sitesItem.setValue(sites);
}

export async function forgetSite(hostname: string): Promise<void> {
  const sites = await sitesItem.getValue();
  if (hostname in sites) {
    delete sites[hostname];
    await sitesItem.setValue(sites);
  }
}
