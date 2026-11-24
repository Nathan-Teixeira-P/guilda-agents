import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { newMission, parseMission, transition, type Mission } from "@lab/core/src/mission.ts";
import { ARTEFATOS, caminhoDentro, estadoDoArtigo, podarVersoes, slugDoTema, validarSugestoes, type EstadoArtigo, type PedidoRedacao, type Sugestao } from "@lab/core/src/redacao.ts";

/** Same shape as mission ids; anything else never reaches the filesystem. */
export const SLUG = /^[a-z0-9-]{1,64}$/;
const MAX_ARTEFATO = 5 * 1024 * 1024;
const NOMES: readonly string[] = Object.values(ARTEFATOS);
export type Versao = { versao: number; arquivo: string; atual?: boolean };

/** Articles live in `<dir>/<slug>/artigo.json` (a `kind: "redacao"` Mission plus the request). */
export function createRedacaoStore(dir: string) {
  const base = resolve(dir);
  mkdirSync(base, { recursive: true });
  const dirOf = (slug: string) => {
    if (!SLUG.test(slug)) throw new Error(`invalid slug: ${slug}`);
    return join(base, slug);
  };
  const escrever = (arquivo: string, dados: unknown) => {
    const tmp = `${arquivo}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(dados, null, 2));
    renameSync(tmp, arquivo);
  };
  const ler = (slug: string): Mission | undefined => {
    if (!SLUG.test(slug)) return undefined;
    try {
      return parseMission(readFileSync(join(dirOf(slug), ARTEFATOS.artigo), "utf8"));
    } catch {
      return undefined;
    }
  };
  const salvar = (m: Mission) => {
    mkdirSync(dirOf(m.id), { recursive: true });
    escrever(join(dirOf(m.id), ARTEFATOS.artigo), m);
  };
  const sugFile = (id: string) => join(base, "_sugestoes", `${id}.json`);

  return {
    dir: base,
    ler,
    salvar,
    criar(pedido: PedidoRedacao, now: () => Date): Mission {
      const slug = slugDoTema(pedido.tema ?? "", readdirSync(base));
      const m: Mission = { ...newMission(slug, "redacao", now), kind: "redacao", tema: pedido.tema ?? "", pedido, versao: 1, versoes: [] };
      mkdirSync(dirOf(slug)); // throws if it exists: never overwrites
      salvar(m);
      return m;
    },
    listar(estado?: EstadoArtigo): Mission[] {
      return readdirSync(base)
        .map(ler)
        .filter((m): m is Mission => m !== undefined && m.kind === "redacao" && (estado === undefined || estadoDoArtigo(m.stage) === estado))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    /** Known artifact names only, resolved inside the article folder; symlinks are never followed. */
    lerArtefato(slug: string, nome: string): Buffer | undefined {
      if (!NOMES.includes(nome)) return undefined;
      try {
        const p = caminhoDentro(dirOf(slug), nome); // symlink escape throws: same as absent
        const fd = openSync(p, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const st = fstatSync(fd);
          return st.isFile() && st.size <= MAX_ARTEFATO ? readFileSync(fd) : undefined;
        } finally { closeSync(fd); }
      } catch { return undefined; }
    },
    artefatos(slug: string): string[] {
      return NOMES.filter((n) => { try { return lstatSync(caminhoDentro(dirOf(slug), n)).isFile(); } catch { return false; } });
    },
    /** Records a saved version file (`versoes/...`), marks it current and drops files beyond the 3 most recent. */
    registrarVersao(slug: string, arquivo: string): Mission {
      const m = ler(slug);
      if (!m) throw new Error("artigo não encontrado");
      if (!arquivo.startsWith("versoes/")) throw new Error("versão: arquivo deve ficar em versoes/");
      caminhoDentro(dirOf(slug), arquivo);
      const velhas = (Array.isArray(m["versoes"]) ? m["versoes"] : []) as Versao[];
      const n = velhas.reduce((a, v) => Math.max(a, v.versao), 0) + 1;
      const todas = [...velhas.map((v) => ({ versao: v.versao, arquivo: v.arquivo })), { versao: n, arquivo, atual: true }];
      const mantidas = podarVersoes(todas);
      for (const v of todas) {
        if (mantidas.includes(v)) continue;
        try { unlinkSync(caminhoDentro(dirOf(slug), v.arquivo)); } catch { /* already gone */ }
      }
      const next = { ...m, versoes: mantidas };
      salvar(next);
      return next;
    },
    /** Removes the article folder and nothing else; refuses a symlinked folder. */
    excluir(slug: string): boolean {
      const d = dirOf(slug);
      try { if (!lstatSync(d).isDirectory()) return false; } catch { return false; }
      rmSync(d, { recursive: true, force: true });
      return true;
    },
    /** On boot no child exists: running articles become `pausada` (resumable via /retomar; never restarted by themselves). */
    recover(now: () => Date): string[] {
      const pausados: string[] = [];
      for (const m of this.listar()) {
        if (m.stage !== "planejando" && m.stage !== "executando") continue;
        salvar(transition(m, "pausada", { now, reason: "servidor reiniciou durante a execução" }));
        pausados.push(m.id);
      }
      return pausados;
    },
    salvarSugestoes(id: string, json: unknown) {
      if (!SLUG.test(id)) throw new Error(`invalid id: ${id}`);
      const r = validarSugestoes(json);
      mkdirSync(join(base, "_sugestoes"), { recursive: true });
      escrever(sugFile(id), r.validas);
      return r;
    },
    lerSugestoes(id: string): Sugestao[] | undefined {
      if (!SLUG.test(id)) return undefined;
      try {
        const r = validarSugestoes(JSON.parse(readFileSync(sugFile(id), "utf8")));
        return r.validas;
      } catch { return undefined; }
    },
  };
}
export type RedacaoStore = ReturnType<typeof createRedacaoStore>;
