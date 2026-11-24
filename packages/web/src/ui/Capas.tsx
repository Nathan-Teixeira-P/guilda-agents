import { useState } from "react";
import { capaUrl } from "../api.ts";

export interface ItemCapa { slug: string; tema: string }

/** One cover: PNG preview in the 1200x627 aspect. A missing PNG (never made, or render failed) shows a plain note, not a broken image. */
function Capa({ slug, tema }: ItemCapa) {
  const [falhou, setFalhou] = useState(false);
  return (
    <figure className="rd-capa">
      {falhou
        ? <div className="rd-capa-img rd-capa-falta">Sem capa em PNG para este artigo.</div>
        : <img className="rd-capa-img" src={capaUrl(slug)} alt={`Capa do artigo: ${tema}`} loading="lazy" width={1200} height={627} onError={() => setFalhou(true)} />}
      <figcaption>
        <span className="rd-capa-tema">{tema}</span>
        {!falhou && <a className="btn chico" href={capaUrl(slug)} download={`capa-${slug}.png`}>Baixar capa</a>}
      </figcaption>
    </figure>
  );
}

/** Gallery of covers. Download is the only way out: nothing is published or sent from here. */
export function Capas({ itens, titulo = "Capas" }: { itens: ItemCapa[]; titulo?: string }) {
  if (itens.length === 0) return null;
  return (
    <section aria-label={titulo} className="rd-capas">
      {itens.map((i) => <Capa key={i.slug} {...i} />)}
    </section>
  );
}
