import { describe, expect, it } from "vitest";
import { classify, MAX_FILES_TRIVIAL, MAX_FILES_MEDIA } from "../src/classify.js";

const base = { estimatedFiles: 1, hasUi: false, ambiguous: false };

describe("classify", () => {
  it("one-line fix is trivial", () => {
    expect(classify(base)).toBe("trivial");
    expect(classify({ ...base, estimatedFiles: MAX_FILES_TRIVIAL })).toBe("trivial");
  });
  it("UI or ambiguity or more files is never trivial", () => {
    expect(classify({ ...base, hasUi: true })).toBe("media");
    expect(classify({ ...base, ambiguous: true })).toBe("media");
    expect(classify({ ...base, estimatedFiles: MAX_FILES_TRIVIAL + 1 })).toBe("media");
    expect(classify({ ...base, estimatedFiles: MAX_FILES_MEDIA })).toBe("media");
  });
  it("many files, or UI plus ambiguity, is grande", () => {
    expect(classify({ ...base, estimatedFiles: MAX_FILES_MEDIA + 1 })).toBe("grande");
    expect(classify({ ...base, hasUi: true, ambiguous: true })).toBe("grande");
  });
  it("is deterministic", () => {
    const i = { estimatedFiles: 4, hasUi: true, ambiguous: false };
    expect(classify(i)).toBe(classify({ ...i }));
  });
});
