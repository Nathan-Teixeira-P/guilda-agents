import { useState } from "react";
import { copiarTexto } from "../logic/redacao.ts";

function copiarLegado(t: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.append(ta); ta.select();
  try { return document.execCommand("copy"); } finally { ta.remove(); }
}

export function AfAplicar({ pendente, comando, rascunho, onMarcar }: { pendente: boolean; comando: string; rascunho: boolean; onMarcar: () => Promise<string | undefined> }) {
  const [copiado, setCopiado] = useState<"ok" | "falhou">();
  const [erro, setErro] = useState<string>();
  return (
    <section aria-labelledby="af-p">
      <div className="sec"><h2 id="af-p">Aplicar mudanças</h2>
        <span className={`pill ${pendente ? "pend" : "lig"}`}>{pendente ? "Pendente de sincronizar" : "Sincronizado"}</span>
      </div>
      {rascunho && <p className="warn" role="status">Há alterações não salvas no rascunho: salve antes de sincronizar.</p>}
      <p>Salvar grava <span className="mono">config/niches.json</span> no projeto afiliados. O bot só passa a usar as mudanças depois da sincronização, que você roda no terminal da pasta do projeto:</p>
      <div className="cmd"><code>{comando}</code>
        <button type="button" className="btn chico" onClick={async () => setCopiado((await copiarTexto(comando, { ...(navigator.clipboard ? { clipboard: navigator.clipboard } : {}), copiarLegado })) ? "ok" : "falhou")}>Copiar comando</button>
      </div>
      <p role="status" className={copiado === "falhou" ? "err" : "ok small"}>{copiado === "ok" ? "Comando copiado." : copiado === "falhou" ? "Não consegui copiar; selecione o comando e copie à mão." : ""}</p>
      <p className="muted small">O hub não executa nada do projeto. Depois de rodar o comando, marque como sincronizado.</p>
      <div className="row">
        <button type="button" className="btn primario" disabled={!pendente} onClick={async () => setErro(await onMarcar())}>Marcar como sincronizado</button>
      </div>
      {erro && <p className="err">Erro: {erro}</p>}
    </section>
  );
}
