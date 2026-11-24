import { ROSTER, membro } from "../roster.ts";
import { membrosDe, tokensVivos, type Ev } from "./events.ts";
import type { M } from "./stages.ts";

// The guild hall: floor plan, waypoint graph and a small walking simulation. Pure: the caller injects rng and the time step.
// Viewbox 800x480. Desks sit in rows; an agent sits BEHIND its desk (seat node just above the desk top), lanes run behind and in front of each row.

export interface Ret { x: number; y: number; w: number; h: number }
export interface No { id: string; x: number; y: number; zona: string; viz: string[]; assento?: string }
export interface Mesa extends Ret { agente?: string; sala?: string }
export interface Sala extends Ret { id: string; nome: string; cor: string; porta: "baixo" | "cima"; agentes: string[]; doorX: number }
export interface Planta { w: number; h: number; salas: Sala[]; corredor: Ret; nos: Record<string, No>; mesas: Mesa[]; assento: Record<string, string>; sala: Record<string, string> }

export const VIEW = { w: 800, h: 480 } as const;
const CORREDOR: Ret = { x: 16, y: 196, w: 768, h: 88 };

interface Def { id: string; nome: string; cor: string; ret: Ret; porta: "baixo" | "cima"; agentes: string[] }
const DEFS: Def[] = [
  { id: "guerra", nome: "Sala de Guerra", cor: "#cfc2a5", ret: { x: 16, y: 16, w: 380, h: 180 }, porta: "baixo", agentes: ["planner", "frontend-architect", "prd-writer", "spec-writer", "spec-checker", "explorer"] },
  { id: "scriptorium", nome: "Scriptorium", cor: "#7fae8a", ret: { x: 404, y: 16, w: 380, h: 180 }, porta: "baixo", agentes: ["researcher", "fact-checker", "writer", "editor", "illustrator", "scribe"] },
  { id: "forja", nome: "Forja", cor: "#7f9bb5", ret: { x: 16, y: 284, w: 270, h: 180 }, porta: "cima", agentes: ["coder", "frontend-builder", "refactorer", "debugger"] },
  { id: "arena", nome: "Arena de Provas", cor: "#ef5350", ret: { x: 294, y: 284, w: 212, h: 180 }, porta: "cima", agentes: ["tester", "reviewer", "security-reviewer"] },
  { id: "torre", nome: "Torre de Vigia", cor: "#d9a441", ret: { x: 514, y: 284, w: 270, h: 180 }, porta: "cima", agentes: ["ops", "deal-auditor"] },
];
export const CENTRAL = ["orchestrator", "intake"] as const; // Regente and Porteiro at the central table
export const MESA_CENTRAL: Ret = { x: 366, y: 232, w: 68, h: 22 };

