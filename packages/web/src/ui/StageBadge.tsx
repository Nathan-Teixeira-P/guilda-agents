import { STAGE_LABEL, type Stage } from "../logic/stages.ts";

/** Stage as text (guild label plus technical term): never color alone. */
export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`pill estagio s-${stage}`} title={STAGE_LABEL[stage].tecnico}>{STAGE_LABEL[stage].rotulo}</span>;
}
