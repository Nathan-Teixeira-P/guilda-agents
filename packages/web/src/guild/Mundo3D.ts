import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { anguloRitmo, arcoUso, contagem, ESCALA, paraMundo } from "../logic/cena3d.ts";
import { adiantado, efetivo, ritmo, type Uso } from "../logic/emblem.ts";
import { criarSim, MESA_CENTRAL, montarPlanta, type Atividade, type Recado, type Sala } from "../logic/escritorio.ts";
import { membro } from "../roster.ts";
import { INSIGNIA } from "./Avatar.tsx";

// Plain three.js renderer of the guild hall. It only draws: layout, waypoints and the walking state machine come from logic/escritorio.ts (criarSim).
// Plan (x, y) in the 800x480 viewbox -> world (x, z) through paraMundo; y is up.

const EMBLEMA = `${import.meta.env.BASE_URL}emblem-ntp.png`;
const FPS_MS = 1000 / 30;
const MURO_Z = -12.6; // back wall carrying the plan-usage gauge
const ELEV = (48 * Math.PI) / 180; // default camera elevation

export interface Estado { atividade: Record<string, Atividade>; selecionado: string | undefined; uso: Uso | undefined; local: string | undefined; aoVivo: boolean }
export interface Opcoes {
  host: HTMLElement;
  calmo: boolean;
  toque: boolean; // coarse pointer: no orbit, so the page keeps scrolling
  onClicar: (t: string) => void;
  onHover: (t: string | undefined) => void;
  onFalha: (motivo: string) => void;
  bolhas: () => ReadonlyMap<string, HTMLElement>;
}
export interface Mundo { atualizar: (e: Estado) => void; recado: (r: Recado) => void; setCalmo: (c: boolean) => void; pedirQuadro: () => void; dispose: () => void }