/** Builds the plan: desks, nodes and edges. Deterministic. */
export function montarPlanta(): Planta {
  const nos: Record<string, No> = {};
  const mesas: Mesa[] = [];
  const assento: Record<string, string> = {};
  const sala: Record<string, string> = {};
  const no = (id: string, x: number, y: number, zona: string): No => (nos[id] = { id, x, y, zona, viz: [] });
  const liga = (a: string, b: string) => { nos[a]!.viz.push(b); nos[b]!.viz.push(a); };
  const salas: Sala[] = [];

  for (const d of DEFS) {
    const { x, y, w } = d.ret;
    const n = d.agentes.length;
    const rows = n > 3 ? 2 : 1;
    const cols = Math.ceil(n / rows);
    const colW = w / cols;
    const dw = Math.min(64, colW - 26);
    const y0 = y + 64;
    const deskY = [y0, y0 + 60];
    const lanes = rows === 1 ? [y0 - 16, y0 + 34, y0 + 84] : [y0 - 16, y0 + 30, y0 + 94];
    const cx = Array.from({ length: cols }, (_, c) => x + colW * (c + 0.5));
    const gaps = Array.from({ length: cols - 1 }, (_, k) => x + colW * (k + 1));
    const xs = [...cx, ...gaps].sort((a, b) => a - b);
    lanes.forEach((ly, li) => {
      xs.forEach((lx, i) => { no(`${d.id}:L${li}:${i}`, lx, ly, d.id); if (i > 0) liga(`${d.id}:L${li}:${i - 1}`, `${d.id}:L${li}:${i}`); });
      if (li > 0) gaps.forEach((gx) => liga(`${d.id}:L${li - 1}:${xs.indexOf(gx)}`, `${d.id}:L${li}:${xs.indexOf(gx)}`)); // only through the gaps between desks
    });
    d.agentes.forEach((ag, i) => {
      const r = rows === 1 ? 0 : Math.floor(i / cols);
      const c = i % cols;
      const sid = `s:${ag}`;
      no(sid, cx[c]!, deskY[r]! - 3, d.id).assento = ag;
      liga(sid, `${d.id}:L${r}:${xs.indexOf(cx[c]!)}`);
      assento[ag] = sid;
      sala[ag] = d.id;
      mesas.push({ x: cx[c]! - dw / 2, y: deskY[r]!, w: dw, h: 10, agente: ag, sala: d.id });
    });
    const doorX = x + w / 2;
    const doorY = d.porta === "baixo" ? y + d.ret.h : y;
    const lane = d.porta === "baixo" ? lanes.length - 1 : 0;
    no(`p:${d.id}`, doorX, doorY, d.id);
    liga(`p:${d.id}`, `${d.id}:L${lane}:${xs.indexOf(doorX)}`);
    salas.push({ ...d.ret, id: d.id, nome: d.nome, cor: d.cor, porta: d.porta, agentes: d.agentes, doorX });
  }

  // corridor: upper lane (y 214) for the top rooms and the table seats, lower lane (y 266) for the bottom rooms, linked at x 24, 330, 470, 776
  const U = [24, 206, 330, 378, 422, 470, 594, 776];
  const D = [24, 151, 330, 400, 470, 649, 776];
  U.forEach((ux, i) => { no(`c:U${ux}`, ux, 214, "corredor"); if (i > 0) liga(`c:U${U[i - 1]}`, `c:U${ux}`); });
  D.forEach((dx, i) => { no(`c:D${dx}`, dx, 266, "corredor"); if (i > 0) liga(`c:D${D[i - 1]}`, `c:D${dx}`); });
  for (const lx of [24, 330, 470, 776]) { no(`c:M${lx}`, lx, 240, "corredor"); liga(`c:U${lx}`, `c:M${lx}`); liga(`c:M${lx}`, `c:D${lx}`); }
  liga("p:guerra", "c:U206"); liga("p:scriptorium", "c:U594");
  liga("p:forja", "c:D151"); liga("p:arena", "c:D400"); liga("p:torre", "c:D649");
  CENTRAL.forEach((ag, i) => {
    const sx = i === 0 ? 378 : 422;
    no(`s:${ag}`, sx, 229, "corredor").assento = ag;
    liga(`s:${ag}`, `c:U${sx}`);
    assento[ag] = `s:${ag}`;
    sala[ag] = "mesa";
  });
  mesas.push({ ...MESA_CENTRAL, sala: "mesa" });
  return { w: VIEW.w, h: VIEW.h, salas, corredor: CORREDOR, nos, mesas, assento, sala };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Shortest node path (Dijkstra, the graph has ~150 nodes). Includes both ends; [] when unreachable. */
export function caminho(p: Planta, de: string, para: string): string[] {
  if (!p.nos[de] || !p.nos[para]) return [];
  const d: Record<string, number> = { [de]: 0 };
  const prev: Record<string, string> = {};
  const aberto = new Set([de]);
  while (aberto.size > 0) {
    let u = "";
    for (const k of aberto) if (u === "" || d[k]! < d[u]!) u = k;
    aberto.delete(u);
    if (u === para) break;
    for (const v of p.nos[u]!.viz) {
      const nd = d[u]! + dist(p.nos[u]!, p.nos[v]!);
      if (d[v] === undefined || nd < d[v]!) { d[v] = nd; prev[v] = u; aberto.add(v); }
    }
  }
  if (d[para] === undefined) return [];
  const out = [para];
  while (out[0] !== de) out.unshift(prev[out[0]!]!);
  return out;
}
const tamanho = (p: Planta, r: string[]) => r.reduce((s, id, i) => (i === 0 ? 0 : s + dist(p.nos[r[i - 1]!]!, p.nos[id]!)), 0);

export type Fase = "sentado" | "ocioso" | "andando";
export type Motivo = "passeio" | "trabalho" | "recado";
export interface Ator { id: string; x: number; y: number; face: 1 | -1; fase: Fase; rota: string[]; no: string; casa: string; espera: number; motivo: Motivo; carrega: boolean; pega?: string; dist: number }
export interface Atividade { ativo: boolean; falhou: boolean; ferramenta?: string; projeto?: string }
export interface Recado { de: string; para: string }

const VEL: Record<Motivo, number> = { passeio: 34, trabalho: 72, recado: 78 }; // px/s in viewbox units
const pausa = (rng: () => number) => 1500 + rng() * 5000;

/** Walking simulation. States per agent: sentado -> andando -> ocioso -> andando ... Time and randomness are injected. */
export function criarSim(p: Planta, rng: () => number, o: { maxPasseio?: number; agentes?: readonly string[] } = {}) {
  let maxPasseio = o.maxPasseio ?? 5;
  const ids = o.agentes ?? [...CENTRAL, ...DEFS.flatMap((d) => d.agentes)];
  const livres = Object.values(p.nos).filter((n) => !n.assento && !n.id.startsWith("p:")); // wander targets
  const atores: Ator[] = ids.filter((id) => p.assento[id]).map((id) => {
    const n = p.nos[p.assento[id]!]!;
    return { id, x: n.x, y: n.y, face: 1, fase: "sentado", rota: [], no: n.id, casa: n.id, espera: 1000 + rng() * 9000, motivo: "passeio", carrega: false, dist: 0 };
  });
  const por = new Map(atores.map((a) => [a.id, a]));

  /** Route through `via` nodes in order. A walker mid-edge may first turn back to the node it left, whichever is shorter. */
  const ir = (a: Ator, via: string[]) => {
    const rotaDe = (ini: string) => { const r = [ini]; for (const v of via) r.push(...caminho(p, r[r.length - 1]!, v).slice(1)); return r; };
    let r: string[];
    if (a.fase === "andando" && a.rota.length > 0) {
      const adiante = rotaDe(a.rota[0]!);
      const volta = rotaDe(a.no);
      const ca = dist(a, p.nos[adiante[0]!]!) + tamanho(p, adiante);
      const cv = dist(a, p.nos[volta[0]!]!) + tamanho(p, volta);
      r = cv < ca ? volta : adiante;
    } else r = rotaDe(a.no);
    a.rota = a.fase === "andando" ? r : r.slice(1);
    if (a.fase !== "andando" && a.rota.length === 0) { chegou(a); return; }
    a.fase = "andando";
  };
  const alvoPasseio = (a: Ator) => {
    const mesma = livres.filter((n) => n.zona === p.sala[a.id] || (n.zona === "corredor" && p.sala[a.id] === "mesa"));
    const pool = rng() < 0.65 && mesma.length > 0 ? mesma : livres;
    return pool[Math.floor(rng() * pool.length)]!.id;
  };
  const passear = (a: Ator) => { a.motivo = "passeio"; ir(a, [rng() < 0.5 ? a.casa : alvoPasseio(a)]); };
  const chegou = (a: Ator) => {
    a.fase = "ocioso";
    if (a.no === a.casa) { a.fase = "sentado"; a.carrega = false; delete a.pega; if (a.motivo === "recado") a.motivo = "trabalho"; a.espera = 4000 + rng() * 9000; return; }
    a.espera = pausa(rng);
  };

  return {
    atores,
    setMaxPasseio(n: number) { maxPasseio = n; },
    /** Hands a scroll from the desk of `de` to the desk of `para`: `para` walks to `de`, picks it up, carries it home. */
    recado(r: Recado) {
      const a = por.get(r.para);
      const de = p.assento[r.de];
      if (!a || !de || r.de === r.para) return;
      const pega = p.nos[de]!.viz[0]!; // the lane node beside the sender's seat
      a.motivo = "recado";
      a.carrega = false;
      a.pega = pega;
      ir(a, [pega, a.casa]);
      if (a.no === pega && a.fase !== "andando") a.carrega = true;
    },
    /** Static pose (reduced motion): everyone sits at their own desk. */
    parar() { for (const a of atores) { const n = p.nos[a.casa]!; Object.assign(a, { x: n.x, y: n.y, fase: "sentado", rota: [], no: a.casa, carrega: false, motivo: "passeio" }); } },
    passo(dtMs: number, intencoes: Record<string, Atividade | undefined>) {
      const dt = Math.min(dtMs, 100);
      let fora = atores.filter((a) => a.motivo === "passeio" && a.fase !== "sentado").length;
      for (const a of atores) {
        const i = intencoes[a.id];
        const trabalha = !!(i?.ativo || i?.falhou);
        if (trabalha && a.motivo === "passeio") {
          a.motivo = "trabalho";
          if (a.no === a.casa && a.fase !== "andando") a.fase = "sentado"; else ir(a, [a.casa]);
        } else if (!trabalha && a.motivo === "trabalho") { a.motivo = "passeio"; a.espera = 800 + rng() * 2000; }
        if (a.fase === "andando") {
          let resta = (VEL[a.motivo] * dt) / 1000;
          while (resta > 0 && a.rota.length > 0) {
            const alvo = p.nos[a.rota[0]!]!;
            const d = dist(a, alvo);
            if (d <= resta) {
              resta -= d; a.dist += d; a.x = alvo.x; a.y = alvo.y; a.no = alvo.id; a.rota.shift();
              if (a.no === a.pega) { a.carrega = true; delete a.pega; }
            } else {
              const dx = alvo.x - a.x;
              a.x += (dx / d) * resta; a.y += ((alvo.y - a.y) / d) * resta; a.dist += resta; resta = 0;
              if (Math.abs(dx) > 0.5) a.face = dx > 0 ? 1 : -1;
            }
          }
          if (a.rota.length === 0) { chegou(a); if ((a.fase as Fase) === "ocioso" && a.motivo !== "passeio") ir(a, [a.casa]); }
          continue;
        }
        if (a.motivo !== "passeio") continue;
        a.espera -= dt;
        if (a.espera > 0) continue;
        if (a.fase === "sentado") {
          if (fora < maxPasseio) { fora++; passear(a); } else a.espera = 2000 + rng() * 4000;
        } else passear(a); // ocioso: head home or somewhere else
      }
    },
  };
}
export type Sim = ReturnType<typeof criarSim>;

const VIVAS = new Set(["intake", "planejando", "executando"]);
export interface Painel { aoVivo: boolean; atividade: Record<string, Atividade>; tokens: Record<string, number> }

/** What the hall shows, from the missions and this session's events. Only live missions make agents active; failures also stay visible on halted ones. */
export function derivarPainel(ms: readonly M[], events: Record<string, readonly Ev[]>, nomeProjeto: (id: string) => string = (id) => id): Painel {
  const atividade: Record<string, Atividade> = {};
  const tokens: Record<string, number> = {};
  const at = (t: string) => (atividade[t] ??= { ativo: false, falhou: false });
  let aoVivo = false;
  for (const m of ms) {
    const viva = VIVAS.has(m.stage);
    if (!viva && m.stage !== "parada") continue;
    const evs = events[m.id] ?? [];
    if (viva) {
      aoVivo = true;
      const x = at(m.stage === "intake" ? "intake" : m.stage === "planejando" ? "planner" : "orchestrator");
      x.ativo = true; x.projeto = nomeProjeto(m.project);
    }
    const vistos = membrosDe(evs);
    const tipoDe = new Map(vistos.map((v) => [v.id, membro(v.tipo).tecnico]));
    tipoDe.set("main", "orchestrator");
    for (const v of vistos) {
      const t = membro(v.tipo).tecnico;
      if (!ROSTER.some((r) => r.tecnico === t)) continue;
      if (v.estado === "falhou") at(t).falhou = true;
      else if (v.estado === "ativo" && viva) { const x = at(t); x.ativo = true; x.projeto = nomeProjeto(m.project); if (v.ferramenta) x.ferramenta = v.ferramenta; }
    }
    if (viva) at("orchestrator").projeto = nomeProjeto(m.project);
    if (viva) for (let i = evs.length - 1; i >= 0; i--) { const e = evs[i]!; if (e.kind === "tool" && e.agent === "main") { at("orchestrator").ferramenta = e.name; break; } }
    for (const [id, n] of Object.entries(tokensVivos(evs).porAgente)) { const t = tipoDe.get(id); if (t) tokens[t] = (tokens[t] ?? 0) + n; }
    if (evs.length === 0) for (const [k, n] of Object.entries(m.tokensByAgent ?? {})) { const t = membro(k).tecnico; tokens[t] = (tokens[t] ?? 0) + n; }
  }
  return { aoVivo, atividade, tokens };
}

/** New handoffs since the last call: each `subagent-started` beyond the count already seen goes from the previous started agent (or the Regente) to the new one. First call is the baseline. */
export function recadosNovos(vistos: Record<string, number> | undefined, events: Record<string, readonly Ev[]>): { contagem: Record<string, number>; novos: Recado[] } {
  const contagem: Record<string, number> = {};
  const novos: Recado[] = [];
  for (const [mid, evs] of Object.entries(events)) {
    const ini = evs.flatMap((e) => (e.kind === "subagent-started" ? [membro(e.subagentType).tecnico] : []));
    contagem[mid] = ini.length;
    if (vistos === undefined) continue;
    for (let i = vistos[mid] ?? 0; i < ini.length; i++) novos.push({ de: (i > 0 ? ini[i - 1] : undefined) || "orchestrator", para: ini[i]! });
  }
  return { contagem, novos };
}
