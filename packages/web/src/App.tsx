import { useRoute } from "./router.ts";
import { Shell } from "./Shell.tsx";
import { useLive } from "./store.ts";
import { useNotificacoes } from "./notif.ts";
import { Notificacoes } from "./screens/Notificacoes.tsx";
import { Afiliados } from "./screens/Afiliados.tsx";
import { Arsenal } from "./screens/Arsenal.tsx";
import { EscritorioTela } from "./screens/Escritorio.tsx";
import { Guilda } from "./screens/Guilda.tsx";
import { Orquestra } from "./screens/Orquestra.tsx";
import { Missao } from "./screens/Missao.tsx";
import { Nova } from "./screens/Nova.tsx";
import { Projetos } from "./screens/Projetos.tsx";
import { Redacao } from "./screens/Redacao.tsx";
import { slugDaRota } from "./logic/redacao.ts";
import { Quadro } from "./screens/Quadro.tsx";
import { Salao } from "./screens/Salao.tsx";

export function App() {
  const route = useRoute();
  const live = useLive();
  const notif = useNotificacoes();
  const pendentes = live.missions.filter((m) => m.stage === "aguardando-aprovacao" || m.stage === "pausada").length;

  let tela;
  const mi = /^\/missao\/([^/]+)(?:\/(guerra|vivo))?$/.exec(route.path);
  if (route.path === "/") tela = <Salao live={live} />;
  else if (route.path === "/escritorio") tela = <EscritorioTela live={live} />;
  else if (route.path === "/quadro") tela = <Quadro live={live} />;
  else if (route.path === "/guilda") tela = <Guilda live={live} />;
  else if (route.path === "/orquestra" || route.path.startsWith("/orquestra/")) tela = <Orquestra live={live} {...(route.path.length > 11 ? { id: decodeURIComponent(route.path.slice(11)) } : {})} />;
  else if (route.path === "/arsenal") tela = <Arsenal live={live} />;
  else if (mi) tela = <Missao key={mi[1]} id={decodeURIComponent(mi[1]!)} {...(mi[2] ? { forcada: mi[2] as "guerra" | "vivo" } : {})} live={live} />;
  else if (route.path === "/nova") tela = <Nova live={live} route={route} />;
  else if (route.path === "/afiliados") tela = <Afiliados live={live} />;
  else if (route.path === "/redacao" || slugDaRota(route.path)) tela = <Redacao live={live} {...(slugDaRota(route.path) ? { slug: decodeURIComponent(slugDaRota(route.path)!) } : {})} />;
  else if (route.path === "/notificacoes") tela = <Notificacoes notif={notif} />;
  else if (route.path === "/projetos") tela = <Projetos live={live} />;
  else tela = (
    <div className="vazio">
      <h1>Tela não encontrada</h1>
      <p className="muted">Esta tela ainda não existe nesta versão.</p>
      <a className="btn" href="#/">Ir para o Salão</a>
    </div>
  );
  return <Shell route={route} live={live} notif={notif} pendentes={pendentes}>{tela}</Shell>;
}
