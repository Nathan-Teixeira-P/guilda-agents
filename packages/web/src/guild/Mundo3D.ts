import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { anguloRitmo, arcoUso, contagem, ESCALA, paraMundo } from "../logic/cena3d.ts";
import { adiantado, efetivo, ritmo, type Uso } from "../logic/emblem.ts";
import type { Atividade } from "../logic/escritorio.ts";
import { PORTARIA, posicionar as dispor, TREINO, type SalaProjeto } from "../logic/fortaleza.ts";
import { ALVO_X, BONECOS, bracos, CORDA_X, VITIMA_X, criarTreino, ESCALADA_X, FENO_X, RAIAS, SALTO_Y, TORRE_ALT, TORRE_X } from "../logic/treino.ts";
import { membro, ROSTER } from "../roster.ts";
import { INSIGNIA } from "./Avatar.tsx";

// Plain three.js renderer of the guild hideout. It only draws: layout and walking come from logic/fortaleza.ts (same plan as the 2D scene).
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
export interface Mundo { atualizar: (e: Estado) => void; setCalmo: (c: boolean) => void; pedirQuadro: () => void; dispose: () => void }

const css = (v: string) => { const m = /^var\((--[\w-]+)\)$/.exec(v); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]!).trim() || "#b08a5a" : v; };
const claroAgora = () => document.documentElement.dataset["tema"] === "claro";
const lerpAng = (a: number, b: number, k: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

export function criarMundo(o: Opcoes): Mundo {
  let plano = dispor({});
  const ORDEM = ROSTER.map((r) => r.tecnico);
  const treino = criarTreino();
  let cena = treino(0, 0, plano.lugar, ORDEM, o.calmo);
  let chaveSalas = "-";
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
  const manto = std(0xcfc7b8, 0xe9e2d3);
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
  // soft fills so the hooded figures read against the dark floor: one over training, one over the contracts
  const preenche = [9, -7].map((z) => { const l = new THREE.PointLight(0xffe2bd, 90, 30, 1.6); l.position.set(0, 7, z); scene.add(l); return l; });
  const tochas: { luz: THREE.PointLight; chama: THREE.Mesh; i: number }[] = [];
  const luzes = { tocha: 30 };

  // ---- hall: base and back wall
  const mundo = new THREE.Group(); scene.add(mundo);
  caixa(mundo, 41.5, 0.6, 25.5, std(0x1c1415, 0xcdbd9a), 0, -0.5, 0.2, false);
  const planoRetro = (r: { x: number; y: number; w: number; h: number }) => ({ ...paraMundo(r.x + r.w / 2, r.y + r.h / 2), w: r.w * ESCALA, d: r.h * ESCALA });
  const ax = (px: number) => paraMundo(px, 0).x, az = (py: number) => paraMundo(0, py).z;
  const muro = caixa(mundo, 42, 13, 0.8, ladMat(0x3b302c, 0xa89a7e, 21, 6.5), 0, 6, MURO_Z);
  for (const sx of [-1, 1]) caixa(mundo, 1.4, 13.4, 1.6, pedraEsc, sx * 20.8, 6.2, MURO_Z + 0.4);
  muro.receiveShadow = true;

  const palha = std(0xb98a3a, 0xd9b062);
  const sangue = std(0x8a1620, 0xb5302f);
  const placaNome = (txt: string, descarte: { dispose: () => void }[]) => {
    const { c, x } = tela(512, 96);
    const claro = claroAgora();
    x.font = "700 52px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = claro ? "#4a2f0c" : "#d4b27a"; x.shadowColor = claro ? "rgba(255,255,255,.6)" : "#000"; x.shadowBlur = 6;
    x.fillText(txt.toUpperCase(), 256, 50, 500);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const g = new THREE.PlaneGeometry(7, 1.31), m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
    descarte.push(t, g, m);
    const mesh = new THREE.Mesh(g, m); mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.08;
    return mesh;
  };
  const piso = (pai: THREE.Object3D, r: { x: number; y: number; w: number; h: number }, m: THREE.Material) => { const c = planoRetro(r); caixa(pai, c.w, 0.2, c.d, m, c.x, -0.1, c.z, false); return c; };
  const estandarte = (pai: THREE.Object3D, x: number, y: number, z: number) => {
    caixa(pai, 0.9, 1.5, 0.08, sangue, x, y, z);
    const e = new THREE.Mesh(G(new THREE.PlaneGeometry(0.66, 0.81)), Mt(new THREE.MeshBasicMaterial({ map: emblema, transparent: true, depthWrite: false }))); e.position.set(x, y + 0.05, z + 0.06); pai.add(e);
    caixa(pai, 1.1, 0.08, 0.12, bronze, x, y + 0.8, z, false);
  };
  const tocha = (x: number, z: number, i: number, comLuz = true) => {
    caixa(mundo, 0.12, 1.7, 0.12, bronze, x, 0.85, z);
    const fl = new THREE.Mesh(G(new THREE.ConeGeometry(0.17, 0.5, 8)), chama); fl.position.set(x, 1.95, z); mundo.add(fl);
    const luz = new THREE.PointLight(0xffa24a, luzes.tocha, 15, 2); luz.position.set(x, 2.1, z + 0.5);
    if (comLuz) { mundo.add(luz); tochas.push({ luz, chama: fl, i }); }
  };

  const gBarril = G(new THREE.CylinderGeometry(0.36, 0.36, 0.85, 12));
  const gAroBarril = G(new THREE.TorusGeometry(0.37, 0.035, 5, 16));
  const barril = (pai: THREE.Object3D, x: number, z: number) => {
    const b = new THREE.Mesh(gBarril, madeira); b.position.set(x, 0.43, z); b.castShadow = true; pai.add(b);
    for (const h of [0.22, 0.66]) { const a = new THREE.Mesh(gAroBarril, aco); a.rotation.x = Math.PI / 2; a.position.set(x, h, z); pai.add(a); }
  };
  const caixote = (pai: THREE.Object3D, x: number, z: number, l = 0.7) => { caixa(pai, l, l, l, madeira, x, l / 2, z); caixa(pai, l + 0.04, 0.07, l + 0.04, bronze, x, l, z, false); };
  const gBacia = G(new THREE.CylinderGeometry(0.4, 0.22, 0.25, 10));
  const gFogo = G(new THREE.ConeGeometry(0.28, 0.6, 8));
  const braseiro = (pai: THREE.Object3D, x: number, z: number) => {
    caixa(pai, 0.12, 0.8, 0.12, aco, x, 0.4, z);
    const b = new THREE.Mesh(gBacia, aco); b.position.set(x, 0.9, z); b.castShadow = true; pai.add(b);
    const f = new THREE.Mesh(gFogo, brasa); f.position.set(x, 1.3, z); pai.add(f);
  };
  const lombos = [0x7f9bb5, 0x9e1b24, 0x7fae8a, 0xd9a441, 0xa77bb0].map((c) => std(c, c));
  const estante = (pai: THREE.Object3D, x: number, z: number, w = 2.6) => {
    caixa(pai, w, 1.9, 0.45, pedraEsc, x, 0.95, z);
    for (let p = 0; p < 3; p++) for (let k = 0; k < Math.floor((w - 0.3) / 0.28); k++) caixa(pai, 0.2, 0.4 + ((k + p) % 3) * 0.05, 0.1, lombos[(k + p * 2) % 5]!, x - w / 2 + 0.28 + k * 0.28, 0.35 + p * 0.6, z + 0.25, false);
  };
  const escudo = (pai: THREE.Object3D, x: number, y: number, z: number) => {
    for (const a of [-0.75, 0.75]) caixa(pai, 0.09, 1.5, 0.06, aco, x, y, z, false).rotation.z = a;
    const d = new THREE.Mesh(G(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20)), faixaMat); d.rotation.x = Math.PI / 2; d.position.set(x, y, z + 0.08); pai.add(d);
  };
  const faixaMat = std(0x9e1b24, 0x9e1b24);

  // training hall (front)
  {
    const c = piso(mundo, TREINO, ladMat(0x3a2c2b, 0xd8c9a6, 19, 5));
    const z0 = c.z - c.d / 2, z1 = c.z + c.d / 2, fundo = z0 + 2.0;
    for (const sx of [-1, 1]) { caixa(mundo, 0.35, 0.9, c.d, pedra, sx * c.w / 2, 0.45, c.z); estandarte(mundo, sx * (c.w / 2 - 0.9), 1.9, z0 + 0.5); }
    caixa(mundo, c.w, 0.35, 0.35, pedra, 0, 0.17, z1);
    for (const px of BONECOS) { // straw dummies
      const x = ax(px), fundo = az(RAIAS[0]);
      caixa(mundo, 0.16, 1.7, 0.16, madeira, x, 0.85, fundo); caixa(mundo, 1.2, 0.13, 0.13, madeira, x, 1.25, fundo);
      const corpo = new THREE.Mesh(G(new THREE.CylinderGeometry(0.34, 0.28, 0.8, 10)), palha); corpo.position.set(x, 1.05, fundo); corpo.castShadow = true; mundo.add(corpo);
      const cab = new THREE.Mesh(G(new THREE.SphereGeometry(0.26, 10, 8)), palha); cab.position.set(x, 1.8, fundo); mundo.add(cab);
    }
    // weapon rack
    for (const h of [0.35, 1.35]) caixa(mundo, 3, 0.12, 0.2, madeira, ax(476), h, fundo);
    for (const k of [-1.1, -0.55, 0, 0.55]) { caixa(mundo, 0.09, 1.9, 0.06, aco, ax(476) + k, 1.0, fundo + 0.15); caixa(mundo, 0.36, 0.07, 0.09, ouro, ax(476) + k, 0.6, fundo + 0.15, false); }
    for (const sx of [-1.5, 1.5]) caixa(mundo, 0.16, 1.7, 0.16, madeira, ax(476) + sx, 0.85, fundo);
    for (const ry of RAIAS) { // archery targets, facing the archers
      const x = ax(ALVO_X), z = az(ry);
      caixa(mundo, 0.14, 1.1, 0.14, madeira, x + 0.15, 0.55, z);
      for (const [r, m, dx] of [[0.62, pergaminho, 0], [0.42, sangue, -0.05], [0.24, pergaminho, -0.1], [0.1, sangue, -0.15]] as const) { const d = new THREE.Mesh(G(new THREE.CylinderGeometry(r, r, 0.1, 24)), m); d.rotation.z = Math.PI / 2; d.position.set(x + dx, 1.4, z); d.castShadow = true; mundo.add(d); }
    }
    // hay cart for the leap
    const hx = ax(FENO_X), hz = az(SALTO_Y);
    caixa(mundo, 2.6, 0.5, 1.4, madeira, hx, 0.5, hz);
    const feno = new THREE.Mesh(G(new THREE.SphereGeometry(1.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), palha); feno.scale.set(1.1, 0.8, 0.65); feno.position.set(hx, 0.75, hz); feno.castShadow = true; mundo.add(feno);
    for (const sx of [-0.9, 0.9]) { const roda = new THREE.Mesh(G(new THREE.TorusGeometry(0.32, 0.07, 6, 18)), aco); roda.position.set(hx + sx, 0.34, hz + 0.78); mundo.add(roda); }
    // the tower of the leap of faith
    {
      const tx = ax(TORRE_X), tz = az(SALTO_Y), h = TORRE_ALT * ESCALA;
      for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) caixa(mundo, 0.14, h, 0.14, madeira, tx + dx, h / 2, tz + dz);
      for (let r = 0.5; r < h; r += 0.55) caixa(mundo, 1.0, 0.08, 0.08, madeira, tx, r, tz + 0.52, false);
      caixa(mundo, 2.0, 0.14, 1.3, madeira, tx - 0.35, h - 0.07, tz);
    }
    // beam and eagle
    for (const px of [240, 336]) caixa(mundo, 0.22, 2.6, 0.22, madeira, ax(px), 1.3, fundo - 0.4);
    caixa(mundo, 5.2, 0.22, 0.3, madeira, ax(288), 2.65, fundo - 0.4);
    const ave = new THREE.Group(); ave.position.set(ax(290), 3.05, fundo - 0.4); mundo.add(ave);
    const peito = new THREE.Mesh(G(new THREE.SphereGeometry(0.3, 10, 8)), pergaminho); peito.scale.set(0.8, 1.1, 1); peito.castShadow = true; ave.add(peito);
    const cabeca = new THREE.Mesh(G(new THREE.SphereGeometry(0.17, 8, 6)), pergaminho); cabeca.position.set(0.1, 0.38, 0.05); ave.add(cabeca);
    const bico = new THREE.Mesh(G(new THREE.ConeGeometry(0.07, 0.24, 6)), ouro); bico.rotation.z = -Math.PI / 2; bico.position.set(0.34, 0.36, 0.05); ave.add(bico);
    for (const sz of [-1, 1]) caixa(ave, 0.5, 0.45, 0.08, madeira, -0.12, 0, sz * 0.24);
    tocha(ax(201), fundo, 1); tocha(ax(586), fundo, 3);
    const nome = placaNome("Sala de Treinamento", lixo); nome.position.set(0, 0.08, z1 - 0.7); mundo.add(nome);
    temas.push(() => { const novo = placaNome("Sala de Treinamento", lixo); (nome.material as THREE.MeshBasicMaterial).map = (novo.material as THREE.MeshBasicMaterial).map; });
  }

  // gatehouse (middle): low crenellated walls so the contracts stay visible
  {
    const c = piso(mundo, PORTARIA, ladMat(0x4a3b35, 0xc9b998, 19, 2));
    const frente = c.z + c.d / 2;
    caixa(mundo, 2.6, 0.04, c.d + 0.9, vinho, 0, 0.02, c.z, false);
    for (const lado of [-1, 1]) {
      const larg = c.w / 2 - 2;
      caixa(mundo, larg, 0.7, 0.45, pedra, lado * (2 + larg / 2), 0.35, frente);
      for (let k = 0; k < 11; k++) caixa(mundo, 0.7, 0.3, 0.45, pedraEsc, lado * (2.6 + k * 1.6), 0.85, frente);
      caixa(mundo, 0.9, 3.1, 0.9, pedraEsc, lado * 2.1, 1.55, frente);
      caixa(mundo, 1.1, 0.25, 1.1, bronze, lado * 2.1, 3.22, frente);
      estandarte(mundo, lado * 2.1, 1.9, frente + 0.5);
      tocha(lado * 3.3, frente + 0.45, lado + 6);
    }
    caixa(mundo, 5.1, 0.45, 0.6, pedra, 0, 3.0, frente);
    for (const gx of [-1.1, -0.55, 0, 0.55, 1.1]) caixa(mundo, 0.07, 0.6, 0.07, aco, gx, 2.5, frente, false); // raised portcullis
    const nome = placaNome("Portaria", lixo); nome.position.set(-c.w / 2 + 3.6, 0.08, az(PORTARIA.y + 52)); mundo.add(nome);
    temas.push(() => { const novo = placaNome("Portaria", lixo); (nome.material as THREE.MeshBasicMaterial).map = (novo.material as THREE.MeshBasicMaterial).map; });
  }

  // props: stores by the gate, braziers and barrels in training, banners and shields on the back wall
  {
    const gz = az(PORTARIA.y + 22);
    for (const px of [112, 134]) barril(mundo, ax(px), gz);
    barril(mundo, ax(123), gz + 0.7);
    caixote(mundo, ax(190), gz, 0.9); caixote(mundo, ax(214), gz + 0.2, 0.6);
    caixote(mundo, ax(600), gz + 0.2, 0.6); caixote(mundo, ax(626), gz, 0.9);
    for (const px of [728, 750]) barril(mundo, ax(px), gz);
    for (const px of [262, 538]) braseiro(mundo, ax(px), gz);
    const tz = az(TREINO.y + 30);
    braseiro(mundo, ax(396), tz); barril(mundo, ax(180), tz); barril(mundo, ax(200), tz + 0.3); caixote(mundo, ax(530), tz);
    { // the climbing tower: wall behind the climbers, with holds and a crenellated top
      const cx = ax(ESCALADA_X[1]), cz = az(SALTO_Y - 14), h = TORRE_ALT * ESCALA + 0.4;
      const clara = std(0x8f7a6c, 0xcdbb98);
      caixa(mundo, 3.4, h, 0.4, clara, cx, h / 2, cz);
      const rx = ax(CORDA_X), rz = az(SALTO_Y), corda = std(0xc9a56a, 0xa8864f);
      caixa(mundo, cx - rx, 0.16, 0.16, madeira, (cx + rx) / 2, h + 0.05, cz);
      caixa(mundo, 0.16, 0.16, rz - cz, madeira, rx, h + 0.05, (rz + cz) / 2);
      caixa(mundo, 0.09, h, 0.09, corda, rx, h / 2, rz);
      for (let n = 1; n <= 5; n++) caixa(mundo, 0.18, 0.12, 0.18, corda, rx, n * 0.55, rz, false);
      for (let i = 0; i < 18; i++) caixa(mundo, 0.35, 0.14, 0.18, bronze, cx - 1.4 + (i % 3) * 1.1 + (Math.floor(i / 3) % 2) * 0.35, 0.4 + Math.floor(i / 3) * 0.5, cz + 0.28, false);
      caixa(mundo, 3.9, 0.2, 0.8, madeira, cx, h + 0.1, cz);
      for (const dx of [-1.6, -0.55, 0.55, 1.6]) caixa(mundo, 0.4, 0.4, 0.4, pedraEsc, cx + dx, h + 0.4, cz);
    }
    { // the straw man for the knives, facing the thrower
      const x = ax(VITIMA_X), z = az(RAIAS[1]), fibra = std(0xb98a3a, 0xd9b062);
      for (const dz of [-0.18, 0.18]) caixa(mundo, 0.16, 0.75, 0.16, fibra, x, 0.37, z + dz);
      caixa(mundo, 0.32, 0.75, 0.56, fibra, x, 1.12, z);
      for (const dz of [-0.46, 0.46]) caixa(mundo, 0.14, 0.14, 0.42, fibra, x, 1.3, z + dz);
      const cab = new THREE.Mesh(G(new THREE.SphereGeometry(0.22, 10, 8)), fibra); cab.position.set(x, 1.74, z); cab.castShadow = true; mundo.add(cab);
      caixa(mundo, 0.06, 0.2, 0.2, std(0x9e1b24, 0x9e1b24), x - 0.19, 1.25, z, false);
    }
    for (const sx of [-1, 1]) {
      estandarte(mundo, sx * 18.4, 5.4, MURO_Z + 0.55);
      escudo(mundo, sx * 18.4, 8.4, MURO_Z + 0.55);
      for (let k = 0; k < 3; k++) caixa(mundo, 0.7, 2.2, 0.7, pedraEsc, sx * 20.1, 1.1, az(250) + k * 5);
    }
  }

  // contract rooms (back): rebuilt when the set of projects at work changes
  const contratos = new THREE.Group(); mundo.add(contratos);
  let descarte: { dispose: () => void }[] = [];
  const pisoSala = ladMat(0x4a2f2c, 0xf2e9d2, 8, 4);
  const montarSalas = (salas: SalaProjeto[]) => {
    for (const x of descarte) x.dispose();
    descarte = [];
    contratos.traverse((ob) => { const m = ob as THREE.Mesh; if (m.geometry?.type === "BoxGeometry") m.geometry.dispose(); });
    contratos.clear();
    if (salas.length === 0) {
      // the library and planning tables wait for the next contract
      for (const px of [80, 154, 646, 720]) estante(contratos, ax(px), az(36));
      for (const px of [260, 540]) { caixa(contratos, 3.4, 0.14, 1.4, madeira, ax(px), 0.8, az(120)); caixa(contratos, 3.0, 0.74, 0.9, madeira, ax(px), 0.37, az(120)); caixa(contratos, 2.0, 0.03, 0.9, pergaminho, ax(px) - 0.3, 0.89, az(120), false); caixa(contratos, 0.1, 0.5, 0.1, pergaminho, ax(px) + 1.2, 1.1, az(120), false); }
      for (const px of [334, 466]) braseiro(contratos, ax(px), az(140));
      barril(contratos, ax(60), az(150)); caixote(contratos, ax(740), az(150));
      const vazio = placaNome("Nenhum contrato em campo", descarte); vazio.position.set(0, 0.08, az(96)); contratos.add(vazio);
      return;
    }
    for (const s of salas) {
      const c = piso(contratos, s, pisoSala);
      const z0 = c.z - c.d / 2, z1 = c.z + c.d / 2;
      caixa(contratos, c.w, 2.4, 0.35, pedra, c.x, 1.2, z0);
      for (const sx of [-1, 1]) caixa(contratos, 0.3, 1.1, c.d, pedra, c.x + sx * c.w / 2, 0.55, c.z);
      caixa(contratos, c.w, 0.08, 0.12, ouro, c.x, 0.06, z1, false);
      const mesa = Math.min(3.6, c.w - 1.5);
      caixa(contratos, mesa, 0.7, 0.9, madeira, c.x, 0.35, z0 + 1.1);
      caixa(contratos, mesa - 0.3, 0.04, 0.7, pergaminho, c.x, 0.72, z0 + 1.1, false);
      caixa(contratos, mesa * 0.5, 0.05, 0.06, sangue, c.x, 0.75, z0 + 1.1, false);
      estandarte(contratos, c.x - c.w / 2 + 1, 1.5, z0 + 0.25);
      if (s.w > 250) { estante(contratos, c.x - c.w / 2 + 3.2, z0 + 0.5, 2.2); escudo(contratos, c.x + c.w / 2 - 1.8, 1.5, z0 + 0.25); }
      barril(contratos, c.x - c.w / 2 + 0.8, z1 - 0.9); caixote(contratos, c.x + c.w / 2 - 0.8, z1 - 0.9);
      const nome = placaNome(s.nome, descarte); nome.scale.setScalar(Math.min(1, (c.w - 0.6) / 7)); nome.position.set(c.x, 0.08, z1 - 0.7); contratos.add(nome);
    }
  };

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
  const gManto = G(new THREE.CylinderGeometry(0.3, 0.23, 0.58, 10)); // torso: shoulders wider than the waist
  const gFaixa = G(new THREE.CylinderGeometry(0.45, 0.47, 0.1, 10, 1, true));
  const gCapuz = G(new THREE.SphereGeometry(0.22, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.8)); gCapuz.rotateX(-0.9); // open towards the face
  const gPonta = G(new THREE.ConeGeometry(0.2, 0.42, 8));
  const gRosto = G(new THREE.SphereGeometry(0.165, 14, 12));
  const gOlho = G(new THREE.SphereGeometry(0.022, 6, 5));
  const gNariz = G(new THREE.ConeGeometry(0.028, 0.08, 5)); gNariz.rotateX(Math.PI / 2);
  const gBarbaH = G(new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55));
  const gPerna = G(new THREE.CylinderGeometry(0.1, 0.075, 0.66, 8)); gPerna.translate(0, -0.33, 0);
  const gBota = G(new THREE.CylinderGeometry(0.095, 0.09, 0.3, 8));
  const gAba = G(new THREE.CylinderGeometry(0.25, 0.4, 0.44, 14, 1, true, Math.PI * 0.14, Math.PI * 1.72)); // coat tails, open in front
  const peles = [0xe3b58f, 0xc99a74, 0xa9744f, 0x8a5a3b, 0xd8a883].map((c) => std(c, c));
  const cabelos = [0x2b1b14, 0x4a2e1c, 0x7a4a24, 0x16100e].map((c) => std(c, c));
  const gPe = G(new THREE.BoxGeometry(0.15, 0.1, 0.27));
  const gEmbl = G(new THREE.PlaneGeometry(0.34, 0.42));
  const gAnel = G(new THREE.RingGeometry(0.62, 0.74, 28));
  const gHit = G(new THREE.CylinderGeometry(0.55, 0.55, 2.0, 8));
  const gAlarme = G(new THREE.ConeGeometry(0.22, 0.5, 4));
  const matEmbl = Mt(new THREE.MeshBasicMaterial({ map: emblema, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const matOlho = basic("#d4b27a");
  const matOlhoErr = basic("#ff5a4a");
  const matAnel = basic("#ece3d0", { transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false });
  const matAlarme = Mt(new THREE.MeshStandardMaterial({ color: 0xc1121f, emissive: 0xc1121f, emissiveIntensity: 1.2 }));
  const matHit = Mt(new THREE.MeshBasicMaterial({ visible: false }));
  const couro = std(0x5a3a26, 0x5a3a26);
  const faixaVermelha = std(0x9e1b24, 0x9e1b24);
  const pele = std(0xc99a74, 0xc99a74);
  const gBraco = G(new THREE.CylinderGeometry(0.09, 0.075, 0.46, 7)); gBraco.translate(0, -0.23, 0);
  const gMao = G(new THREE.SphereGeometry(0.085, 7, 6));
  const forro = std(0x6e1119, 0x6e1119, { side: THREE.DoubleSide });
  const mantoDuplo = std(0xcfc7b8, 0xe9e2d3, { side: THREE.DoubleSide });
  const calca = std(0x3a2f32, 0x4a3f42);
  const gCapa = G(new THREE.CylinderGeometry(0.3, 0.6, 0.95, 10, 1, true, Math.PI * 0.55, Math.PI * 0.9));
  const gBarra = G(new THREE.CylinderGeometry(0.52, 0.55, 0.08, 14, 1, true));
  const gFivela = G(new THREE.BoxGeometry(0.15, 0.15, 0.05));
  const gTira = G(new THREE.BoxGeometry(0.08, 0.6, 0.04));
  const gOmbro = G(new THREE.SphereGeometry(0.17, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2));
  const gDebrum = G(new THREE.TorusGeometry(0.2, 0.022, 5, 16, Math.PI));
  const gSash = G(new THREE.BoxGeometry(0.13, 0.4, 0.03));
  const gOculta = G(new THREE.BoxGeometry(0.03, 0.24, 0.04));
  const gPunho = G(new THREE.CylinderGeometry(0.095, 0.095, 0.14, 7));
  const gCinto = G(new THREE.CylinderGeometry(0.38, 0.42, 0.16, 12, 1, true));
  const gLamina = G(new THREE.BoxGeometry(0.035, 0.75, 0.09)); gLamina.translate(0, -0.42, 0);
  const gGuarda = G(new THREE.BoxGeometry(0.09, 0.05, 0.26));
  const gArco = G(new THREE.TorusGeometry(0.46, 0.035, 6, 22, Math.PI)); gArco.rotateZ(-Math.PI / 2); gArco.rotateY(-Math.PI / 2);
  const gHaste = G(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6)); gHaste.rotateX(Math.PI / 2);
  const gSeta = G(new THREE.ConeGeometry(0.07, 0.18, 6)); gSeta.rotateX(Math.PI / 2);
  const matFlecha = std(0xd8c9a6, 0x8b6440);
  const flechaNova = () => { const f = new THREE.Group(); const h = new THREE.Mesh(gHaste, matFlecha); const s = new THREE.Mesh(gSeta, aco); s.position.z = 0.48; f.add(h, s); return f; };

  interface P { faca: THREE.Mesh; id: string; bracoF: THREE.Group; bracoT: THREE.Group; espada: THREE.Group; arco: THREE.Group; encaixada: THREE.Group; naMao: THREE.Group; root: THREE.Group; corpo: THREE.Group; capuz: THREE.Group; pes: THREE.Group[]; olhos: THREE.Mesh[]; anel: THREE.Mesh; alarme: THREE.Mesh; manto: THREE.Mesh; hit: THREE.Mesh; yaw: number; px: number; pz: number; i: number }
  const personagens = new Map<string, P>();
  const hits: THREE.Object3D[] = [];
  for (const id of ORDEM) {
    const m = membro(id), a = { id, ...cena.poses[id]! };
    const root = new THREE.Group();
    const corpo = new THREE.Group(); root.add(corpo);
    const mt = new THREE.Mesh(gManto, manto); mt.position.y = 1.0; mt.castShadow = true; corpo.add(mt);
    const fx = new THREE.Mesh(gFaixa, matGrupo(m.grupo.id, m.grupo.cor)); fx.position.y = 0.52; fx.scale.set(0.82, 0.6, 0.82); corpo.add(fx);
    const capuz = new THREE.Group(); capuz.position.y = 1.5; corpo.add(capuz);
    const cb = new THREE.Mesh(gCapuz, mantoDuplo); cb.scale.set(1.02, 1.08, 1.05); cb.position.set(0, 0.015, -0.02); cb.castShadow = true; capuz.add(cb);
    const cp = new THREE.Mesh(gPonta, manto); cp.position.set(0, 0.2, 0.06); cp.rotation.x = 0.85; cp.scale.set(0.55, 0.6, 0.55); cp.castShadow = true; capuz.add(cp);
    const n = personagens.size, pele = peles[n % peles.length]!, cabelo = cabelos[n % cabelos.length]!;
    const rs = new THREE.Mesh(gRosto, pele); rs.position.set(0, -0.02, 0.02); rs.scale.set(0.92, 1.1, 0.95); rs.castShadow = true; capuz.add(rs);
    const nariz = new THREE.Mesh(gNariz, pele); nariz.position.set(0, -0.04, 0.19); capuz.add(nariz);
    if (n % 3) { const bb = new THREE.Mesh(gBarbaH, cabelo); bb.position.set(0, -0.07, 0.075); bb.scale.set(1.1, 1, 1); capuz.add(bb); }
    for (const ox of [-0.058, 0.058]) { const iris = new THREE.Mesh(gOlho, rosto); iris.position.set(ox, 0.015, 0.172); capuz.add(iris); }
    const olhos = [-0.07, 0.07].map((ox) => { const e = new THREE.Mesh(gOlho, matOlho); e.position.set(ox * 0.83, 0.015, 0.19); e.visible = false; capuz.add(e); return e; });
    const gi = new THREE.Mesh(insignia(m.grupo.id), matGrupo(m.grupo.id, m.grupo.cor)); gi.position.set(0.1, 1.1, 0.3); gi.rotation.x = -0.1; gi.scale.setScalar(0.7); corpo.add(gi);
    const costas = new THREE.Group(); costas.position.y = 1.02; costas.rotation.y = Math.PI; corpo.add(costas);
    const em = new THREE.Mesh(gEmbl, matEmbl); em.position.z = 0.3; em.rotation.x = -0.1; em.scale.setScalar(0.7); costas.add(em);
    const cinto = new THREE.Mesh(gCinto, faixaVermelha); cinto.position.y = 0.74; cinto.scale.set(0.66, 1, 0.66);
    const abas = new THREE.Mesh(gAba, mantoDuplo); abas.position.y = 0.5; abas.castShadow = true; corpo.add(abas); corpo.add(cinto);
    // half cape, coat lining, belt buckle, chest harness, pauldron and hood trim
    const capa = new THREE.Mesh(gCapa, forro); capa.position.y = 0.82; capa.scale.set(0.82, 1.05, 0.82); capa.castShadow = true; corpo.add(capa);
    const barra = new THREE.Mesh(gBarra, faixaVermelha); barra.position.y = 0.3; barra.scale.set(0.76, 0.7, 0.76); corpo.add(barra);
    const fivela = new THREE.Mesh(gFivela, ouro); fivela.position.set(0, 0.74, 0.28); corpo.add(fivela);
    const tira = new THREE.Mesh(gTira, couro); tira.position.set(0, 1.0, 0.28); tira.rotation.set(-0.08, 0, 0.75); corpo.add(tira);
    const ombro = new THREE.Mesh(gOmbro, couro); ombro.position.set(-0.35, 1.24, 0); ombro.castShadow = true; corpo.add(ombro);
    const debrum = new THREE.Mesh(gDebrum, matGrupo(m.grupo.id, m.grupo.cor)); debrum.position.set(0, 0.02, 0.15); debrum.scale.setScalar(0.95); capuz.add(debrum);
    const aba = new THREE.Mesh(gSash, faixaVermelha); aba.position.set(0.08, 0.52, 0.33); aba.rotation.x = -0.2; corpo.add(aba);
    const braco = (lado: number) => {
      const b = new THREE.Group(); b.position.set(lado * 0.35, 1.22, 0); b.scale.y = 1.12; corpo.add(b);
      const manga = new THREE.Mesh(gBraco, manto); manga.castShadow = true; b.add(manga);
      const punho = new THREE.Mesh(gPunho, couro); punho.position.y = -0.38; b.add(punho);
      const oculta = new THREE.Mesh(gOculta, aco); oculta.position.set(0, -0.5, 0.09); b.add(oculta);
      const mao = new THREE.Mesh(gMao, pele); mao.position.y = -0.5; b.add(mao);
      return b;
    };
    const bracoF = braco(-1), bracoT = braco(1);
    const espada = new THREE.Group(); espada.position.y = -0.5; bracoF.add(espada);
    espada.add(new THREE.Mesh(gLamina, aco), new THREE.Mesh(gGuarda, ouro)); espada.visible = false;
    const arco = new THREE.Group(); arco.position.set(0, 1.2, 0.6); corpo.add(arco); arco.add(new THREE.Mesh(gArco, couro)); arco.visible = false;
    const encaixada = flechaNova(); arco.add(encaixada);
    const faca = new THREE.Mesh(gOculta, aco); faca.position.y = -0.66; faca.scale.set(1.6, 1.3, 1.6); bracoF.add(faca); faca.visible = false;
    const naMao = flechaNova(); naMao.position.y = -0.55; naMao.rotation.x = 0.8; bracoF.add(naMao); naMao.visible = false;
    const pes = [-0.12, 0.12].map((px) => {
      const f = new THREE.Group(); f.position.set(px, 0.72, 0); root.add(f);
      const coxa = new THREE.Mesh(gPerna, calca); coxa.castShadow = true; f.add(coxa);
      const bota = new THREE.Mesh(gBota, couro); bota.position.y = -0.52; f.add(bota);
      const pe = new THREE.Mesh(gPe, couro); pe.position.set(0, -0.67, 0.07); pe.castShadow = true; f.add(pe);
      return f;
    });
    const anel = new THREE.Mesh(gAnel, matAnel); anel.rotation.x = -Math.PI / 2; anel.position.y = 0.05; anel.visible = false; anel.renderOrder = 5; root.add(anel);
    const alarme = new THREE.Mesh(gAlarme, matAlarme); alarme.position.y = 2.7; alarme.rotation.x = Math.PI; alarme.visible = false; root.add(alarme);
    const hit = new THREE.Mesh(gHit, matHit); hit.position.y = 1; hit.userData["id"] = a.id; root.add(hit); hits.push(hit);
    root.scale.setScalar(1.3);
    mundo.add(root);
    personagens.set(a.id, { faca, id: a.id, bracoF, bracoT, espada, arco, encaixada, naMao, root, corpo, capuz, pes, olhos, anel, alarme, manto: mt, hit, yaw: 0, px: paraMundo(a.x, a.y).x, pz: paraMundo(a.x, a.y).z, i: personagens.size });
  }

  // arrows in flight or stuck in a target, and the sparks where blades meet
  const setas = Array.from({ length: 9 }, (_, i) => { const f = flechaNova(); f.rotation.y = Math.PI / 2; if (i >= 6) f.scale.set(1.6, 1.6, 0.45); f.visible = false; mundo.add(f); return f; });
  const gFaisca = G(new THREE.OctahedronGeometry(0.16));
  const matFaisca = basic("#ffd36b");
  const faiscas = Array.from({ length: 8 }, () => { const f = new THREE.Mesh(gFaisca, matFaisca); f.visible = false; mundo.add(f); return f; });

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
    chaveSalas = "-"; montarSalas(plano.salas); chaveSalas = plano.salas.map((s) => s.nome).join("|");
    scene.background = new THREE.Color(c ? 0xe9dec3 : 0x0c0809);
    hemi.color.set(c ? 0xfff4d6 : 0x5668b8); hemi.groundColor.set(c ? 0xb59a6e : 0x2a1a1c); hemi.intensity = c ? 1.5 : 1.35;
    sol.color.set(c ? 0xfff0c8 : 0x9fb4ff); sol.intensity = c ? 2.4 : 0.8;
    luzes.tocha = c ? 7 : 30; luzGauge.intensity = c ? 10 : 40;
    renderer.toneMappingExposure = c ? 1.0 : 1.25;
    for (const l of preenche) l.intensity = c ? 20 : 90;
    for (const t of tochas) t.luz.intensity = luzes.tocha;
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
    for (const id of ORDEM) {
      const p = personagens.get(id); const pose = cena.poses[id];
      if (!p || !pose) continue;
      const w = paraMundo(pose.x, pose.y);
      const dx = w.x - p.px, dz = w.z - p.pz;
      const andando = pose.gesto === "anda";
      p.px = w.x; p.pz = w.z;
      const at = est.atividade[id];
      const ativo = !!at?.ativo, falhou = !!at?.falhou;
      // face the opponent or the target while training, the way they walk, or the front
      const parado = pose.gesto === "descanso" && pose.arma === "nada";
      const alvoYaw = andando && Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : pose.gesto === "sobe" ? Math.PI : parado ? 0 : (pose.face * Math.PI) / 2;
      p.yaw = calmo ? alvoYaw : lerpAng(p.yaw, alvoYaw, 0.3);
      p.root.position.set(w.x, (pose.alt ?? 0) * ESCALA, w.z);
      p.root.rotation.set(Math.abs(pose.giro ?? 0) * (Math.PI / 180), p.yaw, 0, "YXZ");
      p.root.visible = !pose.oculto;
      const gesto = bracos(pose);
      const rad = Math.PI / 180;
      p.bracoF.rotation.x = -gesto.frente * rad;
      p.bracoT.rotation.x = -gesto.tras * rad;
      p.espada.visible = pose.arma === "espada";
      p.arco.visible = pose.arma === "arco";
      p.naMao.visible = pose.arma === "flecha";
      p.faca.visible = pose.arma === "faca";
      p.encaixada.visible = pose.gesto === "mira";
      p.encaixada.position.z = 0.1 - (pose.gesto === "mira" ? pose.k * 0.45 : 0);
      const sw = andando ? gesto.perna : 0;
      const golpe = pose.gesto === "ataca" ? Math.sin(pose.k * Math.PI) : 0;
      p.corpo.position.set(0, Math.abs(sw) * 0.07, golpe * 0.12);
      p.corpo.rotation.set(golpe * 0.18, 0, sw * 0.05);
      p.capuz.rotation.x = ativo && !andando && !calmo ? Math.sin(t / 260) * 0.09 : 0;
      const passo = andando ? sw : gesto.perna * 0.6;
      p.pes[0]!.rotation.x = -passo * 0.6;
      p.pes[1]!.rotation.x = passo * 0.6;
      const olhar = ativo || falhou;
      for (const e of p.olhos) { e.visible = olhar; e.material = falhou ? matOlhoErr : matOlho; }
      p.alarme.visible = falhou;
      if (falhou) { p.alarme.position.y = 2.7 + (calmo ? 0 : Math.sin(t / 220) * 0.12); p.alarme.rotation.y = calmo ? 0 : t / 400; }
      const marcado = est.selecionado === id || hover === id;
      p.anel.visible = marcado;
    }
    setas.forEach((m, i) => { const f = cena.flechas[i]; m.visible = !!f?.visivel; if (f?.visivel) m.position.set(paraMundo(f.x, 0).x, 1.45 - (f.dy ?? 0) * ESCALA, paraMundo(0, f.y).z); });
    faiscas.forEach((m, i) => { const f = cena.faiscas[i]; m.visible = !!f; if (f) { const w = paraMundo(f.x, f.y + 39); m.position.set(w.x, 1.55, w.z); m.rotation.y = t / 90; } });
    // torches flicker (frozen in the static frame)
    for (const k of tochas) {
      const f = calmo ? 1 : 0.84 + 0.16 * Math.sin(t * 0.011 + k.i * 1.7) * Math.sin(t * 0.0073 + k.i) + 0.06 * Math.sin(t * 0.031 + k.i * 3);
      k.luz.intensity = luzes.tocha * f; k.chama.scale.y = 0.85 + 0.3 * f;
    }
    atualizarGauge(agora, t);
    controles?.update();
    // HTML bubbles follow the heads
    const r = canvas.getBoundingClientRect(); const W = r.width, H = r.height;
    for (const [id, el] of o.bolhas()) {
      const p = personagens.get(id); if (!p) continue;
      v.set(p.px, 2.45 + (p.alarme.visible ? 0.5 : 0), p.pz).project(camera);
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
    if (t - ultimo >= FPS_MS) {
      const dt = ultimo === 0 ? FPS_MS : t - ultimo; ultimo = t;
      cena = treino(t, dt, plano.lugar, ORDEM);
      desenhar(t);
    }
    raf = requestAnimationFrame(quadro);
  };
  const parte = () => { if (!calmo && permitido() && raf === 0) { ultimo = 0; raf = requestAnimationFrame(quadro); } };
  /** Static pose (reduced motion): everyone already where they belong. */
  const parar = () => { cena = treino(0, 0, plano.lugar, ORDEM, true); };
  function pedir() {
    if (!calmo || pendente || morto) return;
    pendente = true;
    requestAnimationFrame((t) => { pendente = false; if (!morto && calmo) { parar(); desenhar(t); } });
  }
  const io = "IntersectionObserver" in window ? new IntersectionObserver((e) => { visivel = !!e[e.length - 1]?.isIntersecting; parte(); }) : undefined;
  io?.observe(o.host);
  const ro = new ResizeObserver(ajustar); ro.observe(o.host);
  document.addEventListener("visibilitychange", parte);
  ajustar();
  if (calmo) { parar(); pedir(); } else parte();

  return {
    atualizar(e) {
      est = e;
      plano = dispor(e.atividade);
      const chave = plano.salas.map((s) => s.nome).join("|");
      if (chave !== chaveSalas) { chaveSalas = chave; montarSalas(plano.salas); }
      if (calmo) pedir();
    },
    setCalmo(c) {
      if (c === calmo) return;
      calmo = c;
      if (controles) controles.enableDamping = !c;
      if (c) { cancelAnimationFrame(raf); raf = 0; parar(); pedir(); } else parte();
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
      for (const x of descarte) x.dispose();
      for (const a of Object.values(aneis)) a.fill.geometry.dispose();
      sol.shadow.map?.dispose();
      renderer.dispose();
      if (!ctxPerdido) renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
