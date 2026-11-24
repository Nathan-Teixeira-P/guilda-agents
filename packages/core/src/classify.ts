/** Deterministic size classifier for the short path. Pure. */
export const MAX_FILES_TRIVIAL = 1;
export const MAX_FILES_MEDIA = 5;

export type Size = "trivial" | "media" | "grande";
export interface Demand {
  estimatedFiles: number;
  hasUi: boolean;
  ambiguous: boolean;
}

export function classify(d: Demand): Size {
  if (d.estimatedFiles > MAX_FILES_MEDIA || (d.hasUi && d.ambiguous)) return "grande";
  if (d.estimatedFiles <= MAX_FILES_TRIVIAL && !d.hasUi && !d.ambiguous) return "trivial";
  return "media";
}
