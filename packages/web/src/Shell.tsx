import { useEffect, useRef, type ReactNode } from "react";
import { atalho } from "./logic/atalhos.ts";
import { Emblem } from "./ui/Emblem.tsx";
import { Centro, Toasts } from "./ui/Notificacoes.tsx";
import type { Notif } from "./notif.ts";
import { Preferencias } from "./ui/Preferencias.tsx";
import { ConfirmDialog } from "./ui/ConfirmDialog.tsx";
import { chipLocal } from "./logic/local.ts";
import { go, type Route } from "./router.ts";
import type { Live } from "./store.ts";
import { useNow } from "./store.ts";
import { useState } from "react";

const LINKS = [
  { to: "/", label: "Salão" },
  { to: "/escritorio", label: "Escritório" },
  { to: "/quadro", label: "Quadro" },
  { to: "/orquestra", label: "Orquestra" },
  { to: "/arsenal", label: "Arsenal" },
  { to: "/guilda", label: "Guilda" },
  { to: "/projetos", label: "Projetos" },
  { to: "/afiliados", label: "Afiliados" },
  { to: "/redacao", label: "Redação" }, // fixed: does not depend on projects
];
const ROTAS = { nova: "/nova", salao: "/", quadro: "/quadro", arsenal: "/arsenal", projetos: "/projetos" } as const;
const AJUDA: [string, string][] = [["N", "Nova missão"], ["1 2 3 4", "Salão, Quadro, Arsenal, Projetos"], ["A", "Selar (na sala de guerra, missão aguardando o selo)"], ["J", "Pedir ajustes (na sala de guerra)"], ["Ctrl+Enter", "Lançar a missão (no formulário)"], ["Esc", "Fechar diálogo"], ["?", "Esta ajuda"]];

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function Shell({ route, live, notif, pendentes, children }: { route: Route; live: Live; notif: Notif; pendentes: number; children: ReactNode }) {
  const now = useNow();
  useEffect(() => { document.title = `${pendentes > 0 ? `(${pendentes}) ` : ""}Guilda de agentes`; }, [pendentes]);
  const [ajuda, setAjuda] = useState(false);
  const anterior = useRef<Element | null>(null);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const a = atalho(e, isTyping(e.target), !!document.querySelector("dialog[open]"));
      if (!a) return;
      e.preventDefault();
      if (a === "ajuda") { anterior.current = document.activeElement; setAjuda(true); }
      else if (a === "selar" || a === "ajustes") window.dispatchEvent(new CustomEvent("atalho", { detail: a }));
      else go(ROTAS[a]);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const chip = chipLocal(live.local);
  const imersivo = route.path.startsWith("/missao/");
  const cur = (to: string) => (route.path === to || (to === "/redacao" && route.path.startsWith("/redacao/")) ? ({ "aria-current": "page" } as const) : {});
  const down = !live.up || (live.error === "servidor fora do ar");
  const age = live.lastOkAt ? Math.max(0, Math.floor((now - live.lastOkAt) / 60_000)) : undefined;

  return (
    <div className={`shell${imersivo ? " imersivo" : ""}`}>
      <a className="skip" href="#conteudo" onClick={(e) => { e.preventDefault(); document.getElementById("conteudo")?.focus(); }}>Pular para o conteúdo</a>
      <header className={`top${chip.visivel ? " com-local" : ""}`}>
        <a className="brand" href="#/">Guilda de agentes</a>
        <nav className="nav" aria-label="Principal">
          {LINKS.map((l) => <a key={l.to} href={`#${l.to}`} {...cur(l.to)}>{l.label}</a>)}
        </nav>
        {chip.visivel && (
          <a className={`local-chip${chip.emUso ? " uso" : ""}`} href="#/arsenal" title={`${chip.texto}. Abrir o painel do modelo local.`}>
            <span className="ponto" aria-hidden="true" />
            <span role="status"><span className="longo sr-only">{chip.texto}</span><span className="curto" aria-hidden="true">{chip.curto}</span></span>
          </a>
        )}
        <Emblem uso={live.usage} now={now} onConsultar={live.consultarUso} auto={live.auto} onAuto={live.definirAuto} tamanho={40} modo="compacto" />
          <Centro live={live} notif={notif} />
          <Preferencias auto={live.auto} onAuto={live.definirAuto} />
        <a className="btn primario novo" href="#/nova">Nova missão (N)</a>
      </header>
      {down && (
        <div className="banner" role="status">
          <span>O salão perdeu contato com o servidor.{live.retryInSec ? ` Tentando de novo em ${live.retryInSec}s…` : ""}{age !== undefined && age >= 1 ? ` Dados desatualizados há ${age}min.` : ""}</span>
          <button type="button" className="btn chico" onClick={live.retryNow}>Tentar agora</button>
        </div>
      )}
      {live.warnings.length > 0 && <div className="banner" role="status">{live.warnings[live.warnings.length - 1]}</div>}
      <Toasts notif={notif} />
      <main id="conteudo" tabIndex={-1}>{children}</main>
      <nav className="bottom" aria-label="Principal (celular)">
        <a href="#/" {...cur("/")}>Salão</a>
        <a href="#/quadro" {...cur("/quadro")}>Quadro</a>
        <a href="#/orquestra" {...cur("/orquestra")}>Orquestra</a>
        <a className="mais" href="#/nova" {...cur("/nova")} aria-label="Nova missão">+ Nova</a>
        <a href="#/arsenal" {...cur("/arsenal")}>Arsenal</a>
        <a href="#/projetos" {...cur("/projetos")}>Projetos</a>
        <a href="#/redacao" {...cur("/redacao")}>Redação</a>
      </nav>
      <ConfirmDialog aberto={ajuda} titulo="Atalhos de teclado" onFechar={() => { setAjuda(false); (anterior.current as HTMLElement | null)?.focus?.(); }}>
        <dl className="atalhos">{AJUDA.map(([k, t]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{t}</dd></div>)}</dl>
        <p className="hint">Atalhos de uma tecla não funcionam enquanto você digita em um campo.</p>
        <div className="row" style={{ marginTop: "var(--e-4)" }}><button type="button" className="btn" autoFocus onClick={() => setAjuda(false)}>Fechar</button></div>
      </ConfirmDialog>
    </div>
  );
}
