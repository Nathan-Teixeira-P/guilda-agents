import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const GATE_FILE = "approved";

// The seal is a JSON file `{"approved": true, ...}`; extra fields are tolerated.
const Seal = z.looseObject({ approved: z.literal(true) });

/** Fail-closed: true only if `<dir>/approved` exists and holds a valid seal. */
export function isApproved(dir: string): boolean {
  try {
    const raw = readFileSync(join(dir, GATE_FILE), "utf8");
    return Seal.safeParse(JSON.parse(raw)).success;
  } catch {
    return false; // missing, unreadable (incl. directory), empty or malformed
  }
}
