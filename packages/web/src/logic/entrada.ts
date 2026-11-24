// Mirrors classificarEntrada in packages/core/src/briefing.ts (not imported: core pulls zod into the bundle).
export function classificarEntrada(entrada: string): "clickup-url" | "texto" {
  const s = entrada.trim();
  if (/\s/.test(s)) return "texto";
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname === "app.clickup.com" && !u.username && !u.password && u.port === "" ? "clickup-url" : "texto";
  } catch { return "texto"; }
}

export function dicaEntrada(entrada: string): string {
  if (!entrada.trim()) return "Cole o link de uma tarefa do ClickUp ou descreva a demanda em texto.";
  return classificarEntrada(entrada) === "clickup-url"
    ? "Link do ClickUp detectado: o intake lê a tarefa (somente leitura). Sem o MCP do ClickUp instalado, cole o texto da tarefa."
    : "Texto livre: vai direto para o briefing.";
}
