export type ResumoLike = { feito: string[]; pendente: string[]; acaoUsuario: string[] };

/** True when the wrap-up has nothing in any of its three lists. */
export function resumoVazio(r: ResumoLike): boolean {
  return r.feito.length === 0 && r.pendente.length === 0 && r.acaoUsuario.length === 0;
}
