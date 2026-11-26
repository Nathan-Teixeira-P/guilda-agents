/** Pure prompt builders for the orchestrator. Only paths and capped notes go in: never file contents. */
export const NOTES_PROMPT_LIMIT = 2000;

export interface Fase1Input {
  demanda: string;
  stagingDir: string; // absolute `missions/<id>/out`: the only place phase 1 may write
  projetoPath: string;
  briefingPath?: string;
  notas?: string; // project-notes.md, appended capped
  comentario?: string; // user feedback when adjusting a draft
  retomada?: boolean; // resuming: audit what already exists before continuing
  relatorio?: boolean; // report-only mission: no code changes will follow
  classe?: string; // optional pre-classification (trivial|media|grande); the orchestrator classifies otherwise
}

export function promptFase1(i: Fase1Input): string {
  const out = i.stagingDir;
  const lines = [
    `Phase 1 (planning only). Target project: ${i.projetoPath}`,
    ...(i.classe ? [`Class: ${i.classe}`] : []),
    ...(i.briefingPath ? [`Briefing file: ${i.briefingPath}`] : []),
    "",
    "Demand:",
    i.demanda,
    ...(i.comentario ? ["", "User feedback on the previous draft:", i.comentario] : []),
    ...(i.notas?.trim() ? ["", "Project notes (truncated):", i.notas.slice(0, NOTES_PROMPT_LIMIT)] : []),
    ...(i.retomada ? ["", `RESUMING. ${out} already holds earlier work. Before anything else, list and read what exists there (handoff, prd, specs), judge what is complete, wrong or missing against the demand, and redo only that. Do not start over.`] : []),
    "",
    "Rules:",
    `- Only write files under ${out}. Use ${out}/handoff/briefing.md (the intake briefing, when the demand is a ClickUp link), ${out}/handoff/map.md, ${out}/handoff/plan.md, ${out}/prd/<feature>.prd.md, ${out}/specs/NNN-<name>.spec.md, ${out}/specs/INDEX.md and ${out}/handoff/blocks.json (delivery blocks, written by spec-writer).`,
    "- Pass file paths to agents, never file contents. Tell each agent its output path.",
    "- Subagents cannot create subagents: call them yourself, one at a time. Explorer cannot write files: save its map to the map path yourself.",
    "- Map: ask explorer for one line per relevant file: `path` (lines): symbols there, pattern to copy (max 40; may exceed 10 lines). Later agents read it first and search only for what it lacks.",
    "- First classify the demand. LEAN (docs, config, one-file or small change, no UI, no ambiguity): only explorer (haiku), then write a short plan to the plan path; no planner, PRD, specs. STANDARD (one clear feature, up to 5 specs): explorer, spec-writer; spec-writer gets the demand and writes the plan and the specs; no planner, no PRD. FULL (ambiguous, product decisions, several features or over 5 specs): explorer, planner, prd-writer, spec-writer. Each agent on its own model; never opus.",
    ...(i.relatorio
      ? [`- REPORT-ONLY demand: you never analyze or write it yourself: delegate through the agents (explorer to map, then reviewer, read-only, to check against the demand; each saves its output at the path you give), then save ${out}/handoff/relatorio.md from their results (findings with evidence) and ${out}/handoff/plan.md saying this is report-only, with no code changes. No PRD or specs.`]
      : ["- Default flow: analyze the demand, plan, then PRD and specs, so that phase 2 writes the code right after the user seals. Even when the demand reads like an analysis (\"check whether X was done\"), delegate the analysis to the agents in phase 1 and make the plan/specs the concrete changes to make; the plan is never just an audit."]),
    `- UI demand (new or changed screen/page): before spec-writer (and after the planner, if any), call frontend-architect to write the design doc ${out}/design/<feature>.design.md AND a visual model of the page at ${out}/design/mockup.html: ONE self-contained HTML file, inline CSS only, no scripts, no external requests or fonts, desktop and phone widths, real labels and states (no lorem ipsum). The user approves the look from it when sealing; the specs must follow it. Then YOU publish that file once with the Artifact tool (file_path = the mockup, title = the feature name; it starts private, never share it) and save its link as one line in ${out}/design/mockup-link.md. If the Artifact tool is unavailable or fails, skip it and say so in the plan.`,
    "- Never commit or push. Do not edit the project. No spec-checker: the hub checks specs.",
  ];
  return lines.join("\n");
}

