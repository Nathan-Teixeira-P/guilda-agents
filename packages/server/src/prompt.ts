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
    `- Only write files under ${out}. Use ${out}/handoff/briefing.md (the intake briefing, when the demand is a ClickUp link), ${out}/handoff/map.md, ${out}/handoff/plan.md, ${out}/prd/<feature>.prd.md, ${out}/specs/NNN-<name>.spec.md and ${out}/specs/INDEX.md.`,
    "- Pass file paths to agents, never file contents. Tell each agent its output path.",
    "- Subagents cannot create subagents: you call them yourself, one at a time, in this order: explorer, planner, prd-writer, spec-writer, spec-checker. Explorer cannot write files: save its map to the map path yourself.",
    "- First classify the demand. LEAN (docs/README, config, one-file or small change, no UI, no ambiguity): call only explorer (haiku) and write one short plan to the plan path; no planner, PRD, specs or spec-checker. FULL (several modules, UI, ambiguity): the whole chain above, with planner on sonnet unless the demand is clearly large and risky (then pass model opus to planner).",
    "- Never commit or push. Do not edit the project. If spec-checker fails, send the problems back to spec-writer once.",
  ];
  return lines.join("\n");
}

export interface Fase2Input {
  specs: string[]; // absolute spec paths
  projetoPath: string;
  comentario?: string; // user comment when resuming a paused run
  retomada?: boolean; // resuming: audit the project before continuing
  hubDir?: string; // absolute hub folder: tells agents where the log compactor lives (spec 036)
}

export function promptFase2(i: Fase2Input): string {
  return [
    ...(i.specs.length
      ? [`Approved. Phase 2 (execution) in ${i.projetoPath}. Implement these specs in order, one at a time:`, ...i.specs.map((s) => `- ${s}`)]
      : [`Approved. Phase 2 (execution) in ${i.projetoPath}. There are no specs: implement the approved plan at ${i.projetoPath}/.claude/handoff/plan.md.`]),
    ...(i.retomada ? ["", "RESUMING. Before implementing anything, audit the current state: read the specs/plan, run `git status`, `git diff --stat` and `git log -5` in the project, read the changed files, and run the test commands. For each spec decide: done, partial, missing, or needs change (something done is wrong, outdated, or lost). Report that audit in 10 lines max, then continue only with what is partial, missing or needs change. Do not redo what is done and correct."] : []),
    ...(i.comentario ? ["", "The run was paused; the user resumed it with this comment:", i.comentario, ""] : []),
    "Never commit or push. Pass file paths to agents, never contents. Subagents cannot create subagents.",
    ...(i.hubDir ? [`Test/typecheck/lint output over ~60 lines: save it to a temp file inside ${i.projetoPath} and run \`node ${i.hubDir}/scripts/local.ts compact-test-log <file>\`; read only its stdout (failures are always kept).`] : []),
  ].join("\n");
}
