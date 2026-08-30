import { useCallback, useEffect, useState } from "react";
import { browser } from "#imports";
import * as api from "@/lib/api";
import { detectActiveTab, guessQuery } from "@/lib/detect";
import { forgetSite, getSiteMemory, rememberSite } from "@/lib/storage";
import type {
  DetectedTab,
  Interaction,
  Profile,
  ResolveResponse,
  WatchStatus,
  Work,
} from "@/lib/types";

const BASE =
  (import.meta.env.WXT_MNEMOSE_URL as string) || "https://mnemose.com";
const LANG = navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
const T = LANG === "fr";

const STATUSES: WatchStatus[] = [
  "planned",
  "watching",
  "completed",
  "on_hold",
  "dropped",
];
const STATUS_LABEL: Record<WatchStatus, string> = T
  ? {
      planned: "prévu",
      watching: "en cours",
      completed: "terminé",
      on_hold: "en pause",
      dropped: "abandonné",
    }
  : {
      planned: "planned",
      watching: "watching",
      completed: "completed",
      on_hold: "on hold",
      dropped: "dropped",
    };

const ERROR_LABEL: Record<string, string> = T
  ? {
      no_token: "Reconnecte-toi.",
      unsupported_url:
        "Lien non reconnu. Colle un lien Mnemose / TMDB / MAL, ou tape un titre.",
      not_found: "Rien trouvé pour ça.",
      anilist_no_mal: "Cet AniList n'a pas d'équivalent MyAnimeList.",
      resolve_required: "Réessaie : la fiche n'était pas encore prête.",
      upstream_error: "Service externe indisponible. Réessaie.",
    }
  : {
      no_token: "Please reconnect.",
      unsupported_url:
        "Unrecognised link. Paste a Mnemose / TMDB / MAL link, or type a title.",
      not_found: "Nothing found for that.",
      anilist_no_mal: "This AniList entry has no MyAnimeList match.",
      resolve_required: "Try again — the entry wasn't ready.",
      upstream_error: "External service unavailable. Try again.",
    };

