// Mirrors the shapes returned by the Mnemose /api/extension/* routes.

export type SourceApi = "tmdb" | "jikan";
export type MediaType = "movie" | "tv" | "anime";
export type WatchStatus =
  | "planned"
  | "watching"
  | "completed"
  | "on_hold"
  | "dropped";

export interface Work {
  item_id: string;
  source_api: SourceApi;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  genres: string[];
  max_episodes: number | null;
  runtime_minutes: number | null;
  external_rating: number | null;
  is_adult: boolean;
  year: string | null;
  mnemose_path: string;
  mnemose_url: string;
}

export interface Interaction {
  status: WatchStatus;
  progress: number | null;
  rating: number | null;
  rewatch: number | null;
}

export interface Profile {
  username: string | null;
  avatar_url: string | null;
}

export type ResolveResponse =
  | { kind: "work"; work: Work; interaction: Interaction | null }
  | { kind: "candidates"; candidates: Work[] };

export interface DetectedTab {
  url: string;
  hostname: string;
  title: string;
  ogTitle?: string;
  jsonLdTitle?: string;
  episode?: number;
}

// Background message protocol.
export type BgRequest =
  | { type: "GET_SESSION" }
  | { type: "SET_TOKEN"; token: string }
  | { type: "CLEAR_TOKEN" }
  | { type: "RESOLVE"; input: string; lang: string }
  | {
      type: "PROGRESS";
      payload: {
        item_id: string;
        source_api: SourceApi;
        media_type: MediaType;
        status: WatchStatus;
        progress?: number;
        rating?: number;
        mode?: "set" | "merge";
      };
    };

export type BgResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };
