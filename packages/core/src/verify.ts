/** Cheap output verifiers for local-model results. Each returns true when the output is acceptable. */
export type Verifier = (out: string) => boolean;

export const formatMatches = (re: RegExp): Verifier => (out) => re.test(out);
export const maxSize = (chars: number): Verifier => (out) => out.trim().length > 0 && out.length <= chars;
export const requiredTerms = (terms: readonly string[]): Verifier => (out) => terms.every((t) => out.includes(t));

/** Every line that looks like a path (contains "/" and a file extension) must exist; `exists` is injectable. */
export const citedPathsExist =
  (exists: (p: string) => boolean): Verifier =>
  (out) =>
    out
      .split("\n")
      .map((l) => l.trim().replace(/^[-*]\s+/, ""))
      .filter((l) => /^[\w./@-]+\/[\w.-]+\.\w+$/.test(l))
      .every(exists);

export const allOf = (...vs: Verifier[]): Verifier => (out) => vs.every((v) => v(out));

const KEY = /FAIL|✗|✖|×|Error:|AssertionError|expected|[\w./@-]+\.\w+:\d+|exit code|exited with|\bTests?\b.*\b(passed|failed)\b|Test Files/i;
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const NEEDLE = 120;

/** Lines of a raw test log that a compact version must never lose (failures, errors, file:line refs, exit codes, summary counts). */
export const keyLines = (raw: string): string[] => [...new Set(raw.split("\n").map(collapse).filter((l) => KEY.test(l)).map((l) => l.slice(0, NEEDLE)))];

/** Output is valid only if every key line found in the INPUT is still there. No key lines found => cannot verify => reject. */
export const inputDerivedTerms = (input: string): Verifier => {
  const keys = keyLines(input);
  return (out) => {
    const o = collapse(out);
    return keys.length > 0 && keys.every((k) => o.includes(k));
  };
};

/** Deterministic compaction (no model): key lines, one line of context around each when few, and the last 5 lines (summary). */
export function compactLog(raw: string): string {
  const lines = raw.split("\n").map(collapse);
  const hits = lines.flatMap((l, i) => (KEY.test(l) ? [i] : []));
  const keep = new Set<number>(hits);
  if (hits.length <= 40) for (const i of hits) { keep.add(i - 1); keep.add(i + 1); }
  const tail = lines.map((l, i) => [l, i] as const).filter(([l]) => l !== "").slice(-5);
  for (const [, i] of tail) keep.add(i);
  const out: string[] = [];
  let prev = -2;
  for (const i of [...keep].filter((i) => i >= 0 && i < lines.length && lines[i] !== "").sort((a, b) => a - b)) {
    if (i > prev + 1 && out.length) out.push("...");
    out.push(lines[i]!.slice(0, 300));
    prev = i;
  }
  return out.join("\n");
}

/** Short logs go to Claude as they are: nothing worth compacting. */
export const isShortLog = (raw: string): boolean => raw.length < 2000 && raw.split("\n").length < 60;
