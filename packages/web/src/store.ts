import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Projeto } from "./api.ts";
import type { M } from "./logic/stages.ts";
import type { Ev } from "./logic/events.ts";
import type { Uso } from "./logic/emblem.ts";
import { lerAuto, type AutoStatus } from "./logic/frescor.ts";
import { connect } from "./sse.ts";
import { aplicarEventoLocal, type LocalStats, type LocalStatus } from "./logic/local.ts";
import { aplicarEventoArtigo, type Artigo, type EventoArtigo } from "./logic/redacao.ts";

export interface Live {
  missions: M[];
  usage?: Uso; // plan usage: GET /usage + SSE `usage`
  consultarUso: () => Promise<{ status: number; error: string } | undefined>; // manual consult; undefined = ok
  auto?: AutoStatus; // automatic refresh of the usage: GET /usage/auto + SSE `uso-auto`
  definirAuto: (b: { auto?: boolean; intervaloMin?: number }) => Promise<string | undefined>; // undefined = ok
  local?: LocalStatus; // local model (Ollama): GET /local/status + SSE `local`; undefined = unavailable (not configured / old server)
  localStats?: LocalStats;
  recarregarLocal: () => Promise<void>;
  projects: Projeto[];
  artigos: Artigo[]; // articles (Redação): GET /redacao + SSE `artigo`
  loading: boolean;
  error?: string; // initial/refresh failure
  up: boolean; // SSE connected
  retryInSec?: number;
  lastOkAt?: number;
  warnings: string[];
  events: Record<string, Ev[]>; // progress events per mission, this session only (the server keeps no replay)
  missionWarnings: Record<string, string[]>;
  reload: () => void;
  retryNow: () => void;
}

const BATCH_MS = 250;
const MAX_EVENTS = 500;

