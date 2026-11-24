import { lerMovimento, lerTema, movimentoReduzido, type Movimento, type Tema } from "./logic/tema.ts";

// localStorage can throw (private mode, blocked storage): every access is guarded and the preference then lasts only for the session.
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* session only */ } };

export const temaAtual = (): Tema => lerTema(document.documentElement.dataset["tema"]);
export const movimentoAtual = (): Movimento => lerMovimento(document.documentElement.dataset["motion"]);
export const reduzido = () => movimentoReduzido(movimentoAtual() === "off" ? "off" : "on", window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export function aplicarTema(t: Tema, salvar = true) { document.documentElement.dataset["tema"] = t; if (salvar) gravar("tema", t); }
export function aplicarMovimento(m: Movimento, salvar = true) { document.documentElement.dataset["motion"] = m; if (salvar) gravar("motion", m); window.dispatchEvent(new Event("motion-change")); }

const SOM = "notif-som";
let audio: AudioContext | undefined;
export const somLigado = () => ler(SOM) === "1";
/** Soft beep: the AudioContext is only created inside the click that turns the sound on (autoplay rules), default OFF. */
export function definirSom(on: boolean) {
  gravar(SOM, on ? "1" : "0");
  if (on) { try { audio ??= new AudioContext(); void audio.resume(); tocarBip(); } catch { /* no WebAudio: stays silent */ } }
}
export function tocarBip() {
  try {
    if (!audio || audio.state !== "running" || !somLigado()) return;
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.frequency.value = 660; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.3);
  } catch { /* ignore */ }
}
/** Read-state fallback when the server cannot be reached. */
export const lerLidasLocais = () => ler("notif-lidas");
export const gravarLidasLocais = (ids: readonly string[]) => gravar("notif-lidas", JSON.stringify(ids));

/** Called once before the first render so there is no flash of the wrong theme. */
export function iniciarPrefs() {
  aplicarTema(lerTema(ler("tema")), false);
  aplicarMovimento(lerMovimento(ler("motion")), false);
}
