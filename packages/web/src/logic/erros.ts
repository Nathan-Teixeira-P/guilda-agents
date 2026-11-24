/** Action failures (approve, adjust, resume, stop) as clear Portuguese messages. Never throws. */
export function erroDeAcao(r: { error: string; status: number }): string {
  if (r.status === 0) return "Sem contato com o servidor. Nada foi alterado; tente de novo em instantes.";
  if (r.status === 409) {
    return /approval gate/i.test(r.error)
      ? "O selo não foi reconhecido; a execução não começou. Tente selar de novo."
      : "A missão mudou de estágio e esta ação não vale mais. Atualize a tela para ver o estado atual.";
  }
  if (r.status === 404) return "Missão não encontrada.";
  if (r.status === 400) return `Pedido recusado: ${r.error}`;
  return `Não deu certo: ${r.error}`;
}
