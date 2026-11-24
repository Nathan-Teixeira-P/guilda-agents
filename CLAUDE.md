# Guilda Agents hub

## Token standard
- Reply in at most 10 lines: STATUS / RESUMO / ARQUIVOS / PRÓXIMO. Details go to files.
- Pass file paths, not contents. Read surgically (grep, line ranges), never whole trees.
- One agent, one task.
- Per-project agent notes: `<project>/.claude/agent-notes/<agent>.md` (non-derivable facts only, a few KB).
- Exception: `frontend-architect` and `frontend-builder` may exceed 10 lines when design output requires it.

## Safety
- Never commit, push, publish or send anything unless explicitly asked.
- Agents act in the target project and follow its `CLAUDE.md` and `.claude/`.

## Plan usage
- Claude Pro account only (no API key). Usage windows (5h, weekly) are the budget; see `routing.md`.
