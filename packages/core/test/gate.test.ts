import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { isApproved } from "../src/gate.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gate-"));
});
const seal = (s: string) => writeFileSync(join(dir, "approved"), s);

describe("isApproved", () => {
  it("true for a valid seal", () => {
    seal('{"approved":true}');
    expect(isApproved(dir)).toBe(true);
  });
  it("tolerates extra fields", () => {
    seal('{"approved":true,"by":"me","extra":1}');
    expect(isApproved(dir)).toBe(true);
  });
  it("false when file is missing", () => expect(isApproved(dir)).toBe(false));
  it("false when dir is missing", () => expect(isApproved(join(dir, "nope"))).toBe(false));
  it("false when empty", () => {
    seal("");
    expect(isApproved(dir)).toBe(false);
  });
  it("false when malformed", () => {
    seal("{approved:");
    expect(isApproved(dir)).toBe(false);
  });
  it.each(['{"approved":false}', '{"approved":"true"}', "{}", "null", "true", "[]"])(
    "false for ambiguous content %s",
    (c) => {
      seal(c);
      expect(isApproved(dir)).toBe(false);
    },
  );
  it("false when unreadable (approved is a directory)", () => {
    mkdirSync(join(dir, "approved"));
    expect(isApproved(dir)).toBe(false);
  });
});
