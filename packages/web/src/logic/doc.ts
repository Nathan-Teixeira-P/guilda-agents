export type LinhaDoc = { tipo: "h1" | "h2" | "h3" | "li" | "p" | "vazia" | "codigo"; texto: string };

/** Hand-made highlighting for the reader: headings, list items and fences. No markdown library, no HTML: the text stays text. */
export function linhasDoc(text: string): LinhaDoc[] {
  const out: LinhaDoc[] = [];
  let fence = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) { fence = !fence; out.push({ tipo: "codigo", texto: raw }); continue; }
    if (fence) { out.push({ tipo: "codigo", texto: raw }); continue; }
    if (raw.trim() === "") { out.push({ tipo: "vazia", texto: "" }); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (h) { out.push({ tipo: `h${Math.min(h[1]!.length, 3)}` as "h1" | "h2" | "h3", texto: h[2]!.trim() }); continue; }
    const li = /^\s*[-*]\s+(.*)$/.exec(raw);
    out.push(li ? { tipo: "li", texto: li[1]! } : { tipo: "p", texto: raw });
  }
  return out;
}

/** Only http(s) links become anchors: no javascript:, data:, file: or relative targets. */
export function linkSeguro(url: string): string | undefined {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch { return undefined; }
}

export type Trecho = { texto: string; href?: string };

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)|https?:\/\/[^\s<>()\[\]]+/g;

/** Splits one line into text and links (`[txt](url)` and bare URLs). An unsafe target stays plain text. */
export function trechos(linha: string): Trecho[] {
  const out: Trecho[] = [];
  let i = 0;
  const push = (t: Trecho) => { if (t.texto) out.push(t); };
  for (const m of linha.matchAll(LINK)) {
    push({ texto: linha.slice(i, m.index) });
    if (m[1] !== undefined) {
      const href = linkSeguro(m[2]!);
      push(href ? { texto: m[1], href } : { texto: m[0] });
      i = m.index + m[0].length;
    } else {
      const cru = m[0].replace(/[.,;:!?'"]+$/, ""); // trailing punctuation belongs to the sentence
      const href = linkSeguro(cru);
      push(href ? { texto: cru, href } : { texto: cru });
      push({ texto: m[0].slice(cru.length) });
      i = m.index + m[0].length;
    }
  }
  push({ texto: linha.slice(i) });
  return out;
}
