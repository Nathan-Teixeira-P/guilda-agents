import { useEffect } from "react";
import type { Live } from "../store.ts";

/** Loads the history of these missions (again after a reconnect); live events keep arriving over SSE. */
export function useEventos(live: Live, ids: string[]) {
  const { carregarEventos, up } = live;
  const chave = ids.join(",");
  useEffect(() => { for (const id of chave ? chave.split(",") : []) void carregarEventos(id); }, [carregarEventos, chave, up]);
}
