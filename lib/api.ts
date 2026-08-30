import { browser } from "#imports";
import type {
  BgRequest,
  BgResponse,
  Interaction,
  Profile,
  ResolveResponse,
  Work,
} from "./types";

async function send<T>(msg: BgRequest): Promise<BgResponse<T>> {
  return (await browser.runtime.sendMessage(msg)) as BgResponse<T>;
}

export async function getSession() {
  return send<{ token: string; profile: Profile } | null>({ type: "GET_SESSION" });
}

export async function setToken(token: string) {
  return send<Profile>({ type: "SET_TOKEN", token: token.trim() });
}

export async function clearToken() {
  return send<null>({ type: "CLEAR_TOKEN" });
}

export async function resolve(input: string, lang: string) {
  return send<ResolveResponse>({ type: "RESOLVE", input, lang });
}

export async function saveProgress(payload: {
  item_id: string;
  source_api: Work["source_api"];
  media_type: Work["media_type"];
  status: Interaction["status"];
  progress?: number;
  rating?: number;
  mode?: "set" | "merge";
}) {
  return send<{ interaction: Interaction }>({ type: "PROGRESS", payload });
}
