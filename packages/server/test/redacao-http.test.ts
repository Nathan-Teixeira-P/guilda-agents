import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { transition } from "@lab/core/src/mission.ts";
import { createServer } from "../src/http.ts";
import { createRedacaoStore, type RedacaoStore } from "../src/redacao-store.ts";
import { createStore } from "../src/store.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const clock = () => new Date("2026-11-21T12:00:00Z");

let root: string, rs: RedacaoStore, srv: ReturnType<typeof createServer>, port: number;

const call = (method: string, path: string, body?: object, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; headers: Record<string, any>; buf: Buffer; json: any }>((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      const cs: Buffer[] = [];
      res.on("data", (c) => cs.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(cs);
        let json: any;
        try { json = JSON.parse(buf.toString("utf8")); } catch { /* binary */ }
        resolve({ status: res.statusCode!, headers: res.headers, buf, json });
      });
    });
    r.on("error", reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });

function png(w: number, h: number): Buffer {
  const chunk = (tipo: string, dados: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo), dados]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([len, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc(h * (w + 1)))), chunk("IEND", Buffer.alloc(0))]);
}

const criar = async (extra: object = {}) => (await call("POST", "/redacao", { modo: "definido", tema: "Agentes de IA", confirmarUso: true, ...extra })).json.artigo;
const emRevisao = (slug: string) => {
  const m = rs.ler(slug)!;
  rs.salvar(transition(m.stage === "intake" ? transition(m, "planejando", { now: clock }) : m, "aguardando-aprovacao", { now: clock })); // creating an article already starts phase 1
};

beforeEach(async () => {
  mkdirSync(SCRATCH, { recursive: true });
  root = mkdtempSync(join(SCRATCH, "red-"));
  rs = createRedacaoStore(join(root, "redacao"));
  srv = createServer({ runner: (o) => new Promise((_ok, no) => o.signal?.addEventListener("abort", () => no(new Error("aborted")))), store: createStore(join(root, "missions")), clock, host: "127.0.0.1", redacao: rs });
  port = await srv.listen(0);
});
afterEach(async () => { await srv.close(); });

describe("POST /redacao", () => {
  it("creates the article folder with artigo.json and a slug", async () => {
    const r = await call("POST", "/redacao", { modo: "definido", tema: "Agentes de IA", confirmarUso: true });
    expect(r.status).toBe(201);
    expect(r.json.artigo).toMatchObject({ id: "agentes-de-ia", kind: "redacao", stage: "planejando" }); // phase 1 starts right away
    expect(existsSync(join(root, "redacao", "agentes-de-ia", "artigo.json"))).toBe(true);
    expect((await criar()).id).toBe("agentes-de-ia-2"); // collision
  });
  it("rejects an invalid request with 400", async () => {
    expect((await call("POST", "/redacao", { modo: "definido" })).status).toBe(400);
    expect((await call("POST", "/redacao", { modo: "x" })).status).toBe(400);
  });
  it("refuses missing or unreadable local references, listing them, and writes nothing", async () => {
    const ok = join(root, "ref.md"); writeFileSync(ok, "x");
    const r = await call("POST", "/redacao", { modo: "definido", tema: "T", referencias: [{ tipo: "caminho", valor: ok }, { tipo: "caminho", valor: join(root, "nope.md") }, { tipo: "caminho", valor: "relativo.md" }, { tipo: "url", valor: "https://x.test" }] });
    expect(r.status).toBe(400);
    expect(r.json.invalidas.map((i: any) => i.valor)).toEqual([join(root, "nope.md"), "relativo.md"]);
    expect(rs.listar()).toEqual([]);
    expect((await call("POST", "/redacao", { modo: "definido", tema: "T", referencias: [{ tipo: "caminho", valor: ok }], confirmarUso: true })).status).toBe(201);
  });
});

describe("listing and reading", () => {
  it("lists and filters by estado", async () => {
    const a = await criar({ tema: "Um" }); await criar({ tema: "Dois" });
    emRevisao(a.id);
    expect((await call("GET", "/redacao")).json.artigos).toHaveLength(2);
    expect((await call("GET", "/redacao?estado=em-revisao")).json.artigos.map((x: any) => x.id)).toEqual(["um"]);
    expect((await call("GET", "/redacao?estado=rascunho")).json.artigos.map((x: any) => x.id)).toEqual(["dois"]);
    expect((await call("GET", "/redacao?estado=bogus")).status).toBe(400);
  });
  it("gets one article, 404 unknown, 400 bad slug", async () => {
    const a = await criar();
    const r = await call("GET", `/redacao/${a.id}`);
    expect(r.json).toMatchObject({ estado: "rascunho", artefatos: ["artigo.json"] });
    expect((await call("GET", "/redacao/nao-existe")).status).toBe(404);
    expect((await call("GET", "/redacao/Bad_Slug")).status).toBe(400);
    expect((await call("GET", `/redacao/${"a".repeat(65)}`)).status).toBe(400);
  });
});

