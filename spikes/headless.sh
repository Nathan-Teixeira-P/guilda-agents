#!/usr/bin/env bash
# Spike 001: confirma os flags do Claude Code headless. Custo esperado: centavos.
# Uso: bash spikes/headless.sh   (não escreve em ~/.claude; usa projeto temporário)
set -u
P=$(mktemp -d); OUT=$P/out; mkdir -p "$OUT" "$P/proj/.claude/agents" "$P/proj/docs"; cd "$P/proj"
git init -q; echo hello > a.txt
cat > .claude/agents/spike.md <<'A'
---
name: spike
description: Agente de teste do spike
tools: Read, Write, Edit, Bash, Agent
model: haiku
---
Voce e o agente SPIKE. Responda sempre muito curto. Comece a primeira resposta com SPIKE-OK.
A
cat > .claude/agents/helper.md <<'A'
---
name: helper
description: Subagente de teste; responde HELPER-OK
tools: Read
model: haiku
---
Responda apenas: HELPER-OK
A
SID=$(python3 -c 'import uuid;print(uuid.uuid4())')
B=(--output-format stream-json --verbose --max-budget-usd 0.10)
run() { local n=$1 p=$2; shift 2; claude -p "$p" --agent spike "${B[@]}" "$@" </dev/null >"$OUT/$n.jsonl" 2>"$OUT/$n.err"; echo $? >"$OUT/$n.exit"; }
res() { jq -r 'select(.type=="result")|"\(.subtype) cost=\(.total_cost_usd) denials=\(.permission_denials|length) \(.result//"" | .[0:70])"' "$OUT/$1.jsonl" | tail -1; }

run a "diga oi" --session-id "$SID"
echo "(a) --agent (projeto): $(grep -c SPIKE-OK "$OUT/a.jsonl") ocorrencia(s) de SPIKE-OK  [~/.claude/agents NAO testado]"
echo "(b) rate_limit_event: $(jq -c 'select(.type=="rate_limit_event")|.rate_limit_info.unifiedWindows' "$OUT/a.jsonl")"
run b "Use a ferramenta Agent para chamar o subagente helper com o prompt ping e diga a resposta." 
echo "(b) eventos de subagente: $(jq -r 'select(.type=="system" and (.subtype|startswith("task_")))|.subtype' "$OUT/b.jsonl" | sort -u | tr '\n' ' ')"
claude -p "qual foi minha primeira pergunta?" --resume "$SID" "${B[@]}" </dev/null >"$OUT/c.jsonl" 2>&1
echo "(c) resume: $(jq -r 'select(.type=="result")|.result' "$OUT/c.jsonl" | head -c 80)"
run d "escreva banana 50 vezes" --max-budget-usd 0.0001
echo "(d) orcamento: exit=$(cat "$OUT/d.exit") $(res d)"
run e "Write out1.txt com x; Bash: echo y > out2.txt; Edit a.txt hello->bye" --permission-mode dontAsk --allowedTools Read
echo "(e) dontAsk+Read: exit=$(cat "$OUT/e.exit") $(res e) | arquivos criados: $(ls out* 2>/dev/null | tr '\n' ' ')a.txt=$(cat a.txt)"
# (f) acceptEdits/dontAsk NAO escrevem em .claude/ (caminho sensivel); contorno: bypassPermissions + hook + sem Bash
cat > "$P/guard.mjs" <<'G'
import path from 'node:path';
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  const e=JSON.parse(s), f=e.tool_input?.file_path;
  if (f && path.resolve(e.cwd,f).startsWith(path.resolve(e.cwd,'.claude')+path.sep)) process.exit(0);
  console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'fora de .claude/'}}));
});
G
CFG="{\"hooks\":{\"PreToolUse\":[{\"matcher\":\"Write|Edit\",\"hooks\":[{\"type\":\"command\",\"command\":\"node $P/guard.mjs\"}]}]}}"
mkdir -p .claude/specs
run f1 "Write .claude/specs/n.md com ok; Write out3.txt com x" --permission-mode acceptEdits --allowedTools "Edit(.claude/**)"
echo "(f) acceptEdits: n.md=$(test -f .claude/specs/n.md && echo criado || echo BLOQUEADO) out3=$(test -f out3.txt && echo criado || echo bloqueado)"
rm -f out3.txt
run f2 "Write .claude/specs/n.md com ok; Write out3.txt com x; Edit a.txt hello->bye" --permission-mode bypassPermissions --disallowedTools Bash --settings "$CFG"
echo "(f) bypass+hook+sem Bash: n.md=$(test -f .claude/specs/n.md && echo criado || echo bloqueado) out3=$(test -f out3.txt && echo criado || echo BLOQUEADO) a.txt=$(cat a.txt)"
echo "saidas em $OUT"
