import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { Item } from "../../../server/src/transcript.ts";

/** Each role's conversation, by agent type ("main" is the Regente); polled while the mission runs. */
export function useConversas(id: string, vivo: boolean): Record<string, Item[]> {
  const [por, setPor] = useState<Record<string, Item[]>>({});
  useEffect(() => {
    let fim = false, t: ReturnType<typeof setTimeout>;
    const ler = async () => {
      const r = await api.terminal(id);
      if (fim) return;
      if (r.ok) setPor(Object.fromEntries(r.data.conversas.map((c) => [c.tipo, c.itens])));
      if (vivo) t = setTimeout(() => void ler(), 2500);
    };
    void ler();
    return () => { fim = true; clearTimeout(t); };
  }, [id, vivo]);
  return por;
}

const MARCA: Record<Item["t"], string> = { pedido: "❯ ", fala: "", acao: "● ", saida: "⎿ ", erro: "⎿ " };

/** A read-only terminal: newest at the bottom, sticks there. `linhas` is the fallback when there is no transcript. */
export function Terminal({ itens, linhas, nome }: { itens?: Item[] | undefined; linhas: string[]; nome: string }) {
  const tudo = itens?.length ? itens : linhas.map((texto): Item => ({ t: "acao", texto, em: "" }));
  return (
    <ol tabIndex={0} className="term" aria-label={`Terminal de ${nome}`}>
      {tudo.map((i, k) => <li key={k} className={`term-${i.t}`}>{itens?.length ? MARCA[i.t] : ""}{i.texto}</li>).reverse()}
      {tudo.length === 0 && <li className="muted">sem ações recentes</li>}
    </ol>
  );
}