function errText(code: string): string {
  return (
    ERROR_LABEL[code] ||
    (T ? "Une erreur est survenue." : "Something went wrong.")
  );
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refresh = useCallback(async () => {
    const res = await api.getSession();
    setProfile(res.ok && res.data ? res.data.profile : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return <p className="muted">…</p>;

  return profile ? (
    <Main
      profile={profile}
      onDisconnect={async () => {
        await api.clearToken();
        setProfile(null);
      }}
    />
  ) : (
    <Connect onConnected={refresh} />
  );
}

function Connect({ onConnected }: { onConnected: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    const res = await api.setToken(token);
    setBusy(false);
    if (res.ok) onConnected();
    else
      setError(
        res.error === "Unauthorized"
          ? T
            ? "Token invalide."
            : "Invalid token."
          : errText(res.error),
      );
  };

  return (
    <div className="col">
      <div className="header">
        <span className="brand">
          Mnemose<span>.</span>
        </span>
      </div>
      <p className="muted">
        {T
          ? "Colle le token généré dans Réglages → Extension sur Mnemose."
          : "Paste the token generated in Settings → Extension on Mnemose."}
      </p>
      <input
        type="text"
        value={token}
        placeholder="mnem_ext_…"
        onChange={(e) => setToken(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="row">
        <button className="primary" onClick={submit} disabled={busy}>
          {busy ? "…" : T ? "Connecter" : "Connect"}
        </button>
        <button
          className="linklike"
          onClick={() =>
            browser.tabs.create({ url: `${BASE}/${LANG}/settings` })
          }
        >
          {T ? "Où le trouver ?" : "Where to find it?"}
        </button>
      </div>
      {error && <div className="toast err">{error}</div>}
    </div>
  );
}

type Phase = "detecting" | "busy" | "work" | "candidates" | "nothing";

function Main({
  profile,
  onDisconnect,
}: {
  profile: Profile;
  onDisconnect: () => void;
}) {
  const [detected, setDetected] = useState<DetectedTab | null>(null);
  const [phase, setPhase] = useState<Phase>("detecting");
  const [candidates, setCandidates] = useState<Work[]>([]);
  const [work, setWork] = useState<Work | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [correction, setCorrection] = useState("");

  const [status, setStatus] = useState<WatchStatus>("watching");
  const [progress, setProgress] = useState(0);
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);

  const applyWork = useCallback(
    (w: Work, it: Interaction | null, episodeHint?: number) => {
      setWork(w);
      setStatus(it?.status ?? "watching");
      setRating(it?.rating ?? 0);
      setProgress(it?.progress ?? (episodeHint && !it ? episodeHint : 0));
      setCandidates([]);
      setPhase("work");
      setError(null);
    },
    [],
  );

  const runResolve = useCallback(
    async (input: string, episodeHint?: number) => {
      if (!input.trim()) return;
      setPhase("busy");
      setError(null);
      setSaved(false);

      // A title search can come back as candidates; if there's exactly one,
      // resolve it straight into a full work (loop, no list shown).
      let step = input.trim();
      for (let i = 0; i < 2; i += 1) {
        const res = await api.resolve(step, LANG);
        if (!res.ok) {
          setError(errText(res.error));
          setPhase(candidates.length ? "candidates" : "nothing");
          return;
        }
        const data = res.data as ResolveResponse;
        if (data.kind === "work") {
          applyWork(data.work, data.interaction, episodeHint);
          return;
        }
        const only =
          data.candidates.length === 1 ? data.candidates[0] : undefined;
        if (only) {
          step = only.mnemose_url;
          continue;
        }
        if (data.candidates.length === 0) {
          setError(errText("not_found"));
          setPhase("nothing");
          return;
        }
        setCandidates(data.candidates);
        setPhase("candidates");
        return;
      }
    },
    [applyWork, candidates.length],
  );

  // Auto-detect + auto-resolve on open — no button to press.
  useEffect(() => {
    (async () => {
      const tab = await detectActiveTab();
      setDetected(tab);
      if (!tab) {
        setPhase("nothing");
        return;
      }
      const memory = await getSiteMemory(tab.hostname);
      if (memory) {
        setRemembered(true);
        void runResolve(memory.mnemose_url, tab.episode);
        return;
      }
      const guess = guessQuery(tab);
      if (guess.length >= 2) void runResolve(guess, tab.episode);
      else setPhase("nothing");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!work) return;
    setSaving(true);
    setError(null);
    const isMovie = work.media_type === "movie";
    const res = await api.saveProgress({
      item_id: work.item_id,
      source_api: work.source_api,
      media_type: work.media_type,
      status,
      progress: isMovie ? (status === "completed" ? 1 : 0) : progress,
      rating,
      mode: "set",
    });
    setSaving(false);
    if (!res.ok) {
      setError(errText(res.error));
      return;
    }
    setSaved(true);
    if (detected?.hostname) {
      await rememberSite(detected.hostname, work);
      setRemembered(true);
    }
  };

  const maxEp = work?.max_episodes ?? undefined;
  const clampEp = (n: number) => Math.max(0, maxEp ? Math.min(n, maxEp) : n);

  return (
    <div className="col">
      <div className="header">
        <span className="brand">
          Mnemose<span>.</span>
        </span>
        <div className="row">
          <span className="muted">{profile.username ?? "—"}</span>
          <button className="linklike" onClick={onDisconnect}>
            {T ? "déconnexion" : "sign out"}
          </button>
        </div>
      </div>

      {phase === "detecting" && (
        <p className="muted">{T ? "Détection…" : "Detecting…"}</p>
      )}
      {phase === "busy" && (
        <p className="muted">{T ? "Recherche…" : "Searching…"}</p>
      )}

      {phase === "nothing" && (
        <p className="muted">
          {T
            ? "Aucune œuvre détectée sur cette page. Colle un lien ci-dessous."
            : "No title detected on this page. Paste a link below."}
        </p>
      )}

      {phase === "candidates" && (
        <>
          <p className="muted">
            {T ? "Plusieurs correspondances :" : "Several matches:"}
          </p>
          <ul className="candidates">
            {candidates.map((c) => (
              <li key={`${c.source_api}-${c.item_id}`}>
                <button
                  onClick={() => runResolve(c.mnemose_url, detected?.episode)}
                >
                  {c.title}
                  {c.year ? ` (${c.year})` : ""} · {c.media_type}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {phase === "work" && work && (
        <>
          <div className="card">
            {work.poster_path ? (
              <img src={work.poster_path} alt="" />
            ) : (
              <div className="poster-fallback" />
            )}
            <div>
              <div className="title">
                {work.title}
                {work.year ? ` (${work.year})` : ""}
              </div>
              <span className="badge">{work.media_type}</span>
              <div style={{ marginTop: 6 }}>
                <a
                  className="open-link"
                  href={work.mnemose_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {T ? "Ouvrir dans Mnemose ↗" : "Open in Mnemose ↗"}
                </a>
              </div>
            </div>
          </div>

          <div>
            <div className="field-label">{T ? "Statut" : "Status"}</div>
            <div className="status-grid">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  className={s === status ? "active" : ""}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {work.media_type !== "movie" && (
            <div>
              <div className="field-label">
                {T ? "Épisode" : "Episode"}
                {maxEp ? ` · max ${maxEp}` : ""}
              </div>
              <div className="stepper">
                <button
                  type="button"
                  aria-label="-1"
                  onClick={() => setProgress((p) => clampEp(p - 1))}
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(progress)}
                  onChange={(e) =>
                    setProgress(
                      clampEp(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="+1"
                  onClick={() => setProgress((p) => clampEp(p + 1))}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="field-label">
              {T ? "Note" : "Rating"} · {rating}/10
            </div>
            <div className="stepper">
              <button
                type="button"
                aria-label="-1"
                onClick={() => setRating((r) => Math.max(0, r - 1))}
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={String(rating)}
                onChange={(e) =>
                  setRating(
                    Math.max(
                      0,
                      Math.min(
                        10,
                        parseInt(e.target.value.replace(/\D/g, ""), 10) || 0,
                      ),
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label="+1"
                onClick={() => setRating((r) => Math.min(10, r + 1))}
              >
                +
              </button>
            </div>
          </div>

          <button className="primary" onClick={save} disabled={saving}>
            {saving ? "…" : T ? "Enregistrer" : "Save"}
          </button>

          {remembered && detected?.hostname && (
            <button
              className="ghost"
              onClick={async () => {
                await forgetSite(detected.hostname);
                setRemembered(false);
              }}
            >
              {T ? "Oublier ce site" : "Forget this site"}
            </button>
          )}
        </>
      )}

      {saved && (
        <div className="toast ok">{T ? "Enregistré ✓" : "Saved ✓"}</div>
      )}
      {error && <div className="toast err">{error}</div>}

      {phase !== "detecting" && phase !== "busy" && (
        <div className="correction">
          <div className="field-label">
            {phase === "work"
              ? T
                ? "Ce n'est pas l'œuvre que tu regardes ?"
                : "Not what you're watching?"
              : T
                ? "Colle le lien de l'œuvre"
                : "Paste the work's link"}
          </div>
          <input
            type="text"
            value={correction}
            placeholder={
              T ? "lien Mnemose / TMDB / MAL… ou un titre" : "Mnemose / TMDB / MAL link… or a title"
            }
            onChange={(e) => setCorrection(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && correction.trim()) {
                runResolve(correction.trim(), detected?.episode);
                setCorrection("");
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
