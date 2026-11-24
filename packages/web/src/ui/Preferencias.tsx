import { useEffect, useRef, useState } from "react";
import { aplicarMovimento, aplicarTema, movimentoAtual, temaAtual } from "../prefs.ts";
import { AutoUso, type OnAuto } from "./AutoUso.tsx";
import type { AutoStatus } from "../logic/frescor.ts";
import { permissaoNotif, type PermissaoNotif } from "../logic/notificacao.ts";

const TXT_NOTIF: Record<PermissaoNotif, string> = {
  padrao: "Permitir avisos do navegador (notificações do salão)",
  concedida: "Avisos do navegador ligados",
  negada: "Avisos bloqueados no navegador (o título da aba continua avisando)",
  indisponivel: "Este navegador não tem avisos (o título da aba continua avisando)",
};

/** Preferences menu: theme, "sem animação" and browser notifications. The permission is asked only by the click on the button, never on load. */
export function Preferencias({ auto, onAuto }: { auto?: AutoStatus | undefined; onAuto?: OnAuto } = {}) {
  const [tema, setTema] = useState(temaAtual);
  const [mov, setMov] = useState(movimentoAtual);
  const [notif, setNotif] = useState<PermissaoNotif>(permissaoNotif);
  const [aberto, setAberto] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); btn.current?.focus(); } };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aberto]);

  async function ligar() {
    try { await Notification.requestPermission(); } catch { /* old browsers: the state below tells the truth */ }
    setNotif(permissaoNotif());
  }
  return (
    <div className="prefs">
      <button ref={btn} type="button" className="btn chico" aria-expanded={aberto} aria-controls="prefs-pop" onClick={() => setAberto(!aberto)}>Preferências</button>
      {aberto && (
        <div className="panel prefs-pop" id="prefs-pop" role="group" aria-label="Preferências">
          <button type="button" className="btn chico" aria-pressed={tema === "claro"} onClick={() => { const t = tema === "claro" ? "escuro" : "claro"; aplicarTema(t); setTema(t); }}>Tema claro: {tema === "claro" ? "ligado" : "desligado"}</button>
          <button type="button" className="btn chico" aria-pressed={mov === "off"} onClick={() => { const v = mov === "off" ? "on" : "off"; aplicarMovimento(v); setMov(v); }}>Sem animação: {mov === "off" ? "ligado" : "desligado"}</button>
          {notif === "padrao" ? <button type="button" className="btn chico" onClick={ligar}>{TXT_NOTIF.padrao}</button> : <p className="hint">{TXT_NOTIF[notif]}</p>}
          <a className="btn chico" href="#/notificacoes" onClick={() => setAberto(false)}>Central de notificações</a>
          {onAuto && <AutoUso auto={auto} onAuto={onAuto} />}
        </div>
      )}
    </div>
  );
}