const css = (v: string) => { const m = /^var\((--[\w-]+)\)$/.exec(v); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]!).trim() || "#b08a5a" : v; };
const claroAgora = () => document.documentElement.dataset["tema"] === "claro";
const lerpAng = (a: number, b: number, k: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

export function criarMundo(o: Opcoes): Mundo {
  const planta = montarPlanta();
  const sim = criarSim(planta, Math.random, { maxPasseio: 5 });
  let calmo = o.calmo;
  let est: Estado = { atividade: {}, selecionado: undefined, uso: undefined, local: undefined, aoVivo: false };
  let morto = false;
  let raf = 0, ultimo = 0, visivel = true, pendente = false;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    if (!renderer.getContext()) throw new Error("sem contexto");
  } catch (e) {
    o.onFalha("WebGL não iniciou");
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;outline:none";
  canvas.setAttribute("aria-hidden", "true");
  o.host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  const lixo: { dispose: () => void }[] = [];
  const temas: ((claro: boolean) => void)[] = [];
  const G = <T extends THREE.BufferGeometry>(g: T) => { lixo.push(g); return g; };
  const Mt = <T extends THREE.Material>(m: T) => { lixo.push(m); return m; };
  const Tx = <T extends THREE.Texture>(t: T) => { lixo.push(t); return t; };
  /** Standard material that changes colour with the theme. */
  const std = (escuro: number | string, claro: number | string, op: THREE.MeshStandardMaterialParameters = {}) => {
    const m = Mt(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...op }));
    temas.push((c) => m.color.set(c ? claro : escuro));
    return m;
  };
  const basic = (cor: string, op: THREE.MeshBasicMaterialParameters = {}) => Mt(new THREE.MeshBasicMaterial({ color: cor, ...op }));

  const emblema = Tx(new THREE.TextureLoader().load(EMBLEMA, () => pedir()));
  emblema.colorSpace = THREE.SRGBColorSpace;
  emblema.anisotropy = 4;

  const tela = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return { c, x: c.getContext("2d")! }; };
  const ladrilho = (() => {
    const { c, x } = tela(128, 128);
    x.fillStyle = "#fff"; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = "rgba(60,40,30,.35)"; x.lineWidth = 3; x.strokeRect(0, 0, 128, 128);
    x.fillStyle = "rgba(60,40,30,.07)"; for (let i = 0; i < 40; i++) x.fillRect((i * 53) % 120, (i * 97) % 120, 6 + (i % 5), 5);
    const t = Tx(new THREE.CanvasTexture(c)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  })();
  const ladMat = (escuro: number, claro: number, rx: number, rz: number, tint?: THREE.Color) => {
    const t = ladrilho.clone(); t.repeat.set(rx, rz); t.needsUpdate = true; lixo.push(t);
    const m = Mt(new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    temas.push((c) => { m.color.set(c ? claro : escuro); if (tint) m.color.lerp(tint, c ? 0.22 : 0.1); });
    return m;
  };

  const caixa = (pai: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, sombra = true) => {
    const mesh = new THREE.Mesh(G(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z); mesh.castShadow = sombra; mesh.receiveShadow = true; pai.add(mesh); return mesh;
  };

  // ---- materials
  const pedra = std(0x5b4f48, 0xb9a88a);
  const pedraEsc = std(0x4a3f3a, 0xa39478);
  const madeira = std(0x4a3426, 0x8b6440);
  const bronze = std(0xb08a5a, 0x8a6232, { metalness: 0.5, roughness: 0.45 });
  const aco = std(0xa9adb3, 0x7a7e85, { metalness: 0.7, roughness: 0.35 });
  const manto = std(0x4b3c42, 0x5a4a4f);
  const vinho = std(0x5a1a1f, 0xb5776c);
  const pergaminho = std(0xebdfc4, 0xfbf5e4);
  const ouro = std(0xd4b27a, 0xb58a3a, { metalness: 0.6, roughness: 0.4 });
  const brasa = Mt(new THREE.MeshStandardMaterial({ color: 0xffa23a, emissive: 0xff7a1a, emissiveIntensity: 1.6 }));
  const chama = basic("#ffb347");
  const rosto = basic("#0c0809");

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  const sol = new THREE.DirectionalLight(0xffffff, 1);
  sol.position.set(-12, 26, 14);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  Object.assign(sol.shadow.camera, { left: -26, right: 26, top: 16, bottom: -16, near: 1, far: 70 });
  sol.shadow.bias = -0.0006; sol.shadow.normalBias = 0.03; sol.shadow.radius = 3;
  scene.add(hemi, sol, sol.target);
  const tochas: { luz: THREE.PointLight; chama: THREE.Mesh; i: number }[] = [];
  const luzes = { tocha: 30 };

  // ---- hall: base, back wall, corridor
  const mundo = new THREE.Group(); scene.add(mundo);
  const base = caixa(mundo, 41.5, 0.6, 25.5, std(0x1c1415, 0xcdbd9a), 0, -0.5, 0.2, false);
  const planoRetro = (r: { x: number; y: number; w: number; h: number }, y = 0.1) => ({ ...paraMundo(r.x + r.w / 2, r.y + r.h / 2), w: r.w * ESCALA, d: r.h * ESCALA, y });
  { const c = planoRetro(planta.corredor); caixa(mundo, c.w, 0.2, c.d, ladMat(0x4a3b35, 0xd8c9a6, c.w / 2, c.d / 2), c.x, -0.1, c.z, false); }
  { const t = paraMundo(16, 228); caixa(mundo, 768 * ESCALA, 0.04, 24 * ESCALA, vinho, 0, 0.02, t.z + 12 * ESCALA, false); }
  for (const yy of [228, 252]) caixa(mundo, 768 * ESCALA, 0.05, 0.07, ouro, 0, 0.03, paraMundo(0, yy).z, false);
  const muro = caixa(mundo, 42, 13, 0.8, ladMat(0x3b302c, 0xa89a7e, 21, 6.5), 0, 6, MURO_Z);
  for (const sx of [-1, 1]) { caixa(mundo, 1.4, 13.4, 1.6, pedraEsc, sx * 20.8, 6.2, MURO_Z + 0.4) }
  muro.receiveShadow = true;

  // ---- rooms
  const nomes: ((claro: boolean) => void)[] = [];
  const nomeSala = (txt: string) => {
    const { c, x } = tela(512, 96);
    const t = Tx(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    nomes.push((claro) => {
      x.clearRect(0, 0, 512, 96);
      x.font = "700 56px Georgia, serif"; x.fillStyle = claro ? "#4a2f0c" : "#d4b27a"; x.shadowColor = claro ? "rgba(255,255,255,.6)" : "#000"; x.shadowBlur = 6; x.textBaseline = "middle"; x.fillText(txt.toUpperCase(), 8, 50);
      t.needsUpdate = true;
    });
    return t;
  };
  const sala3d = (s: Sala, si: number) => {
    const g = new THREE.Group(); mundo.add(g);
    const c = planoRetro(s); const w = c.w, d = c.d;
    const z0 = c.z - d / 2, z1 = c.z + d / 2, x0 = c.x - w / 2, x1 = c.x + w / 2;
    const tint = new THREE.Color(css(s.cor));
    const lado = (planoX: number) => paraMundo(planoX, 0).x;
    caixa(g, w, 0.2, d, ladMat(0x3a2c2b, 0xf2e9d2, w / 2, d / 2, tint), c.x, -0.1, c.z, false);
    const rug = planoRetro({ x: s.x + 26, y: s.y + (s.agentes.length > 3 ? 98 : 112), w: s.w - 52, h: s.agentes.length > 3 ? 70 : 56 }, 0.03);
    const rugMat = std(0x4a1b20, 0xc89a8e); caixa(g, rug.w, 0.04, rug.d, rugMat, rug.x, 0.02, rug.z, false);
    caixa(g, rug.w, 0.05, 0.06, ouro, rug.x, 0.03, rug.z - rug.d / 2, false); caixa(g, rug.w, 0.05, 0.06, ouro, rug.x, 0.03, rug.z + rug.d / 2, false);
    // walls: tall at the back (north), low and cut away at the front and sides
    const doorX = lado(s.doorX), vao = 1.1;
    const parede = (xa: number, xb: number, z: number, h: number, e: number) => { if (xb - xa > 0.01) caixa(g, xb - xa, h, e, pedra, (xa + xb) / 2, h / 2, z); };
    const norte = s.porta === "cima", sul = !norte;
    if (norte) { parede(x0, doorX - vao, z0, 2.7, 0.4); parede(doorX + vao, x1, z0, 2.7, 0.4); } else parede(x0, x1, z0, 2.7, 0.4);
    if (sul) { parede(x0, doorX - vao, z1, 0.45, 0.3); parede(doorX + vao, x1, z1, 0.45, 0.3); } else parede(x0, x1, z1, 0.45, 0.3);
    caixa(g, 0.3, 0.9, d, pedra, x0, 0.45, c.z); caixa(g, 0.3, 0.9, d, pedra, x1, 0.45, c.z);
    for (const sx of [doorX - vao, doorX + vao]) caixa(g, 0.28, 0.7, 0.5, ouro, sx, 0.4, norte ? z0 : z1);
    const nm = new THREE.Mesh(G(new THREE.PlaneGeometry(8, 1.5)), Mt(new THREE.MeshBasicMaterial({ map: nomeSala(s.nome), transparent: true, depthWrite: false })));
    nm.rotation.x = -Math.PI / 2; nm.position.set(x0 + 4.3, 0.06, z1 - 0.7); g.add(nm);
    // banner (NTP emblem)
    const bx = paraMundo(s.x + s.w / 2 + (s.id === "guerra" || s.id === "scriptorium" ? 70 : s.id === "arena" ? 0 : -48), 0).x;
    const ban = Mt(new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide })); temas.push((cl) => ban.color.set(new THREE.Color(css(s.cor)).lerp(new THREE.Color(cl ? 0xb5776c : 0x5a1a1f), 0.5)));
    const bp = new THREE.Mesh(G(new THREE.PlaneGeometry(1.1, 1.6)), ban); bp.position.set(bx, 1.7, z0 + 0.23); bp.castShadow = true; g.add(bp);
    const be = new THREE.Mesh(G(new THREE.PlaneGeometry(0.8, 0.985)), Mt(new THREE.MeshBasicMaterial({ map: emblema, transparent: true, opacity: 0.92, depthWrite: false }))); be.position.set(bx, 1.75, z0 + 0.25); g.add(be);
    caixa(g, 1.3, 0.08, 0.1, bronze, bx, 2.55, z0 + 0.25, false);
    // torches: real point lights on the back wall
    for (const [k, px] of [s.x + 12, s.x + s.w - 12].entries()) {
      const tx = lado(px);
      caixa(g, 0.12, 0.5, 0.12, bronze, tx, 1.6, z0 + 0.3, false);
      const fl = new THREE.Mesh(G(new THREE.ConeGeometry(0.17, 0.5, 8)), chama); fl.position.set(tx, 2.0, z0 + 0.3); g.add(fl);
      const luz = new THREE.PointLight(0xffa24a, luzes.tocha, 15, 2); luz.position.set(tx, 2.1, z0 + 0.9); g.add(luz);
      tochas.push({ luz, chama: fl, i: si * 2 + k });
    }
    // props
    const ax = (px: number) => paraMundo(px, 0).x, az = (py: number) => paraMundo(0, py).z;
    switch (s.id) {
      case "guerra": {
        caixa(g, 3.6, 0.7, 1.0, madeira, c.x, 0.35, z0 + 1.2);
        caixa(g, 3.3, 0.04, 0.8, pergaminho, c.x, 0.72, z0 + 1.2, false);
        caixa(g, 1.4, 0.05, 0.05, std(0xc1121f, 0xc1121f), c.x + 0.2, 0.75, z0 + 1.15, false);
        const pino = new THREE.Mesh(G(new THREE.SphereGeometry(0.1, 8, 6)), std(0xc1121f, 0xc1121f)); pino.position.set(c.x + 0.9, 0.82, z0 + 1.15); g.add(pino);
        break;
      }
      case "scriptorium": {
        const lombos = [0x7f9bb5, 0x5a1a1f, 0x7fae8a, 0xd9a441, 0xa77bb0].map((cc) => std(cc, cc));
        for (let i = 0; i < 3; i++) {
          const sx = c.x - 4 + i * 4;
          caixa(g, 3.2, 1.7, 0.5, pedraEsc, sx, 0.85, z0 + 0.6);
          for (let k = 0; k < 9; k++) caixa(g, 0.22, 0.5 + (k % 3) * 0.08, 0.34, lombos[(k + i) % 5]!, sx - 1.2 + k * 0.3, 0.35 + (k % 3) * 0.04 + (k % 2) * 0.8, z0 + 0.75, false);
        }
        break;
      }
      case "forja": {
        caixa(g, 2.4, 1.5, 1.3, pedraEsc, c.x, 0.75, z0 + 1.0);
        const f = caixa(g, 1.6, 0.5, 0.2, brasa, c.x, 0.65, z0 + 1.68, false);
        const lf = new THREE.PointLight(0xff7a1a, 14, 9, 2); lf.position.set(c.x, 1.0, z0 + 2.2); g.add(lf); tochas.push({ luz: lf, chama: f, i: 11 });
        const ex = ax(s.x + s.w - 40), ez = az(s.y + 146);
        caixa(g, 1.0, 0.35, 0.5, aco, ex, 0.4, ez); caixa(g, 0.5, 0.35, 0.4, aco, ex, 0.2, ez);
        break;
      }
      case "arena": {
        for (const i of [0, 1]) { const rx = ax(s.x + 33 + i * 146), rz = az(s.y + 139); caixa(g, 1.9, 0.12, 0.4, madeira, rx, 0.9, rz); for (const k of [-0.6, -0.2, 0.2, 0.6]) caixa(g, 0.07, 1.0, 0.07, aco, rx + k, 1.4, rz, false); }
        const al = new THREE.Mesh(G(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 24)), vinho); al.position.set(ax(s.x + 106), 0.07, az(s.y + 150)); al.castShadow = true; g.add(al);
        const an = new THREE.Mesh(G(new THREE.TorusGeometry(0.28, 0.04, 6, 20)), bronze); an.rotation.x = Math.PI / 2; an.position.set(ax(s.x + 106), 0.14, az(s.y + 150)); g.add(an);
        break;
      }
      default: {
        caixa(g, 1.2, 1.0, 1.2, pedraEsc, c.x, 0.5, z0 + 1.1);
        const orb = new THREE.Mesh(G(new THREE.SphereGeometry(0.3, 14, 10)), ouro); orb.position.set(c.x, 1.45, z0 + 1.1); orb.castShadow = true; g.add(orb);
        for (const [k, rr] of [[0.7, 0.62], [1.1, 0.86]] as const) { const t = new THREE.Mesh(G(new THREE.TorusGeometry(rr, 0.03, 6, 36)), bronze); t.position.set(c.x, 1.45, z0 + 1.1); t.rotation.set(Math.PI / 2 - k * 0.6, k * 0.4, 0); g.add(t); }
        const tubo = new THREE.Mesh(G(new THREE.CylinderGeometry(0.1, 0.16, 1.5, 10)), aco); tubo.position.set(ax(s.x + s.w - 46), 0.8, az(s.y + 140)); tubo.rotation.z = 0.5; tubo.castShadow = true; g.add(tubo);
      }
    }
  };
  planta.salas.forEach(sala3d);

  // desks, chairs and the central table
  const papel = new THREE.Group(); mundo.add(papel);
  for (const d of planta.mesas) {
    const c = planoRetro(d, 0); const zc = paraMundo(0, d.y + 4).z;
    if (d.agente) {
      caixa(mundo, d.w * ESCALA, 0.12, 0.95, madeira, c.x, 0.78, zc); caixa(mundo, d.w * ESCALA - 0.2, 0.74, 0.8, madeira, c.x, 0.37, zc);
      caixa(mundo, 0.6, 0.03, 0.42, pergaminho, c.x + d.w * ESCALA * 0.25, 0.86, zc, false);
      const vela = new THREE.Mesh(G(new THREE.SphereGeometry(0.07, 8, 6)), chama); vela.position.set(c.x - d.w * ESCALA * 0.3, 0.92, zc); mundo.add(vela);
      caixa(mundo, 0.75, 0.5, 0.55, madeira, c.x, 0.25, paraMundo(0, d.y - 3).z - 0.6);
    }
  }
  { const m = MESA_CENTRAL; const c = planoRetro(m, 0);
    caixa(mundo, c.w, 0.14, 1.25, ouro, c.x, 0.82, c.z); caixa(mundo, c.w - 0.3, 0.78, 1.0, madeira, c.x, 0.39, c.z);
    caixa(mundo, 1.5, 0.03, 0.5, pergaminho, c.x - 0.8, 0.91, c.z, false);
    for (const sx of [378, 422]) caixa(mundo, 0.75, 0.5, 0.55, madeira, paraMundo(sx, 0).x, 0.25, paraMundo(0, 229).z - 0.6); }

  // ---- characters
  const ins = new Map<string, THREE.BufferGeometry>();
  const insignia = (grupo: string) => {
    let g = ins.get(grupo);
    if (!g) {
      const d = INSIGNIA[grupo];
      if (d) {
        const dados = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="${d}"/></svg>`);
        g = new THREE.ShapeGeometry(dados.paths.flatMap((p) => SVGLoader.createShapes(p)));
        g.translate(-6, -6, 0); g.scale(0.034, -0.034, 0.034);
      } else g = new THREE.CircleGeometry(0.12, 12);
      ins.set(grupo, G(g));
    }
    return g;
  };
  const corGrupo = new Map<string, THREE.MeshBasicMaterial>();
  const matGrupo = (id: string, cor: string) => {
    let m = corGrupo.get(id);
    if (!m) { m = Mt(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); const mm = m; temas.push(() => mm.color.set(css(cor))); corGrupo.set(id, m); }
    return m;
  };
  const gManto = G(new THREE.CylinderGeometry(0.2, 0.52, 1.0, 10));
  const gFaixa = G(new THREE.CylinderGeometry(0.45, 0.47, 0.1, 10, 1, true));
  const gCapuz = G(new THREE.SphereGeometry(0.29, 12, 10));
  const gPonta = G(new THREE.ConeGeometry(0.2, 0.42, 8));
  const gRosto = G(new THREE.SphereGeometry(0.19, 10, 8));
  const gOlho = G(new THREE.SphereGeometry(0.035, 6, 5));
  const gPe = G(new THREE.BoxGeometry(0.17, 0.1, 0.3));
  const gEmbl = G(new THREE.PlaneGeometry(0.34, 0.42));
  const gRolo = G(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8));
  const gAnel = G(new THREE.RingGeometry(0.62, 0.74, 28));
  const gHit = G(new THREE.CylinderGeometry(0.55, 0.55, 2.0, 8));
  const gAlarme = G(new THREE.ConeGeometry(0.22, 0.5, 4));
  const matEmbl = Mt(new THREE.MeshBasicMaterial({ map: emblema, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const matOlho = basic("#d4b27a");
  const matOlhoErr = basic("#ff5a4a");
  const matAnel = basic("#ece3d0", { transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false });
  const matAlarme = Mt(new THREE.MeshStandardMaterial({ color: 0xc1121f, emissive: 0xc1121f, emissiveIntensity: 1.2 }));
  const matRolo = std(0xebdfc4, 0xfbf5e4);
  const matHit = Mt(new THREE.MeshBasicMaterial({ visible: false }));

  interface P { id: string; root: THREE.Group; corpo: THREE.Group; capuz: THREE.Group; pes: THREE.Mesh[]; olhos: THREE.Mesh[]; rolo: THREE.Mesh; anel: THREE.Mesh; alarme: THREE.Mesh; manto: THREE.Mesh; hit: THREE.Mesh; yaw: number; px: number; pz: number; sit: number }
  const personagens = new Map<string, P>();
  const hits: THREE.Object3D[] = [];
  for (const a of sim.atores) {
    const m = membro(a.id);
    const root = new THREE.Group();
    const corpo = new THREE.Group(); root.add(corpo);
    const mt = new THREE.Mesh(gManto, manto); mt.position.y = 0.55; mt.castShadow = true; corpo.add(mt);
    const fx = new THREE.Mesh(gFaixa, matGrupo(m.grupo.id, m.grupo.cor)); fx.position.y = 0.3; corpo.add(fx);
    const capuz = new THREE.Group(); capuz.position.y = 1.2; corpo.add(capuz);
    const cb = new THREE.Mesh(gCapuz, manto); cb.scale.set(1, 1.12, 1.05); cb.castShadow = true; capuz.add(cb);
    const cp = new THREE.Mesh(gPonta, manto); cp.position.set(0, 0.3, -0.1); cp.rotation.x = -0.45; cp.castShadow = true; capuz.add(cp);
    const rs = new THREE.Mesh(gRosto, rosto); rs.position.set(0, -0.03, 0.12); rs.scale.set(1, 1.1, 0.75); capuz.add(rs);
    const olhos = [-0.07, 0.07].map((ox) => { const e = new THREE.Mesh(gOlho, matOlho); e.position.set(ox, 0.0, 0.25); e.visible = false; capuz.add(e); return e; });
    const gi = new THREE.Mesh(insignia(m.grupo.id), matGrupo(m.grupo.id, m.grupo.cor)); gi.position.set(0, 0.75, 0.315); gi.rotation.x = -0.31; corpo.add(gi);
    const costas = new THREE.Group(); costas.position.y = 0.76; costas.rotation.y = Math.PI; corpo.add(costas);
    const em = new THREE.Mesh(gEmbl, matEmbl); em.position.z = 0.3; em.rotation.x = -0.31; costas.add(em);
    const rolo = new THREE.Mesh(gRolo, matRolo); rolo.rotation.z = Math.PI / 2; rolo.position.set(0.36, 0.55, 0.28); rolo.visible = false; corpo.add(rolo);
    const pes = [-0.13, 0.13].map((px) => { const f = new THREE.Mesh(gPe, rosto); f.position.set(px, 0.05, 0.05); f.castShadow = true; root.add(f); return f; });
    const anel = new THREE.Mesh(gAnel, matAnel); anel.rotation.x = -Math.PI / 2; anel.position.y = 0.05; anel.visible = false; anel.renderOrder = 5; root.add(anel);
    const alarme = new THREE.Mesh(gAlarme, matAlarme); alarme.position.y = 2.3; alarme.rotation.x = Math.PI; alarme.visible = false; root.add(alarme);
    const hit = new THREE.Mesh(gHit, matHit); hit.position.y = 1; hit.userData["id"] = a.id; root.add(hit); hits.push(hit);
    root.scale.setScalar(1.3);
    mundo.add(root);
    personagens.set(a.id, { id: a.id, root, corpo, capuz, pes, olhos, rolo, anel, alarme, manto: mt, hit, yaw: 0, px: 0, pz: 0, sit: 1 });
  }

  // ---- plan-usage gauge on the back wall
  const gauge = new THREE.Group(); gauge.position.set(0, 7.6, MURO_Z + 1.8); gauge.rotation.x = -0.22; gauge.scale.setScalar(1.2); scene.add(gauge);
  const placa = new THREE.Mesh(G(new THREE.CylinderGeometry(4.3, 4.3, 0.4, 56)), std(0x1a1011, 0x3a2c28, { metalness: 0.4, roughness: 0.5 })); placa.rotation.x = Math.PI / 2; placa.castShadow = true; gauge.add(placa);
  const aro = new THREE.Mesh(G(new THREE.TorusGeometry(4.3, 0.16, 8, 64)), aco); aro.position.z = 0.2; gauge.add(aro);
  const embG = new THREE.Mesh(G(new THREE.PlaneGeometry(2.3, 2.83)), Mt(new THREE.MeshBasicMaterial({ map: emblema, transparent: true, toneMapped: false, depthWrite: false }))); embG.position.z = 0.26; gauge.add(embG);
  const R = { semana: 3.5, cincoHoras: 2.65 } as const;
  const TUBO = 0.27;
  const matTrilho = std(0x2a1a17, 0x6b5a4e);
  const cores = { semana: new THREE.Color(0xa9adb3), cincoHoras: new THREE.Color(0xc1121f) };
  const aneis = {} as Record<"semana" | "cincoHoras", { trilho: THREE.Mesh; fill: THREE.Mesh; mat: THREE.MeshStandardMaterial; marca: THREE.Mesh; pct: number }>;
  for (const t of ["semana", "cincoHoras"] as const) {
    const trilho = new THREE.Mesh(G(new THREE.TorusGeometry(R[t], TUBO, 10, 80)), matTrilho); trilho.position.z = 0.22; gauge.add(trilho);
    const mat = Mt(new THREE.MeshStandardMaterial({ color: cores[t], emissive: cores[t], emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.3 }));
    const fill = new THREE.Mesh(undefined, mat); fill.position.z = 0.26; fill.visible = false; fill.castShadow = true; gauge.add(fill);
    const marca = new THREE.Mesh(G(new THREE.OctahedronGeometry(0.2)), basic("#ece3d0")); marca.scale.set(0.8, 1.3, 0.8); marca.visible = false; gauge.add(marca);
    aneis[t] = { trilho, fill, mat, marca, pct: -1 };
  }
  const luzGauge = new THREE.PointLight(0xffd9a0, 40, 22, 2); luzGauge.position.set(0, 7.5, MURO_Z + 6); scene.add(luzGauge);
  const placas = (["cincoHoras", "semana"] as const).map((t, k) => {
    const { c, x } = tela(640, 300);
    const tx = Tx(new THREE.CanvasTexture(c)); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const m = new THREE.Mesh(G(new THREE.PlaneGeometry(9, 4.2)), Mt(new THREE.MeshBasicMaterial({ map: tx, toneMapped: false })));
    m.position.set(k === 0 ? -11 : 11, 7.6, MURO_Z + 1.3); m.rotation.x = -0.22; scene.add(m);
    return { t, c, x, tx, chave: "" };
  });
  const desenharPlacas = (agora: number) => {
    const u = efetivo(est.uso, agora);
    for (const p of placas) {
      const j = u.estado === "ok" ? u[p.t] : undefined;
      const chave = j ? `${j.percentual}|${contagem(j.reiniciaEm, agora)}|${adiantado(j.percentual, ritmo(j.reiniciaEm, p.t, agora))}` : "x";
      if (chave === p.chave) continue;
      p.chave = chave;
      const { x } = p;
      x.clearRect(0, 0, 640, 300);
      x.fillStyle = "#160e0f"; x.strokeStyle = "#b08a5a"; x.lineWidth = 10; x.beginPath(); x.roundRect(5, 5, 630, 290, 22); x.fill(); x.stroke();
      x.textBaseline = "alphabetic";
      x.fillStyle = p.t === "semana" ? "#a9adb3" : "#e35d6a"; x.fillRect(34, 40, 26, 26);
      x.fillStyle = "#d4b27a"; x.font = "700 40px Georgia, serif"; x.fillText(p.t === "semana" ? "SEMANA" : "5 HORAS", 78, 66);
      if (j) {
        const alto = j.percentual >= 90 ? "#ff6b6b" : j.percentual >= 80 ? "#f2b84b" : "#ece3d0";
        x.fillStyle = alto; x.font = "700 110px Georgia, serif"; x.fillText(`${j.percentual}%`, 34, 178);
        x.fillStyle = "#ece3d0"; x.font = "500 34px system-ui, sans-serif"; x.fillText("reinicia em", 34, 232);
        x.fillStyle = "#d4b27a"; x.font = "700 46px ui-monospace, monospace"; x.fillText(contagem(j.reiniciaEm, agora), 34, 280);
        if (adiantado(j.percentual, ritmo(j.reiniciaEm, p.t, agora))) { x.fillStyle = "#f2b84b"; x.font = "600 28px system-ui, sans-serif"; x.textAlign = "right"; x.fillText("consumo adiantado", 610, 66); x.textAlign = "left"; }
      } else {
        x.fillStyle = "#a9adb3"; x.font = "700 60px Georgia, serif"; x.fillText("indisponível", 34, 178);
        x.font = "500 30px system-ui, sans-serif"; x.fillText("sem leitura do plano", 34, 232);
      }
      p.tx.needsUpdate = true;
    }
  };
  const atualizarGauge = (agora: number, t: number) => {
    const u = efetivo(est.uso, agora);
    for (const k of ["semana", "cincoHoras"] as const) {
      const a = aneis[k]; const j = u.estado === "ok" ? u[k] : undefined;
      const pct = j ? j.percentual : 0;
      if (pct !== a.pct) {
        a.pct = pct;
        a.fill.geometry?.dispose();
        const { arco, rotacao } = arcoUso(pct);
        a.fill.visible = pct > 0;
        if (pct > 0) { a.fill.geometry = new THREE.TorusGeometry(R[k], TUBO * 1.04, 10, Math.max(3, Math.ceil(80 * (pct / 100))), arco); a.fill.rotation.z = rotacao; }
      }
      const alto = pct >= 90 ? 0xff2a2a : pct >= 80 ? 0xf2b84b : 0;
      a.mat.color.copy(alto ? new THREE.Color(alto) : cores[k]); a.mat.emissive.copy(a.mat.color);
      a.mat.emissiveIntensity = alto ? 0.5 + (calmo ? 0.2 : 0.25 * (1 + Math.sin(t / 300))) : 0.3;
      a.marca.visible = !!j;
      if (j) { const f = ritmo(j.reiniciaEm, k, agora); const an = anguloRitmo(f); a.marca.position.set(Math.cos(an) * R[k], Math.sin(an) * R[k], 0.45); a.marca.rotation.z = an - Math.PI / 2; (a.marca.material as THREE.MeshBasicMaterial).color.set(adiantado(j.percentual, f) ? "#f2b84b" : "#ece3d0"); }
      a.trilho.visible = true;
    }
    (embG.material as THREE.MeshBasicMaterial).opacity = u.estado === "ok" ? 1 : 0.4;
    desenharPlacas(agora);
  };

  // ---- theme
  const retema = () => {
    const c = claroAgora();
    for (const f of temas) f(c);
    for (const f of nomes) f(c);
    scene.background = new THREE.Color(c ? 0xe9dec3 : 0x0c0809);
    hemi.color.set(c ? 0xfff4d6 : 0x5668b8); hemi.groundColor.set(c ? 0xb59a6e : 0x2a1a1c); hemi.intensity = c ? 1.5 : 1.35;
    sol.color.set(c ? 0xfff0c8 : 0x9fb4ff); sol.intensity = c ? 2.4 : 0.8;
    luzes.tocha = c ? 7 : 30; luzGauge.intensity = c ? 10 : 40;
    renderer.toneMappingExposure = c ? 1.0 : 1.15;
    for (const t of tochas) if (t.i !== 11) t.luz.intensity = luzes.tocha;
    pedir();
  };
  retema();
  const mo = new MutationObserver(retema);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });

  // ---- camera and controls
  let distancia = 50, mexeu = false;
  const alvo = new THREE.Vector3(0, 3.2, -1);
  const posicionar = () => { camera.position.copy(alvo).add(new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV)).multiplyScalar(distancia)); camera.lookAt(alvo); };
  const controles = o.toque ? undefined : new OrbitControls(camera, canvas);
  if (controles) {
    controles.target.copy(alvo); controles.enablePan = false; controles.enableDamping = !calmo; controles.dampingFactor = 0.08;
    controles.minPolarAngle = Math.PI / 2 - ELEV - 0.3; controles.maxPolarAngle = Math.PI / 2 - ELEV + 0.35;
    controles.minAzimuthAngle = -0.6; controles.maxAzimuthAngle = 0.6; controles.rotateSpeed = 0.5;
    controles.addEventListener("start", () => { mexeu = true; });
    controles.addEventListener("change", () => { if (calmo) pedir(); });
  }
  // page scroll wins over zoom unless Ctrl/Cmd (or a trackpad pinch, which sets ctrlKey) is held
  const roda = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation(); };
  canvas.addEventListener("wheel", roda, { capture: true });
  const ajustar = () => {
    const w = Math.max(1, o.host.clientWidth), h = Math.max(1, o.host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // fit: pull the camera back until the whole hall (floor corners, back wall top) projects inside the frame
    const pts = [[-20.8, 0, 12.8], [20.8, 0, 12.8], [-20.8, 0, -12.6], [20.8, 12.6, MURO_Z], [-20.8, 12.6, MURO_Z], [0, 13.4, MURO_Z + 1.4], [-14, 10, MURO_Z], [14, 10, MURO_Z]].map(([x, y, z]) => new THREE.Vector3(x!, y!, z!));
    distancia = 40;
    for (let i = 0; i < 4; i++) {
      posicionar(); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      const m = Math.max(...pts.map((p) => { const q = p.clone().project(camera); return Math.max(Math.abs(q.x), Math.abs(q.y)); }));
      distancia = distancia * Math.max(0.5, m / 0.97);
    }
    if (controles) { controles.minDistance = distancia * 0.55; controles.maxDistance = distancia * 1.1; }
    mexeu = false; posicionar();
    if (calmo) pedir();
  };

  // ---- picking
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pick = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const h = ray.intersectObjects(hits, false)[0];
    return h?.object.userData["id"] as string | undefined;
  };
  let hover: string | undefined, down: { x: number; y: number } | undefined;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    const d = down; down = undefined;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    const id = pick(e); if (id) o.onClicar(id);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    const id = pick(e);
    if (id !== hover) { hover = id; canvas.style.cursor = id ? "pointer" : ""; o.onHover(id); pedir(); }
  };
  const onLeave = () => { if (hover) { hover = undefined; canvas.style.cursor = ""; o.onHover(undefined); pedir(); } };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerleave", onLeave);
  let ctxPerdido = false;
  const perdido = (e: Event) => { e.preventDefault(); ctxPerdido = true; if (!morto) o.onFalha("o contexto gráfico foi perdido"); };
  canvas.addEventListener("webglcontextlost", perdido);

  // ---- per-frame update
  const v = new THREE.Vector3();
  const desenhar = (t: number) => {
    const agora = Date.now();
    for (const a of sim.atores) {
      const p = personagens.get(a.id); if (!p) continue;
      const w = paraMundo(a.x, a.y);
      const sentado = a.fase === "sentado";
      const dx = w.x - p.px, dz = w.z - p.pz;
      const mov = Math.hypot(dx, dz) > 1e-4;
      p.px = w.x; p.pz = w.z;
      p.sit += ((sentado ? 1 : 0) - p.sit) * (calmo ? 1 : 0.25);
      const alvoYaw = mov ? Math.atan2(dx, dz) : sentado ? 0 : p.yaw;
      p.yaw = calmo ? alvoYaw : lerpAng(p.yaw, alvoYaw, 0.22);
      p.root.position.set(w.x, 0, w.z - 0.3 * p.sit);
      p.root.rotation.y = p.yaw;
      const andando = a.fase === "andando";
      const sw = andando ? Math.sin(a.dist * ESCALA * 4.6) : 0;
      const at = est.atividade[a.id];
      const ativo = !!at?.ativo, falhou = !!at?.falhou;
      p.corpo.position.y = 0.18 * p.sit + (andando ? Math.abs(sw) * 0.07 : 0);
      p.corpo.scale.y = 1 - 0.16 * p.sit;
      p.corpo.rotation.z = sw * 0.06;
      p.capuz.rotation.x = sentado && ativo && !calmo ? Math.sin(t / 260) * 0.09 : 0;
      p.pes[0]!.position.set(-0.13, 0.05 + Math.max(0, sw) * 0.1, 0.05 + sw * 0.2);
      p.pes[1]!.position.set(0.13, 0.05 + Math.max(0, -sw) * 0.1, 0.05 - sw * 0.2);
      for (const f of p.pes) f.visible = p.sit < 0.5;
      p.rolo.visible = a.carrega;
      const olhar = ativo || falhou;
      for (const e of p.olhos) { e.visible = olhar; e.material = falhou ? matOlhoErr : matOlho; }
      p.alarme.visible = falhou;
      if (falhou) { p.alarme.position.y = 2.3 + (calmo ? 0 : Math.sin(t / 220) * 0.12); p.alarme.rotation.y = calmo ? 0 : t / 400; }
      const marcado = est.selecionado === a.id || hover === a.id;
      p.anel.visible = marcado;
    }
    // torches flicker (frozen in the static frame)
    for (const k of tochas) {
      const f = calmo ? 1 : 0.84 + 0.16 * Math.sin(t * 0.011 + k.i * 1.7) * Math.sin(t * 0.0073 + k.i) + 0.06 * Math.sin(t * 0.031 + k.i * 3);
      k.luz.intensity = (k.i === 11 ? 14 : luzes.tocha) * f; k.chama.scale.y = 0.85 + 0.3 * f;
    }
    atualizarGauge(agora, t);
    controles?.update();
    // HTML bubbles follow the heads
    const r = canvas.getBoundingClientRect(); const W = r.width, H = r.height;
    for (const [id, el] of o.bolhas()) {
      const p = personagens.get(id); if (!p) continue;
      v.set(p.px, 2.05 + (p.alarme.visible ? 0.5 : 0), p.pz - 0.3 * p.sit).project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      el.style.display = vis ? "" : "none";
      if (vis) el.style.transform = `translate(${((v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - v.y) / 2 * H).toFixed(1)}px) translate(-50%, -100%)`;
    }
    renderer.render(scene, camera);
  };

  // ---- loop: only while motion is allowed, the tab is visible and the scene is on screen; ~30 fps. In calm mode: a single frame on demand.
  const permitido = () => !morto && !document.hidden && visivel;
  const quadro = (t: number) => {
    raf = 0;
    if (!permitido() || calmo) return;
    if (t - ultimo >= FPS_MS) { const dt = ultimo === 0 ? FPS_MS : t - ultimo; ultimo = t; sim.passo(dt, est.atividade); desenhar(t); }
    raf = requestAnimationFrame(quadro);
  };
  const parte = () => { if (!calmo && permitido() && raf === 0) { ultimo = 0; raf = requestAnimationFrame(quadro); } };
  function pedir() {
    if (!calmo || pendente || morto) return;
    pendente = true;
    requestAnimationFrame((t) => { pendente = false; if (!morto && calmo) { sim.parar(); desenhar(t); } });
  }
  const io = "IntersectionObserver" in window ? new IntersectionObserver((e) => { visivel = !!e[e.length - 1]?.isIntersecting; parte(); }) : undefined;
  io?.observe(o.host);
  const ro = new ResizeObserver(ajustar); ro.observe(o.host);
  document.addEventListener("visibilitychange", parte);
  ajustar();
  if (calmo) { sim.parar(); pedir(); } else parte();

  return {
    atualizar(e) { est = e; sim.setMaxPasseio(e.aoVivo ? 7 : 5); if (calmo) pedir(); },
    recado(r) { if (!calmo) sim.recado(r); },
    setCalmo(c) {
      if (c === calmo) return;
      calmo = c;
      if (controles) controles.enableDamping = !c;
      if (c) { cancelAnimationFrame(raf); raf = 0; sim.parar(); pedir(); } else parte();
    },
    pedirQuadro: pedir,
    dispose() {
      morto = true;
      cancelAnimationFrame(raf); raf = 0;
      io?.disconnect(); ro.disconnect(); mo.disconnect();
      document.removeEventListener("visibilitychange", parte);
      canvas.removeEventListener("webglcontextlost", perdido); canvas.removeEventListener("wheel", roda, { capture: true });
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave);
      controles?.dispose();
      scene.traverse((ob) => { const m = ob as THREE.Mesh; m.geometry?.dispose(); });
      for (const x of lixo) x.dispose();
      for (const a of Object.values(aneis)) a.fill.geometry.dispose();
      sol.shadow.map?.dispose();
      renderer.dispose();
      if (!ctxPerdido) renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