/** Appended to phase 2: spec-to-spec handoff and the exact Bash allow-list, so coders do not burn turns on re-exploring or on denied commands. */
export const instrucaoExecucao = (comandos: string[], goTest?: string) =>
  [
    "After each spec's coder, call tester: it runs the checks for what changed and compares with the spec's acceptance criteria. Only a pass moves to the next spec; anything failing or missing goes back to the coder first. Failures in code outside the spec do not block: list them as pending.",
    "Security gate: if a spec's changes touch user input, auth, permissions, personal data, secrets, shell, network or dependencies, call security-reviewer after the tester passes, with the changed file paths. A high or critical finding goes back to the coder. If unsure, call it.",
    "When a spec passes (tester, plus security-reviewer when the gate applies), write on its own line exactly `OK <spec-number>` (never otherwise).",
    ...(goTest ? [
      "Builds are the user's job: no agent compiles anything (no go build, go test or the test script) before the user has built. Finish writing the specs you can first, then ask once for the whole block: write on its own line exactly `BUILD <command>` and stop there. For Go use `BUILD CGO_ENABLED=1 go test -p 1 -run '^$' ./pkg/<dir>/ ...` (the touched packages).",
      `Only after the user confirms the build: tester runs \`${goTest} ./pkg/<dir>/ [-run Name] [-v]\`. If it is killed (exit 124, 137, 143) or times out, do not retry: report it as pending.`,
    ] : ["If something only works after a build, never build: write on its own line exactly `BUILD <command>` and stop; the user runs it and resumes."]),
    "Handoff: do not call explorer for each spec; tell each agent to read .claude/handoff/map.md first, if it exists, and search only for what it does not cover. Give each coder its spec path plus the previous coder's short report (what was created, decisions made, commands run with their result, what was NOT run or verified; up to 10 lines). Never treat unrun checks as passed.",
    comandos.length
      ? `Tell every coder and tester: the only project commands allowed are ${comandos.map((c) => `\`${c}\``).join(", ")}, plus read-only \`git status|diff|log\`${goTest ? " and the Go test script above" : ""}. Run each alone, written exactly like that. Anything else is denied: do not retry it or try variants; report it as pending for the user.`
      : "No project commands are configured: agents have no test Bash. Report unverified work as pending for the user.",
  ].join("\n");

/** Appended to phase 2: the agent leaves a short, structured wrap-up that the UI shows when the contract is fulfilled. */
export const instrucaoRelatorio = "Report-only mission: do NOT modify the project's code or files. Delegate to no coder: only have the `scribe` write the wrap-up.";
export const instrucaoResumo = (path: string) =>
  `When finished, have the scribe (you never write project files yourself) write a JSON file at ${path} with exactly {"feito": string[], "pendente": string[], "acaoUsuario": string[]}: short pt-BR items. feito = what was delivered; pendente = what was left undone, partial or unverified; acaoUsuario = what the user must do (review, manual test, config, commit...). Use [] when none.`;

/** Follow-up on a concluded mission: same session, new request from the user. */
export const promptContinuacao = (comentario: string, projetoPath: string) =>
  [`The mission was concluded, and the user now asks for a follow-up in the same project (${projetoPath}). Use what you already know from this session; do not redo finished work. Run it through the usual agent flow, never implementing yourself: classify it (small: explorer → coder → tester → reviewer, as in phase 2; use security-reviewer when the diff touches input, auth, secrets, shell, network or dependencies); if it is large, ambiguous or a product decision, stop and ask the user instead of guessing.`, "", "New request:", comentario, "", "Never commit or push. Pass file paths to agents, never contents. Subagents cannot create subagents."].join("\n");

export interface Fase2Input {
  specs: string[]; // absolute spec paths
  projetoPath: string;
  comentario?: string; // user comment when resuming a paused run
  retomada?: boolean; // resuming: audit the project before continuing
  adiadas?: number; // specs of this mission left out of this run (other blocks, or already done)
  hubDir?: string; // absolute hub folder: tells agents where the log compactor lives (spec 036)
}

export function promptFase2(i: Fase2Input): string {
  return [
    ...(i.specs.length
      ? [`Approved. Phase 2 (execution) in ${i.projetoPath}. Implement these specs in order, one at a time:`, ...i.specs.map((s) => `- ${s}`)]
      : [`Approved. Phase 2 (execution) in ${i.projetoPath}. There are no specs: implement the approved plan at ${i.projetoPath}/.claude/handoff/plan.md.`]),
    ...(i.adiadas ? [`Only the specs listed above: ${i.adiadas} other(s) are done or belong to blocks not sealed yet. Do not implement them.`] : []),
    ...(i.retomada ? ["", "RESUMING. Before implementing anything, audit the current state: read the specs/plan, run `git status`, `git diff --stat` and `git log -5` in the project, read the changed files, and run the test commands. For each spec decide: done, partial, missing, or needs change (something done is wrong, outdated, or lost). Report that audit in 10 lines max, then continue only with what is partial, missing or needs change. Do not redo what is done and correct."] : []),
    ...(i.comentario ? ["", "The run was paused; the user resumed it with this comment:", i.comentario, ""] : []),
    "Never commit or push. Pass file paths to agents, never contents. Subagents cannot create subagents.",
    ...(i.hubDir ? [`Test/typecheck/lint output over ~60 lines: save it to a temp file inside ${i.projetoPath} and run \`node ${i.hubDir}/scripts/local.ts compact-test-log <file>\`; read only its stdout (failures are always kept).`] : []),
  ].join("\n");
}
