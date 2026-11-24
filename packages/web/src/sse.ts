export interface SseHandlers {
  onEvent: (event: string, data: unknown) => void;
  onState: (s: { up: boolean; retryInSec?: number }) => void;
}

const EVENTS = ["mission", "progress", "file", "warning", "usage", "uso-auto", "artigo", "local", "notificacao", "notificacao-sync"] as const;
const BACKOFF = [1, 2, 4, 8, 16, 30]; // seconds

/**
 * EventSource with our own reconnection (1, 2, 4 ... 30 s) so the UI can show the countdown.
 * Returns { retryNow, close }. The caller refetches state on every `up: true` (events missed while away).
 */
export function connect(h: SseHandlers, cliente?: string) {
  let es: EventSource | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let closed = false;

  const open = () => {
    if (closed) return;
    es = new EventSource(cliente ? `/events?c=${encodeURIComponent(cliente)}` : "/events");
    es.onopen = () => { attempt = 0; h.onState({ up: true }); };
    for (const name of EVENTS) {
      es.addEventListener(name, (e) => {
        try { h.onEvent(name, JSON.parse((e as MessageEvent<string>).data)); } catch { /* malformed frame: ignore */ }
      });
    }
    es.onerror = () => {
      es?.close();
      es = undefined;
      const sec = BACKOFF[Math.min(attempt++, BACKOFF.length - 1)]!;
      h.onState({ up: false, retryInSec: sec });
      timer = setTimeout(open, sec * 1000);
    };
  };
  open();

  return {
    retryNow() { clearTimeout(timer); es?.close(); open(); },
    close() { closed = true; clearTimeout(timer); es?.close(); },
  };
}
