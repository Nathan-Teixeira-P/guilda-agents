import { describe, expect, it } from "vitest";
import { conferirSpecs } from "../src/specs.ts";

const spec = (n: number, deps = "", extra = "") => ({
  name: `${n}-x.spec.md`,
  text: `---\ntitle: t\nnumber: ${n}\npriority: high\ntags: [a]\ndependencies: [${deps}]\nrelated_prd: p\nstatus: pending\ncreated: 2026-01-01\n---\n## Overview\n## Related PRD\n## Prerequisites\n## Dependencies\n## Implementation Tasks\n${extra}\n## Acceptance Criteria\n## Verification\n## Rollback Plan\n`,
});
const index = (...s: { name: string }[]) => ({ name: "INDEX.md", text: s.map((x) => x.name).join("\n") });

describe("conferirSpecs", () => {
  it("accepts a good set, including a dependency on an older project spec", () => {
    const a = spec(10, "9-old.spec.md"), b = spec(11, "10-x.spec.md");
    expect(conferirSpecs([a, b, index(a, b)])).toEqual([]);
    expect(conferirSpecs([])).toEqual([]);
  });
  it("reports gaps, missing parts, bad deps, cycles and too many files", () => {
    const files = Array.from({ length: 6 }, (_, i) => `- [ ] \`src/f${i}.ts\``).join("\n");
    const a = spec(1, "3", files), b = spec(3, "1, 8");
    const bad = { name: "4-y.spec.md", text: "no frontmatter" };
    const r = conferirSpecs([a, b, bad, index(a, b)]).join("\n");
    for (const s of ["pula de 1 para 3", "6 arquivos", "depende de 8", "ciclo", "4-y.spec.md: frontmatter sem", "4-y.spec.md: sem as seções", "4-y.spec.md: fora do INDEX"]) expect(r).toContain(s);
  });
});