/** Missions and projects, kept fresh by SSE. Events are buffered and applied at most once per 250 ms. */
export function useLive(): Live {
  const [missions, setMissions] = useState<M[]>([]);
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [up, setUp] = useState(true);
  const [retryInSec, setRetryInSec] = useState<number>();
  const [lastOkAt, setLastOkAt] = useState<number>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [events, setEvents] = useState<Record<string, Ev[]>>({});
  const [missionWarnings, setMissionWarnings] = useState<Record<string, string[]>>({});
  const [usage, setUsage] = useState<Uso>();
  const [auto, setAuto] = useState<AutoStatus>();
  const cliente = useRef(`aba-${Math.random().toString(36).slice(2, 12)}`); // tab id: lets the server count visible tabs
  const [local, setLocal] = useState<LocalStatus>();
  const localRef = useRef<LocalStatus | undefined>(undefined);
  const [localStats, setLocalStats] = useState<LocalStats>();
  const [artigos, setArtigos] = useState<Artigo[]>([]);
  const conn = useRef<ReturnType<typeof connect>>(undefined);

  const reload = useCallback(async () => {
    const [ms, ps, us, ars, au] = await Promise.all([api.missions(), api.projects(), api.usage(), api.artigos(), api.usageAuto()]);
    if (au.ok) setAuto(lerAuto(au.data));
    if (ars.ok) setArtigos(ars.data.artigos);
    if (us.ok) setUsage(us.data);
    setLoading(false);
    if (ms.ok) { setMissions(ms.data.missions); setError(undefined); setLastOkAt(Date.now()); } else setError(ms.error);
    if (ps.ok) setProjects(ps.data.projects);
  }, []);

  const recarregarLocal = useCallback(async () => {
    const [st, ss] = await Promise.all([api.localStatus(), api.localStats()]);
    if (st.ok) { localRef.current = st.data; setLocal(st.data); }
    if (ss.ok) setLocalStats(ss.data);
  }, []);

  useEffect(() => {
    let buffer: Record<string, unknown>[] = [];
    let evBuf: { id: string; e: Ev }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let needRefetch = false;
    const flush = () => {
      timer = undefined;
      const batch = buffer;
      buffer = [];
      const evs = evBuf;
      evBuf = [];
      if (evs.length > 0) {
        setEvents((cur) => {
          const next = { ...cur };
          for (const { id, e } of evs) next[id] = [...(next[id] ?? []), e].slice(-MAX_EVENTS);
          return next;
        });
      }
      if (needRefetch) { needRefetch = false; void reload(); return; }
      setMissions((cur) => {
        const byId = new Map(cur.map((m) => [m.id, m]));
        for (const s of batch) {
          const old = byId.get(String(s["id"]));
          if (old) {
            // JSON drops undefined keys, so a cleared pause/stop reason must be reset explicitly; a stage change also
            // brings fields the summary lacks (pausedFrom, tokens, costs): refetch the full list.
            byId.set(old.id, { ...old, ...(s as Partial<M>), pauseReason: s["pauseReason"] as string | undefined, stopReason: s["stopReason"] as string | undefined });
            if (old.stage !== s["stage"]) needRefetch = true;
          }
          else needRefetch = true; // unknown mission: the summary lacks the demand text, fetch the full list
        }
        return [...byId.values()];
      });
      if (needRefetch) { needRefetch = false; void reload(); }
    };
    void reload();
    void recarregarLocal();
    conn.current = connect({
      onEvent: (name, data) => {
        if (name === "warning") {
          const w = data as { message?: unknown; missionId?: unknown };
          if (typeof w.message === "string") {
            const msg = w.message;
            setWarnings((cur) => [...cur.slice(-4), msg]);
            if (typeof w.missionId === "string") { const id = w.missionId; setMissionWarnings((cur) => ({ ...cur, [id]: [...(cur[id] ?? []), msg] })); }
          }
          return;
        }
        if (name === "artigo" && data && typeof data === "object") {
          const ev = data as EventoArtigo;
          if (typeof ev.slug !== "string") return;
          setArtigos((cur) => { const r = aplicarEventoArtigo(cur, ev); if (r.recarregar) void reload(); return r.lista; });
          return;
        }
        if (name === "local") {
          const r = aplicarEventoLocal(localRef.current, data);
          localRef.current = r.status;
          setLocal(r.status);
          if (r.recarregar) void recarregarLocal();
          else void api.localStats().then((x) => { if (x.ok) setLocalStats(x.data); }); // stats change only when a call ends
          return;
        }
        if (name === "notificacao" || name === "notificacao-sync") { window.dispatchEvent(new CustomEvent(name, { detail: data })); return; } // handled by useNotificacoes
        if (name === "uso-auto") { const a = lerAuto(data); if (a) setAuto(a); return; }
        if (name === "usage" && data && typeof data === "object") { setUsage(data as Uso); return; }
        if (name === "progress" && data && typeof data === "object") {
          const p = data as { missionId?: unknown; event?: unknown };
          if (typeof p.missionId === "string" && p.event && typeof p.event === "object") { evBuf.push({ id: p.missionId, e: p.event as Ev }); timer ??= setTimeout(flush, BATCH_MS); }
          return;
        }
        if (name !== "mission" || !data || typeof data !== "object") return;
        buffer.push(data as Record<string, unknown>);
        timer ??= setTimeout(flush, BATCH_MS);
      },
      onState: (s) => {
        setUp(s.up);
        setRetryInSec(s.retryInSec);
        if (s.up) { window.dispatchEvent(new CustomEvent("notificacao-sync")); void api.visibilidade(document.visibilityState === "visible", cliente.current); needRefetch = true; timer ??= setTimeout(flush, 0); } // refetch after (re)connect: events may have been missed
      },
    }, cliente.current);
    // the server polls usage only while some tab is visible; failures are ignored (it just stays conservative)
    const vis = () => { void api.visibilidade(document.visibilityState === "visible", cliente.current); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); conn.current?.close(); clearTimeout(timer); };
  }, [reload, recarregarLocal]);

  const consultarUso = useCallback(async () => {
    const r = await api.consultarUso();
    if (r.ok) { setUsage(r.data); return undefined; }
    return { status: r.status, error: r.error };
  }, []);

  const definirAuto = useCallback(async (b: { auto?: boolean; intervaloMin?: number }) => {
    const r = await api.setUsageAuto(b);
    if (r.ok) { setAuto(lerAuto(r.data)); return undefined; }
    return r.status === 0 ? "Servidor fora do ar." : `Não foi possível salvar: ${r.error}`;
  }, []);

  return { missions, usage, auto, definirAuto, local, localStats, recarregarLocal, consultarUso, projects, artigos, loading, error, up, retryInSec, lastOkAt, warnings, events, missionWarnings, reload: () => void reload(), retryNow: () => conn.current?.retryNow() };
}

/** Re-renders on the minute boundary, for relative times. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(Date.now()); t = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50); };
    t = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(t);
  }, []);
  return now;
}

export function useMedia(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    f();
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}
