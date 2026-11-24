import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./http.ts";
import { createProjectsStore } from "./projects-store.ts";
import { runPhase } from "./runner.ts";
import { createStatic } from "./static.ts";
import { createRedacaoStore } from "./redacao-store.ts";
import { createStore } from "./store.ts";
import { createUsageSource, spawnClaude } from "./usage-source.ts";

export const DEFAULT_PORT = 4317;
const HUB = fileURLToPath(new URL("../../..", import.meta.url));

/** Wires the real components. Always binds 127.0.0.1 (createServer refuses anything else). */
export async function startHub(o: { hubDir?: string; port?: number } = {}) {
  const hub = o.hubDir ?? HUB;
  const workspacesDir = join(hub, "workspaces");
  mkdirSync(workspacesDir, { recursive: true });
  const server = createServer({
    agent: process.env["GUILDA_AGENT"] ?? "orchestrator", // the lean orchestrator prompt replaces the default one (~20k tokens less per turn); GUILDA_AGENT= (empty) disables
    runner: runPhase, // real `claude`, spawned without a shell
    store: createStore(join(hub, "missions")),
    registry: createProjectsStore(join(hub, "projects.json")),
    workspacesDir,
    hubDir: hub,
    redacao: createRedacaoStore(join(hub, "redacao")), // mkdir recursive inside
    clock: () => new Date(),
    usage: createUsageSource({ clock: () => new Date(), file: join(hub, "usage.json"), spawn: spawnClaude }), // consults only on demand
    host: "127.0.0.1",
    static: createStatic(join(hub, "packages", "web", "dist")),
  });
  const port = await server.listen(o.port ?? DEFAULT_PORT);
  return { server, port, close: () => server.close() }; // close() aborts running missions, which kills the claude children
}

if (import.meta.main) {
  const raw = process.env["PORT"];
  const port = raw === undefined || raw === "" ? DEFAULT_PORT : Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`invalid PORT: ${raw}`);
    process.exit(1);
  }
  const hub = await startHub({ port });
  console.log(`Salao da Guilda: http://127.0.0.1:${hub.port}`);
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    setTimeout(() => process.exit(1), 10_000).unref(); // children ignoring the abort must not hang us
    hub.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