describe("artifacts", () => {
  it("serves listed artifacts and refuses everything else", async () => {
    const a = await criar();
    writeFileSync(join(root, "redacao", a.id, "rascunho.md"), "# oi");
    writeFileSync(join(root, "redacao", a.id, "segredo.txt"), "no");
    const ok = await call("GET", `/redacao/${a.id}/artefatos/rascunho.md`);
    expect(ok.status).toBe(200);
    expect(ok.buf.toString()).toBe("# oi");
    expect(ok.headers["content-type"]).toContain("text/markdown");
    expect((await call("GET", `/redacao/${a.id}/artefatos/pesquisa.md`)).status).toBe(404); // listed but absent
    for (const n of ["segredo.txt", "..%2F..%2Fmissions", "%2e%2e%2fartigo.json", "..", "%2Fetc%2Fpasswd"])
      expect([400, 404]).toContain((await call("GET", `/redacao/${a.id}/artefatos/${n}`)).status);
    expect((await call("GET", "/redacao/..%2F..%2Fetc/artefatos/x")).status).toBe(400);
  });
  it("never follows a symlinked artifact out of the folder", async () => {
    const a = await criar();
    const fora = join(root, "fora.md"); writeFileSync(fora, "SECRET");
    symlinkSync(fora, join(root, "redacao", a.id, "final.md"));
    const r = await call("GET", `/redacao/${a.id}/artefatos/final.md`);
    expect(r.status).toBe(404);
    expect(r.buf.toString()).not.toContain("SECRET");
  });
  it("downloads the cover as png (1200x627 IHDR) and svg with attachment", async () => {
    const a = await criar();
    writeFileSync(join(root, "redacao", a.id, "capa.png"), png(1200, 627));
    writeFileSync(join(root, "redacao", a.id, "capa.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const p = await call("GET", `/redacao/${a.id}/capa.png`);
    expect(p.headers["content-type"]).toBe("image/png");
    expect(p.headers["content-disposition"]).toContain("attachment");
    expect(p.buf.subarray(1, 4).toString()).toBe("PNG");
    expect(p.buf.subarray(12, 16).toString()).toBe("IHDR");
    expect([p.buf.readUInt32BE(16), p.buf.readUInt32BE(20)]).toEqual([1200, 627]);
    const s = await call("GET", `/redacao/${a.id}/capa.svg`);
    expect(s.headers["content-type"]).toBe("image/svg+xml");
    expect(s.headers["content-disposition"]).toContain("attachment");
    const sem = await criar({ tema: "Sem capa" });
    expect((await call("GET", `/redacao/${sem.id}/capa.png`)).status).toBe(404);
  });
});

describe("actions", () => {
  it("approves only in em-revisao (409 otherwise)", async () => {
    const a = await criar();
    expect((await call("POST", `/redacao/${a.id}/aprovar`, {})).status).toBe(409);
    emRevisao(a.id);
    const r = await call("POST", `/redacao/${a.id}/aprovar`, {});
    expect(r.status).toBe(200);
    expect(r.json.estado).toBe("edicao-final");
    expect((await call("POST", `/redacao/${a.id}/aprovar`, {})).status).toBe(409); // second click
  });
  it("adjustments need a comment and a review state, then open a new version", async () => {
    const a = await criar();
    emRevisao(a.id);
    expect((await call("POST", `/redacao/${a.id}/ajustes`, {})).status).toBe(400);
    expect((await call("POST", `/redacao/${a.id}/ajustes`, { comentario: "  " })).status).toBe(400);
    const r = await call("POST", `/redacao/${a.id}/ajustes`, { comentario: "mais curto" });
    expect(r.status).toBe(200);
    expect(r.json.estado).toBe("rascunho");
    expect(r.json.artigo).toMatchObject({ versao: 2, comentarios: [{ texto: "mais curto" }] });
    expect((await call("POST", `/redacao/${a.id}/ajustes`, { comentario: "de novo" })).status).toBe(409);
  });
  it("cancels, reopens, and refuses to cancel twice", async () => {
    const a = await criar();
    expect((await call("POST", `/redacao/${a.id}/reabrir`, {})).status).toBe(409);
    expect((await call("POST", `/redacao/${a.id}/cancelar`, {})).json.estado).toBe("cancelado");
    expect((await call("POST", `/redacao/${a.id}/cancelar`, {})).status).toBe(409);
    expect((await call("POST", `/redacao/${a.id}/reabrir`, {})).json.estado).toBe("rascunho");
  });
  it("emits an artigo SSE event on state change", async () => {
    const a = await criar();
    const got = new Promise<string>((resolve) => {
      const r = request({ host: "127.0.0.1", port, path: "/events" }, (res) => {
        res.setEncoding("utf8");
        let t = "";
        res.on("data", (c) => { t += c; if (t.includes("event: artigo")) { resolve(t); r.destroy(); } });
      });
      r.on("error", () => {});
      r.end();
    });
    await new Promise((r) => setTimeout(r, 50));
    await call("POST", `/redacao/${a.id}/cancelar`, {});
    expect(await got).toContain(`"slug":"${a.id}","estado":"cancelado"`);
  });
});

describe("delete", () => {
  it("removes the whole article folder and only it", async () => {
    const a = await criar(); const b = await criar({ tema: "Outro" });
    writeFileSync(join(root, "redacao", a.id, "rascunho.md"), "x");
    mkdirSync(join(root, "redacao", a.id, "versoes"));
    const r = await call("DELETE", `/redacao/${a.id}`);
    expect(r.status).toBe(200);
    expect(existsSync(join(root, "redacao", a.id))).toBe(false);
    expect(existsSync(join(root, "redacao", b.id, "artigo.json"))).toBe(true);
    expect(existsSync(join(root, "redacao"))).toBe(true);
    expect((await call("DELETE", `/redacao/${a.id}`)).status).toBe(404);
    expect((await call("DELETE", "/redacao/Bad_Slug")).status).toBe(400);
  });
  it("refuses to follow a symlinked article folder", async () => {
    const fora = join(root, "fora"); mkdirSync(fora); writeFileSync(join(fora, "keep.txt"), "k");
    symlinkSync(fora, join(root, "redacao", "ligado"));
    expect((await call("DELETE", "/redacao/ligado")).status).toBe(404);
    expect(existsSync(join(fora, "keep.txt"))).toBe(true);
  });
});

describe("suggestions", () => {
  it("creates an article from a chosen suggestion", async () => {
    rs.salvarSugestoes("s1", [{ tema: "Tema Bom", motivo: "agora", fontes: [{ url: "https://x.test", acessadoEm: "2026-11-21T10:00:00Z" }], rank: 1 }]);
    const r = await call("POST", "/redacao/sugestoes/s1/escolher", { indice: 0 });
    expect(r.status).toBe(201);
    expect(r.json.artigo).toMatchObject({ id: "tema-bom", tema: "Tema Bom" });
    expect((await call("POST", "/redacao/sugestoes/s1/escolher", { indice: 5 })).status).toBe(404);
    expect((await call("POST", "/redacao/sugestoes/nada/escolher", { indice: 0 })).status).toBe(404);
    expect((await call("POST", "/redacao/sugestoes/Bad..Id/escolher", { indice: 0 })).status).toBe(400);
  });
});

describe("surface", () => {
  it("has no publish or send routes and keeps Host/Origin guards", async () => {
    const a = await criar();
    for (const p of ["publicar", "enviar", "publish"]) expect((await call("POST", `/redacao/${a.id}/${p}`, {})).status).toBe(404);
    expect((await call("POST", "/redacao", { modo: "definido", tema: "x" }, { origin: "http://evil.test" })).status).toBe(403);
  });
  it("answers 501 when the store is not configured", async () => {
    const s2 = createServer({ runner: async () => { throw new Error("x"); }, store: createStore(join(root, "m2")), clock, host: "127.0.0.1" });
    const p2 = await s2.listen(0);
    const status = await new Promise<number>((res) => request({ host: "127.0.0.1", port: p2, path: "/redacao" }, (r) => { r.resume(); res(r.statusCode!); }).end());
    await s2.close();
    expect(status).toBe(501);
  });
});
