import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import { permissaoNotif } from "./logic/notificacao.ts";
import { aplicarNotificacao, lerConfig, lerLocais, linkSeguro, mostrarNoNavegador, mostrarToast, toastMs, unirLocais, configPadrao, type NotifConfig, type Notificacao } from "./logic/notificacoes.ts";
import { gravarLidasLocais, lerLidasLocais, tocarBip } from "./prefs.ts";

export interface Notif {
  lista: Notificacao[];
  config: NotifConfig;
  locais: Set<string>; // read-state fallback (localStorage)
  carregado: boolean;
  falhou: boolean; // could not load (server down or an old server without /notificacoes)
  toasts: Notificacao[];
  dispensar: (id: string) => void;
  marcarLidas: (ids?: string[]) => Promise<void>;
  limpar: () => Promise<string | undefined>;
  salvarConfig: (patch: object) => Promise<string | undefined>;
}

/** Notification center state: GET /notificacoes + SSE `notificacao` (relayed by store.ts as window events). Also raises toasts, browser notifications (only if the user already opted in) and the soft beep. */
export function useNotificacoes(): Notif {
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [config, setConfig] = useState<NotifConfig>(configPadrao);
  const [locais, setLocais] = useState<Set<string>>(() => lerLocais(lerLidasLocais()));
  const [carregado, setCarregado] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [toasts, setToasts] = useState<Notificacao[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dispensar = useCallback((id: string) => {
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const recarregar = useCallback(async () => {
    const [l, c] = await Promise.all([api.notificacoes(), api.notifConfig()]);
    if (l.ok && Array.isArray(l.data.notificacoes)) { setLista(l.data.notificacoes); setFalhou(false); } else setFalhou(true);
    if (c.ok) setConfig(lerConfig(c.data));
    setCarregado(true);
  }, []);

  useEffect(() => {
    void recarregar();
    const nova = (e: Event) => {
      const n = (e as CustomEvent<Notificacao>).detail;
      if (!n || typeof n.id !== "string" || typeof n.titulo !== "string") return;
      setLista((cur) => aplicarNotificacao(cur, n));
      if (!mostrarToast(n)) return;
      setToasts((cur) => [...cur.filter((t) => t.id !== n.id), n].slice(-4));
      timers.current.set(n.id, setTimeout(() => dispensar(n.id), toastMs(n)));
      tocarBip();
      if (mostrarNoNavegador(n, document.visibilityState === "hidden") && permissaoNotif() === "concedida") {
        try {
          const b = new Notification(n.titulo, { body: n.texto, tag: n.id });
          b.onclick = () => { window.focus(); const l = linkSeguro(n.link); if (l) window.location.hash = l.slice(1); };
        } catch { /* some browsers only allow it from a service worker: the center still has it */ }
      }
    };
    const sync = () => { void recarregar(); };
    window.addEventListener("notificacao", nova);
    window.addEventListener("notificacao-sync", sync);
    const tm = timers.current;
    return () => { window.removeEventListener("notificacao", nova); window.removeEventListener("notificacao-sync", sync); for (const t of tm.values()) clearTimeout(t); tm.clear(); };
  }, [recarregar, dispensar]);

  const marcarLidas = useCallback(async (ids?: string[]) => {
    const alvo = ids ? new Set(ids) : undefined;
    setLista((cur) => cur.map((n) => (!alvo || alvo.has(n.id) ? { ...n, lida: true } : n)));
    const r = await api.notifLidas(ids ? { ids } : { todas: true });
    if (r.ok) return;
    setLocais((cur) => { const novo = unirLocais(cur, ids ?? lista.map((n) => n.id)); gravarLidasLocais(novo); return new Set(novo); }); // server unreachable: remember here
  }, [lista]);

  const limpar = useCallback(async () => {
    const r = await api.notifLimpar();
    if (!r.ok) return r.status === 0 ? "Servidor fora do ar." : `Não foi possível limpar: ${r.error}`;
    setLista([]); setToasts([]); return undefined;
  }, []);

  const salvarConfig = useCallback(async (patch: object) => {
    const r = await api.setNotifConfig(patch);
    if (r.ok) { setConfig(lerConfig(r.data)); return undefined; }
    return r.status === 0 ? "Servidor fora do ar." : `Não foi possível salvar: ${r.error}`;
  }, []);

  return { lista, config, locais, carregado, falhou, toasts, dispensar, marcarLidas, limpar, salvarConfig };
}
