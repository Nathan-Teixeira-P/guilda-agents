import { useId } from "react";
import { corDe, membro } from "../roster.ts";

export type EstadoAvatar = "ativo" | "ocioso" | "concluido" | "falhou";

// One insignia shape per group (12x12 box). Color is never the only cue: each group has its own form.
export const INSIGNIA: Record<string, string> = {
  direcao: "M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5Z", // compass rose
  documentos: "M10 1Q3 1 2 8L1 11L2.5 10Q9 9 10 1Z", // quill
  codigo: "M1 1H8V4H6.5V12H4V4H1Z", // hammer
  pesquisa: "M0 3Q3 2 6 4Q9 2 12 3V10Q9 9 6 11Q3 9 0 10Z", // open book
  frontend: "M6 0L7 3L11 12H9.4L6 5L2.6 12H1L5 3Z", // dividers
  seguranca: "M6 0a3 3 0 1 1 0 6a3 3 0 1 1 0-6ZM5 6h2v6H5ZM7 9h2v1.5H7Z", // key
  operacao: "M4 0H8V1.5H9.5V10Q9.5 12 6 12Q2.5 12 2.5 10V1.5H4Z", // lantern
};

const EMBLEMA = `${import.meta.env.BASE_URL}emblem-ntp.png`;

interface Props { agente: string; vista?: "frente" | "costas"; tamanho?: number; estado?: EstadoAvatar; oculto?: boolean; x?: number; y?: number }

/** Hooded guild member, one parametric SVG. Front: hood, insignia and group band. Back: closed hood and the NTP emblem as a low-contrast embroidery (alpha mask of the PNG; a plain diamond below 24 px, where the PNG would be noise). */
export function Avatar({ agente, vista = "frente", tamanho = 24, estado, oculto = false, x, y }: Props) {
  const m = membro(agente);
  const id = useId();
  const grande = tamanho >= 64; // fold lines, hood rim and clasp: noise below this size
  const cor = estado === "falhou" ? "var(--sangue)" : corDe(agente);
  const rotulo = `${m.codinome}, grupo ${m.grupo.nome}${estado === "falhou" ? ", falhou" : estado === "concluido" ? ", terminou" : estado === "ativo" ? ", em campo" : ""}`;
  const a11y = oculto ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": rotulo };
  return (
    <svg className={`av${estado ? ` av-${estado}` : ""}`} viewBox="0 0 64 64" width={tamanho} height={tamanho} focusable="false" {...(x !== undefined ? { x } : {})} {...(y !== undefined ? { y } : {})} {...a11y}>
      {!oculto && <title>{m.grupo.nome}</title>}
      {estado === "ativo" && <ellipse cx="32" cy="62" rx="18" ry="2.5" fill="var(--bronze)" />}
      <path d="M17 61L23 29Q32 21 41 29L47 61Q32 64 17 61Z" fill="var(--manto)" stroke="#000" strokeOpacity=".5" />
      <path d="M21 52L44 46L45.5 51L20 57Z" fill={cor} />
      {grande && <path d="M23 32Q20 46 17 61M41 32Q44 46 47 61M32 36V58M27 40Q26 50 24 59M37 40Q38 50 40 59" fill="none" stroke="#000" strokeOpacity=".28" strokeWidth=".8" />}
      <path d="M19.5 31Q19 8 32 3Q45 8 44.5 31Q32 36 19.5 31Z" fill="var(--manto)" stroke="#000" strokeOpacity=".5" />
      {grande && <path d="M23 27Q22 11 32 6.5" fill="none" stroke="var(--aco)" strokeOpacity=".35" strokeWidth="1" strokeLinecap="round" />}
      {vista === "frente" ? (
        <>
          <path d="M25.5 29Q25 15 32 12Q39 15 38.5 29Q32 32 25.5 29Z" fill="#0c0809" />
          {estado === "ativo" && <><circle cx="29.5" cy="22" r="1.4" fill="#d4b27a" /><circle cx="34.5" cy="22" r="1.4" fill="#d4b27a" /></>}
          {grande && <path d="M26 24Q32 28 38 24" fill="none" stroke="#000" strokeOpacity=".5" strokeWidth="1" />}
          {grande && <circle cx="32" cy="31.5" r="1.5" fill="var(--bronze)" stroke="#000" strokeOpacity=".5" strokeWidth=".4" />}
          {INSIGNIA[m.grupo.id] && <path transform="translate(26 33)" d={INSIGNIA[m.grupo.id]} fill={cor} />}
        </>
      ) : tamanho < 24 ? (
        <path d="M32 33L37 41L32 49L27 41Z" fill="color-mix(in srgb, var(--manto) 70%, var(--aco))" />
      ) : (
        <>
          <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="22" y="32" width="20" height="24" style={{ maskType: "alpha" }}><image href={EMBLEMA} x="22" y="32" width="20" height="24.6" preserveAspectRatio="xMidYMid meet" /></mask>
          <rect x="22" y="32" width="20" height="24" fill="color-mix(in srgb, var(--manto) 70%, var(--aco))" mask={`url(#${id}m)`} />
        </>
      )}
      {estado === "falhou" && <path d="M54 6h4v12h-4ZM54 21h4v4h-4Z" fill="var(--sangue)" stroke="#fff" strokeWidth="1" />}
      {estado === "concluido" && <circle cx="55" cy="9" r="6" fill="var(--verdete)" stroke="#0c0809" />}
    </svg>
  );
}

export function Membro({ agente, tamanho, estado }: { agente: string; tamanho?: number; estado?: EstadoAvatar }) {
  const m = membro(agente);
  return <span className="membro"><Avatar oculto agente={agente} {...(tamanho ? { tamanho } : {})} {...(estado ? { estado } : {})} /> <span>{m.codinome}</span></span>;
}
