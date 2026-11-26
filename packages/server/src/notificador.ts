import { spawn as spawnReal } from "node:child_process";
import { accessSync, appendFileSync, closeSync, constants, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { mascararJid } from "@lab/core/src/niches.ts";
import { estadoDoArtigo } from "@lab/core/src/redacao.ts";
import type { Mission } from "@lab/core/src/mission.ts";
import { membro } from "../../web/src/roster.ts"; // data-only module: codenames live in one place
import { lerInfo, metaRelatorio } from "./afiliados-info.ts";
import type { StreamEvent } from "./stream.ts";

export const CATEGORIAS = ["missao", "agente", "redacao", "afiliados", "uso", "local", "sistema"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const NIVEIS = ["info", "sucesso", "aviso", "erro"] as const;
export type Nivel = (typeof NIVEIS)[number];
export interface Notificacao { id: string; ts: string; categoria: Categoria; nivel: Nivel; titulo: string; texto: string; link?: string; origem: string; lida: boolean }

const MAX = 300;
const DEDUP_MS = 60_000;
const AGENTE_MS = 20_000; // per agent
const AGENTE_GLOBAL_MS = 5_000; // cooldown between any two agent notifications
const DESKTOP_MS = 1_000;
const POLL_MS = 60_000;
const CHUNK = 256 * 1024;
const MAX_POR_POLL = 10;
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const flags = (d: Record<Categoria, boolean>) => z.object({ missao: z.boolean().default(d.missao), agente: z.boolean().default(d.agente), redacao: z.boolean().default(d.redacao), afiliados: z.boolean().default(d.afiliados), uso: z.boolean().default(d.uso), local: z.boolean().default(d.local), sistema: z.boolean().default(d.sistema) }).prefault({});
const TODAS = { missao: true, agente: true, redacao: true, afiliados: true, uso: true, local: true, sistema: true };
const DESKTOP = TODAS;
export const NotifConfig = z.object({
  categorias: flags(TODAS),
  desktop: z.object({ ligado: z.boolean().default(true), categorias: flags(DESKTOP) }).prefault({}),
  silencio: z.object({ ativo: z.boolean().default(false), inicio: HHMM.default("22:00"), fim: HHMM.default("07:00") }).prefault({}),
});
export type NotifConfig = z.infer<typeof NotifConfig>;
const bools = z.object({ missao: z.boolean(), agente: z.boolean(), redacao: z.boolean(), afiliados: z.boolean(), uso: z.boolean(), local: z.boolean(), sistema: z.boolean() }).partial().strict();
export const NotifConfigPut = z.object({
  categorias: bools.optional(),
  desktop: z.object({ ligado: z.boolean().optional(), categorias: bools.optional() }).strict().optional(),
  silencio: z.object({ ativo: z.boolean(), inicio: HHMM, fim: HHMM }).partial().strict().optional(),
}).strict();
export const LidasPut = z.object({ ids: z.array(z.string().max(60)).max(MAX).optional(), todas: z.boolean().optional() }).strict().refine((b) => b.todas === true || (b.ids?.length ?? 0) > 0, "ids or todas required");

const Linha = z.object({ id: z.string(), ts: z.string(), categoria: z.enum(CATEGORIAS), nivel: z.enum(NIVEIS), titulo: z.string(), texto: z.string(), link: z.string().optional(), origem: z.string(), lida: z.boolean() });
const Evento = z.looseObject({ ts: z.string().optional(), tipo: z.enum(["run-inicio", "run-fim", "erro", "orcamento", "oferta-publicada", "oferta-pulada"]), nicho: z.string().optional(), contagem: z.number().int().min(0).max(1e9).optional(), mensagem: z.string().optional() });
const Estado = z.object({
  eventsOffset: z.number().int().min(0).optional(), eventsIno: z.number().optional(),
  relatorios: z.record(z.string(), z.number()).optional(), dryRun: z.boolean().optional(),
  usoVisto: z.array(z.string()).default([]), orcamento: z.array(z.string()).default([]),
});
type Estado = z.infer<typeof Estado>;

const JIDISH = /\d[\d-]*@(?:g\.us|s\.whatsapp\.net|c\.us|lid)/gi;
/** Text from outside (bot events, reports, errors) becomes a notification: control chars out, jids masked, secrets/tags/phones/long tokens hidden, capped. */
export function limpar(v: unknown, max = 140): string {
  const t = String(v ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, " ")
    .replace(JIDISH, (j) => mascararJid(j))
    .replace(/\b(token|secret|senha|password|passwd|api[_-]?key|chave|tag|conta|account|bearer)\b\s*[=:]\s*\S+/gi, "$1=[oculto]")
    .replace(/\b[a-z0-9]{3,}-(?:20|21)\b/gi, "[oculto]")
    .replace(/\b[A-Za-z0-9_+/-]{32,}\b/g, "[oculto]")
    .replace(/\+?\d{10,}\b/g, "[oculto]")
    .replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
/** For notify-send: plain text, no control chars, capped. It is an argv entry (never a shell), so metacharacters stay literal. */
export const sanear = (v: string, max: number) => { const t = v.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

const minutos = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export function emSilencio(c: NotifConfig["silencio"], d: Date): boolean {
  if (!c.ativo || c.inicio === c.fim) return false;
  const m = d.getHours() * 60 + d.getMinutes(), a = minutos(c.inicio), b = minutos(c.fim);
  return a < b ? m >= a && m < b : m >= a || m < b; // wraps past midnight
}

export type SpawnDesktop = (file: string, args: string[]) => void;
const spawnDesktop: SpawnDesktop = (file, args) => { const c = spawnReal(file, args, { stdio: "ignore", shell: false, detached: true }); c.on("error", () => {}); c.unref(); };
const acharNoPath = (cmd: string): string | undefined => {
  for (const d of (process.env["PATH"] ?? "").split(delimiter)) { if (!d) continue; try { accessSync(join(d, cmd), constants.X_OK); return join(d, cmd); } catch { /* next */ } }
  return undefined;
};

export interface NotificadorOpts {
  hubDir: string;
  clock: () => Date;
  publish: (event: string, data: unknown) => void;
  afiliados?: () => string | undefined; // registered afiliados project path
  spawn?: SpawnDesktop; // injectable: tests never run the real notify-send
  achar?: (cmd: string) => string | undefined; // `command -v` equivalent
  every?: (fn: () => void, ms: number) => () => void; // injectable timer; default is unref'd
  pollMs?: number;
}

export function createNotificador(o: NotificadorOpts) {
  const arq = join(o.hubDir, "notificacoes.jsonl");
  const cfgFile = join(o.hubDir, "notificacoes-config.json");
  const estFile = join(o.hubDir, "notificador-estado.json");
  const now = () => o.clock().getTime();
  const spawn = o.spawn ?? spawnDesktop;
  const lerJson = <T>(f: string, s: z.ZodType<T>): T | undefined => { try { const r = s.safeParse(JSON.parse(readFileSync(f, "utf8"))); return r.success ? r.data : undefined; } catch { return undefined; } };
  const gravarJson = (f: string, v: unknown) => { try { mkdirSync(o.hubDir, { recursive: true }); const t = `${f}.tmp-${process.pid}`; writeFileSync(t, JSON.stringify(v, null, 2)); renameSync(t, f); } catch { /* best effort */ } };

  let cfg: NotifConfig = lerJson(cfgFile, NotifConfig) ?? NotifConfig.parse({});
  let estado: Estado = lerJson(estFile, Estado) ?? Estado.parse({});
  const salvarEstado = () => gravarJson(estFile, estado);
  let lista: Notificacao[] = [];
  try { lista = readFileSync(arq, "utf8").split("\n").flatMap((l) => { try { const r = Linha.safeParse(JSON.parse(l)); return r.success ? [r.data as Notificacao] : []; } catch { return []; } }).slice(-MAX); } catch { /* none yet */ }
  const reescrever = () => { try { mkdirSync(o.hubDir, { recursive: true }); const t = `${arq}.tmp-${process.pid}`; writeFileSync(t, lista.map((n) => JSON.stringify(n)).join("\n") + (lista.length ? "\n" : "")); renameSync(t, arq); } catch { /* best effort */ } };

  let fechado = false;
  const recentes = new Map<string, number>();
  let ultimoDesktop = -Infinity;
  let bin: string | undefined | null = null; // null = not looked up yet
  const estados = new Map<string, string>(); // mission/article -> last stage seen
  const tipos = new Map<string, string>(); // `${mission}:${agentId}` -> subagent type
  const agenteQuando = new Map<string, number>();
  let agenteGlobal = -Infinity;
  let usoAuto = { erro: false, janela: false };
  let local: boolean | undefined;

  function desktop(n: Notificacao) {
    if (!cfg.desktop.ligado || !cfg.desktop.categorias[n.categoria] || emSilencio(cfg.silencio, o.clock())) return;
    const espera = DESKTOP_MS - (now() - ultimoDesktop);
    ultimoDesktop = now() + Math.max(espera, 0); // reserve the slot: later toasts queue behind this one
    if (espera > 0) { const t = setTimeout(() => enviar(n), espera); t.unref(); } else enviar(n); // queue instead of dropping
  }

  function enviar(n: Notificacao) {
    if (bin === null) bin = (o.achar ?? acharNoPath)("notify-send");
    if (!bin) return; // not installed: silently skip
    try { spawn(bin, ["-a", "Guilda de agentes", "-u", n.nivel === "erro" ? "critical" : "normal", "--", sanear(n.titulo, 80), sanear(n.texto, 200)]); } catch { /* never break the hub for a toast */ }
  }

  function emitir(p: { categoria: Categoria; nivel: Nivel; titulo: string; texto: string; link?: string; origem: string }): Notificacao | undefined {
    if (fechado || !cfg.categorias[p.categoria]) return undefined;
    const t = now();
    for (const [k, v] of recentes) if (t - v >= DEDUP_MS) recentes.delete(k);
    const chave = `${p.categoria}|${p.nivel}|${p.titulo}|${p.texto}`;
    if (recentes.has(chave)) return undefined;
    recentes.set(chave, t);
    const n: Notificacao = { id: `${t.toString(36)}-${randomBytes(3).toString("hex")}`, ts: new Date(t).toISOString(), categoria: p.categoria, nivel: p.nivel, titulo: p.titulo, texto: p.texto, ...(p.link ? { link: p.link } : {}), origem: p.origem, lida: false };
    lista.push(n);
    if (lista.length > MAX) { lista = lista.slice(-MAX); reescrever(); } else { try { mkdirSync(o.hubDir, { recursive: true }); appendFileSync(arq, `${JSON.stringify(n)}\n`); } catch { /* best effort */ } }
    o.publish("notificacao", { ...n, silencio: emSilencio(cfg.silencio, o.clock()) });
    desktop(n);
    return n;
  }
  const demanda = (m: Mission) => limpar(typeof m["demanda"] === "string" ? m["demanda"].split("\n")[0] : m.id, 90) || m.id;

  function missao(m: Mission) {
    const prev = estados.get(m.id);
    estados.set(m.id, m.stage);
    if (prev === m.stage || (prev === undefined && (m.stage === "planejando" || m.stage === "intake"))) return;
    const link = `#/missao/${encodeURIComponent(m.id)}`, origem = `missao:${m.id}`, d = demanda(m);
    const r = limpar(m.pauseReason ?? "", 140);
    if (m.stage === "aguardando-aprovacao") emitir({ categoria: "missao", nivel: "aviso", titulo: "Missão aguarda o seu selo", texto: d, link, origem });
    else if (m.stage === "concluida") emitir({ categoria: "missao", nivel: "sucesso", titulo: "Missão concluída", texto: d, link, origem });
    else if (m.stage === "pausada") {
      const disj = r.startsWith("disjuntor");
      emitir({ categoria: "missao", nivel: disj ? "erro" : "aviso", titulo: disj ? "Disjuntor acionado" : r.startsWith("build necessário") ? "Build necessário: é com você" : "Missão pausada", texto: `${d}. ${r || "aguarda você"}`, link, origem });
    } else if (m.stage === "parada") {
      const why = limpar(m["stopReason"] ?? "", 140);
      const user = why === "stopped by user";
      emitir({ categoria: "missao", nivel: user ? "info" : "erro", titulo: "Missão parada", texto: `${d}${why ? `. ${why}` : ""}`, link, origem });
    }
  }

  function artigo(m: Mission, capaPronta = false) {
    const key = `a:${m.id}`, prev = estados.get(key);
    const est = estadoDoArtigo(m.stage), ped = m["pedido"] as { modo?: string; tema?: string } | undefined;
    const sig = `${est}${ped?.modo === "sugerir" ? "/s" : ""}`;
    estados.set(key, sig);
    if (prev === sig || (prev === undefined && est === "rascunho")) return;
    const tema = limpar(ped?.tema ?? m.id, 80), origem = `redacao:${m.id}`;
    const link = ped?.modo === "sugerir" ? "#/redacao" : `#/redacao/${encodeURIComponent(m.id)}`;
    const why = limpar(m.pauseReason ?? m["stopReason"] ?? "", 140);
    if (ped?.modo === "sugerir") {
      if (est === "aprovado") emitir({ categoria: "redacao", nivel: "sucesso", titulo: "Sugestões de pauta prontas", texto: "Escolha um tema para começar o artigo.", link, origem });
      else if (est === "cancelado") emitir({ categoria: "redacao", nivel: "erro", titulo: "Sugestões de pauta falharam", texto: why, link, origem });
      return;
    }
    if (est === "em-revisao") emitir({ categoria: "redacao", nivel: "aviso", titulo: "Rascunho em revisão", texto: tema, link, origem });
    else if (est === "aprovado") {
      emitir({ categoria: "redacao", nivel: "sucesso", titulo: "Artigo aprovado", texto: capaPronta ? `${tema}. Capa pronta.` : tema, link, origem });
      if (m["erroCapa"]) emitir({ categoria: "redacao", nivel: "aviso", titulo: "A capa não foi gerada", texto: `${tema}. ${limpar(m["erroCapa"], 120)}`, link, origem });
    } else if (est === "pausado") emitir({ categoria: "redacao", nivel: "aviso", titulo: "Artigo pausado", texto: `${tema}. ${why || "aguarda você"}`, link, origem });
    else if (est === "cancelado" && why !== "stopped by user") emitir({ categoria: "redacao", nivel: "erro", titulo: "Artigo interrompido", texto: `${tema}. ${why}`, link, origem });
  }

  /** Acting agent changed. At most 1 per agent per 20 s and 1 per 5 s overall, so a burst never spams. */
  function progresso(id: string, e: StreamEvent, rota: "missao" | "redacao") {
    if (e.kind === "subagent-finished") {
      const tipo = tipos.get(`${id}:${e.agentId}`);
      tipos.delete(`${id}:${e.agentId}`);
      if (e.status !== undefined && e.status !== "completed" && tipo) {
        const mb = membro(tipo);
        emitir({ categoria: "agente", nivel: "aviso", titulo: `${mb.codinome} terminou com erro`, texto: `Agora: ${mb.codinome} (${mb.grupo.nome}) falhou (${limpar(e.status, 30)}).`, link: `#/${rota === "missao" ? "missao" : "redacao"}/${encodeURIComponent(id)}`, origem: `${rota}:${id}` });
      }
      return;
    }
    if (e.kind !== "subagent-started") return;
    const tipo = e.subagentType ?? "";
    if (tipos.size > 500) tipos.clear();
    tipos.set(`${id}:${e.agentId}`, tipo);
    const t = now(), k = tipo || e.agentId;
    if (t - (agenteQuando.get(k) ?? -Infinity) < AGENTE_MS || t - agenteGlobal < AGENTE_GLOBAL_MS) return;
    agenteQuando.set(k, t); agenteGlobal = t;
    const mb = membro(tipo || undefined);
    emitir({ categoria: "agente", nivel: "info", titulo: `${mb.codinome} assumiu`, texto: `Agora: ${mb.codinome} (${mb.grupo.nome}) assumiu.`, link: `#/${rota === "missao" ? "missao" : "redacao"}/${encodeURIComponent(id)}`, origem: `${rota}:${id}` });
  }

  const marcar = (chave: string, lista2: "usoVisto" | "orcamento") => { if (estado[lista2].includes(chave)) return false; estado = { ...estado, [lista2]: [...estado[lista2], chave].slice(-40) }; salvarEstado(); return true; };
  function uso(v: { estado: string; cincoHoras?: { percentual: number; reiniciaEm: number }; semana?: { percentual: number; reiniciaEm: number } }) {
    if (v.estado !== "ok") return;
    for (const [nome, j] of [["5h", v.cincoHoras], ["semana", v.semana]] as const) {
      if (!j) continue;
      const faixas = ([95, 80] as const).filter((t) => j.percentual >= t);
      let alto = false;
      for (const t of faixas) { if (marcar(`${nome}:${j.reiniciaEm}:${t}`, "usoVisto") && !alto) { alto = true; emitir({ categoria: "uso", nivel: t === 95 ? "erro" : "aviso", titulo: `Janela de ${nome === "5h" ? "5 horas" : "uma semana"} em ${j.percentual}%`, texto: t === 95 ? "O plano está quase no limite. Novas missões pedem confirmação." : "O consumo passou de 80% desta janela.", link: "#/arsenal", origem: `uso:${nome}` }); } }
    }
  }
  function usoAutoMudou(s: { erro?: string; motivo?: string }) {
    const erro = s.erro !== undefined, janela = s.motivo?.startsWith("janela de 5h") === true;
    if (erro && !usoAuto.erro) emitir({ categoria: "uso", nivel: "aviso", titulo: "Atualização automática do uso falhou", texto: limpar(s.erro, 100), link: "#/arsenal", origem: "uso:auto" });
    if (janela && !usoAuto.janela) emitir({ categoria: "uso", nivel: "aviso", titulo: "Atualização automática do uso pausada", texto: limpar(s.motivo, 100), link: "#/arsenal", origem: "uso:auto" });
    usoAuto = { erro, janela };
  }
  function localMudou(ev: string, ativo: boolean) {
    if (ev !== "ligado" && ev !== "desligado") return;
    const lig = ev === "ligado";
    if (local === lig) return;
    const primeiro = local === undefined;
    local = lig;
    if (primeiro && !lig) return; // baseline: "off" at boot is not news
    emitir({ categoria: "local", nivel: lig ? "info" : ativo ? "aviso" : "info", titulo: lig ? "Modelo local ligado" : "Modelo local desligado", texto: lig ? "O Ollama está no ar." : ativo ? "O Ollama parou com o modelo local ativado." : "O Ollama foi desligado.", link: "#/arsenal", origem: "local" });
  }
  const sistema = (titulo: string, texto: string, nivel: Nivel = "info") => void emitir({ categoria: "sistema", nivel, titulo, texto: limpar(texto, 160), origem: "sistema" });
  const afiliadosEvento = (tipo: "salvo" | "conflito" | "restaurado") => {
    const base = { categoria: "afiliados" as const, link: "#/afiliados", origem: "afiliados:config" };
    if (tipo === "salvo") emitir({ ...base, nivel: "aviso", titulo: "Configuração salva: falta sincronizar", texto: "Rode o comando de sincronizar no projeto afiliados para valer." });
    else if (tipo === "restaurado") emitir({ ...base, nivel: "aviso", titulo: "Backup restaurado: falta sincronizar", texto: "A configuração foi restaurada. Sincronize para valer." });
    else emitir({ ...base, nivel: "aviso", titulo: "Conflito ao salvar", texto: "O arquivo de nichos mudou fora do salão. Recarregue e refaça a edição." });
  };

  // ---- afiliados poll (read-only) ----
  function pollRelatorios(c: string) {
    const dir = join(c, ".claude", "ops-reports");
    let nomes: string[];
    try { nomes = readdirSync(dir).filter((n) => /^(ops|deal-auditor)-\d{4}-\d{2}-\d{2}[\w.-]*\.md$/.test(n)); } catch { return; }
    const atual: Record<string, number> = {};
    for (const n of nomes) { try { atual[n] = Math.floor(statSync(join(dir, n)).mtimeMs); } catch { /* vanished */ } }
    const base = estado.relatorios;
    estado = { ...estado, relatorios: atual };
    salvarEstado();
    if (!base) return; // first look: baseline only, no burst
    const novos = Object.entries(atual).filter(([n, m]) => base[n] !== m).map(([n]) => n);
    if (novos.length > 3) return void emitir({ categoria: "afiliados", nivel: "info", titulo: `${novos.length} relatórios novos ou alterados`, texto: "Veja o painel Afiliados.", link: "#/afiliados", origem: "afiliados:relatorios" });
    for (const n of novos) {
      const tipo = n.startsWith("ops") ? "operação (ops)" : "auditoria de ofertas";
      const st = metaRelatorio(c, n)?.status;
      const ruim = st !== undefined && /falh|erro|crit|alert|aten/i.test(st);
      emitir({ categoria: "afiliados", nivel: ruim ? "aviso" : "info", titulo: `Relatório de ${tipo}`, texto: `${n.replace(/\.md$/, "").replace(/^(ops|deal-auditor)-/, "")}${st ? `. Status: ${st}` : ""}`, link: "#/afiliados", origem: "afiliados:relatorios" });
    }
  }
  function pollEventos(c: string) {
    const f = join(c, ".claude", "ops-reports", "events.jsonl");
    let fd: number;
    try { fd = openSync(f, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { return; }
    let feitas = 0, extras = 0;
    try {
      const st = fstatSync(fd);
      if (!st.isFile()) return;
      let off = estado.eventsOffset;
      if (off === undefined) { estado = { ...estado, eventsOffset: st.size, eventsIno: st.ino }; salvarEstado(); return; } // first look: start at the end
      if (st.size < off || (estado.eventsIno !== undefined && estado.eventsIno !== st.ino)) off = 0; // truncated or rotated
      const orcamento = () => lerInfo(c).waMaxPerDay;
      for (let i = 0; i < 8 && off < st.size; i++) {
        const buf = Buffer.alloc(Math.min(CHUNK, st.size - off));
        const n = readSync(fd, buf, 0, buf.length, off);
        const fim = buf.subarray(0, n).lastIndexOf(0x0a);
        if (fim < 0) { if (n < CHUNK) break; off += n; continue; } // partial last line: wait; a >256KB line is dropped
        for (const l of buf.subarray(0, fim).toString("utf8").split("\n")) {
          let r: ReturnType<typeof Evento.safeParse>;
          try { r = Evento.safeParse(JSON.parse(l)); } catch { continue; } // tolerate malformed lines
          if (!r.success) continue;
          if (feitas >= MAX_POR_POLL) { extras++; continue; }
          if (evento(r.data, orcamento)) feitas++;
        }
        off += fim + 1;
      }
      estado = { ...estado, eventsOffset: off, eventsIno: st.ino };
      salvarEstado();
    } catch { /* unreadable: try again next poll */ } finally { closeSync(fd); }
    if (extras > 0) emitir({ categoria: "afiliados", nivel: "info", titulo: `Mais ${extras} eventos do bot`, texto: "Veja o painel Afiliados.", link: "#/afiliados", origem: "afiliados:eventos" });
  }
  function evento(e: z.infer<typeof Evento>, waMax: () => number | undefined): boolean {
    const nicho = e.nicho && /^[\w .-]{1,40}$/.test(e.nicho) ? e.nicho : undefined;
    const alvo = nicho ? ` (${nicho})` : "";
    const base = { categoria: "afiliados" as const, link: "#/afiliados", origem: "afiliados:eventos" };
    if (e.tipo === "run-inicio") return !!emitir({ ...base, nivel: "info", titulo: `Rodada iniciada${alvo}`, texto: "O bot começou uma rodada." });
    if (e.tipo === "run-fim") return !!emitir({ ...base, nivel: "sucesso", titulo: `Rodada concluída${alvo}`, texto: e.contagem !== undefined ? `${e.contagem} ${e.contagem === 1 ? "oferta publicada" : "ofertas publicadas"}.` : "Rodada encerrada." });
    if (e.tipo === "erro") return !!emitir({ ...base, nivel: "erro", titulo: `Erro no bot${alvo}`, texto: limpar(e.mensagem ?? "erro sem detalhe", 140) });
    if (e.tipo === "orcamento") {
      const max = waMax();
      if (e.contagem === undefined || !max) return false;
      const pct = Math.round((e.contagem / max) * 100), faixa = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
      if (!faixa || !marcar(`${(e.ts ?? "").slice(0, 10)}:${faixa}`, "orcamento")) return false;
      return !!emitir({ ...base, nivel: faixa === 100 ? "erro" : "aviso", titulo: faixa === 100 ? "Orçamento diário esgotado" : `Orçamento diário em ${pct}%`, texto: `${e.contagem} de ${max} envios hoje.` });
    }
    return false; // offers published/skipped are far too frequent to notify; run-fim summarises them
  }
  function poll() {
    if (fechado) return;
    const c = o.afiliados?.();
    if (!c) return;
    try {
      const dry = lerInfo(c).dryRun;
      if (dry !== undefined) {
        if (dry === false && estado.dryRun !== false) emitir({ categoria: "afiliados", nivel: "aviso", titulo: "DRY_RUN está desligado", texto: "O bot pode enviar mensagens reais.", link: "#/afiliados", origem: "afiliados:dry-run" });
        if (estado.dryRun !== dry) { estado = { ...estado, dryRun: dry }; salvarEstado(); }
      }
      pollRelatorios(c);
      pollEventos(c);
    } catch { /* read-only best effort */ }
  }

  let parar: (() => void) | undefined;
  return {
    missao, artigo, progresso, uso, usoAuto: usoAutoMudou, local: localMudou, sistema, afiliados: afiliadosEvento, poll,
    emitir,
    config: () => cfg,
    setConfig(p: z.infer<typeof NotifConfigPut>): NotifConfig {
      cfg = NotifConfig.parse({
        categorias: { ...cfg.categorias, ...p.categorias },
        desktop: { ...cfg.desktop, ...p.desktop, categorias: { ...cfg.desktop.categorias, ...p.desktop?.categorias } },
        silencio: { ...cfg.silencio, ...p.silencio },
      });
      gravarJson(cfgFile, cfg);
      o.publish("notificacao-sync", {});
      return cfg;
    },
    listar(desde?: number) { const l = [...lista].reverse().sort((x, y) => y.ts.localeCompare(x.ts)); return { notificacoes: desde === undefined ? l : l.filter((n) => Date.parse(n.ts) > desde), naoLidas: lista.filter((n) => !n.lida).length }; },
    marcarLidas(ids?: string[]) {
      const set = ids ? new Set(ids) : undefined;
      lista = lista.map((n) => (!n.lida && (!set || set.has(n.id)) ? { ...n, lida: true } : n));
      reescrever();
      o.publish("notificacao-sync", {});
    },
    limpar() { lista = []; reescrever(); o.publish("notificacao-sync", {}); },
    start() { parar ??= (o.every ?? ((fn, ms) => { const t = setInterval(fn, ms); t.unref(); return () => clearInterval(t); }))(poll, o.pollMs ?? POLL_MS); },
    close() { fechado = true; parar?.(); parar = undefined; },
  };
}
export type Notificador = ReturnType<typeof createNotificador>;
