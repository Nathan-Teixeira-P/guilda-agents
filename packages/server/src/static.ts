import { createReadStream, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, sep } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};
const SECURITY = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const HELP = `<!doctype html><meta charset="utf-8"><title>Salão da Guilda</title>
<h1>Front-end ainda não compilado</h1>
<p>A pasta <code>packages/web/dist</code> não existe. Compile com <code>npm run build:web</code> e recarregue.</p>
<p>A API já responde em <code>/missions</code> e <code>/projects</code>.</p>`;

/** Static file handler confined to `root` (realpath prefix check, so `..` and symlinks cannot escape). Non-API GET/HEAD only. */
export function createStatic(root: string) {
  const reply = (res: ServerResponse, status: number, type: string, body: string, head: boolean) => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...SECURITY });
    res.end(head ? undefined : body);
  };
  const realRoot = () => { try { return realpathSync(root); } catch { return undefined; } };
  /** Real path of a regular file strictly inside the root, else undefined. */
  const resolveFile = (base: string, rel: string) => {
    try {
      const real = realpathSync(join(base, rel));
      return real.startsWith(base + sep) && statSync(real).isFile() ? real : undefined;
    } catch { return undefined; }
  };

  return (req: IncomingMessage, res: ServerResponse) => {
    const head = req.method === "HEAD";
    if (req.method !== "GET" && !head) return reply(res, 405, "text/plain", "method not allowed", false);
    const base = realRoot();
    if (!base) return reply(res, 200, "text/html; charset=utf-8", HELP, head);
    let rel: string;
    try { rel = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname); } catch { return reply(res, 400, "text/plain", "bad request", head); }
    if (rel.includes("\0")) return reply(res, 400, "text/plain", "bad request", head);
    rel = rel.replace(/^\/+/, "");
    let file = rel === "" ? undefined : resolveFile(base, rel);
    // SPA fallback only for extensionless routes; a missing asset is a real 404
    if (!file && extname(rel) === "") file = resolveFile(base, "index.html");
    if (!file) return reply(res, 404, "text/plain", "not found", head);
    res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache", ...SECURITY });
    if (head) return res.end();
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
  };
}
