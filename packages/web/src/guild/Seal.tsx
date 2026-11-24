const SRC = `${import.meta.env.BASE_URL}seal-ntp.png`;

/** The guild seal (assets/seal-ntp.png). `carimbando` plays the stamp once; `rachado` is the refused gate: the same image cut in two shifted halves (CSS only). Decorative: the text next to it carries the meaning. */
export function Seal({ tamanho = 64, carimbando = false, rachado = false }: { tamanho?: number; carimbando?: boolean; rachado?: boolean }) {
  const img = (cls: string) => <img className={cls} src={SRC} alt="" width={tamanho} height={Math.round(tamanho * 1.05)} draggable={false} />;
  return (
    <span className={`seal${carimbando ? " seal-carimbo" : ""}${rachado ? " seal-rachado" : ""}`} style={{ width: tamanho, height: Math.round(tamanho * 1.05) }} aria-hidden="true">
      {carimbando && <span className="seal-onda" />}
      {rachado ? <>{img("seal-a")}{img("seal-b")}</> : img("seal-img")}
    </span>
  );
}
