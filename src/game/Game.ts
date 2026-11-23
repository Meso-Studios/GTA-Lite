// Main game engine: renderer, loop, player, world simulation, HUD data.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BOUNDS, DECK, HALF, MovementState, NB, Rng, WEAPONS, WEAPON_ORDER, WEAPON_SHOP_ORDER, WeaponId,
  applySandFootPhysics, blockCenter, clamp, createMovementState, dampAngle, districtNameAt, groundHeight,
  isMeleeWeapon, lerp, nearestNode, sandFactorAt, smooth, stepMovementState, surfaceAt,
} from './config';
import { buildCity, CityData } from './city';
import { Room, roomForDoor } from './interiors';
import type { Door } from './buildings';
import { Vehicle } from './vehicle';
import { Ped, PedKind } from './ped';
import { Prop, Pickup, PickKind, Grenade, Rocket } from './props';
import { FX } from './fx';
import { GameAudio } from './audio';
import { World, PushOut } from './world';
import { PLAYER_LOOK, TARGET_LOOK, GunKind, animateHuman, createHuman, gangLook, guardLook, HumanRig, setWeapon, civilianLook } from './humans';
import { VehicleType, beamMaterial, headMat, tailDim, sirenRed, sirenBlue, paintMat } from './vehicles';
import { castRay, explode as doExplode, npcShoot as doNpcShoot, playerFire, playerMelee } from './combat';
import { MapRenderer, buildRoute } from './minimap';
import { SpawnOpts, deployCops as doDeploy, removeVehicle, spawnVehicle as doSpawnVehicle, streamCrowds, streamParked, streamPeds, streamTraffic, updatePolice } from './spawn';
import { MISSIONS, MissionDef } from './missions';
import { Look } from './humans';
import { Collider } from './world';

export interface Quality { traffic: number; parked: number; peds: number; shadows: boolean; bloom: boolean; pr: number; msaa: number; shadowSize: number }
export const QUALITY: Record<string, Quality> = {
  low: { traffic: 12, parked: 18, peds: 26, shadows: false, bloom: false, pr: 1, msaa: 0, shadowSize: 1024 },
  medium: { traffic: 22, parked: 34, peds: 42, shadows: true, bloom: true, pr: 1, msaa: 0, shadowSize: 1024 },
  high: { traffic: 30, parked: 48, peds: 56, shadows: true, bloom: true, pr: Math.min(window.devicePixelRatio || 1, 1.5), msaa: 4, shadowSize: 2048 },
};

export interface Goal { x: number; z: number; kind: 'goal' | 'enemy' | 'vehicle' | 'item'; r: number; label?: string; beam?: boolean }
export interface HudState {
  hp: number; armor: number; stamina: number; money: number; wanted: number; searching: boolean;
  weapon: string; weaponIdx: number; weaponCount: number; ammo: number | null; time: string;
  mission: { title: string; objective: string; timer: number | null; timerLabel: string; progress: number | null } | null;
  subtitle: { who: string; text: string } | null;
  prompt: string | null;
  speed: number | null; vehicleName: string | null; vehicleHp: number | null; radio: string | null;
  packages: [number, number];
  finder: { on: boolean; dist: number; angle: number } | null;
  aiming: boolean; crosshair: boolean; hurt: number; fps: number; mapOpen: boolean; paused: boolean; locked: boolean; scope: boolean; allies: number; recruitable: number; grenades: number; indoor: string | null;
  nextMission: string | null;
  crouching: boolean; sliding: boolean; district: string; surface: string; sandGrip: boolean; coords: [number, number];
}
export interface GameEvents {
  onHud(h: HudState): void;
  onToast(text: string, kind?: 'info' | 'cash' | 'warn' | 'good'): void;
  onBanner(kind: 'wasted' | 'passed' | 'failed' | null, title?: string, sub?: string): void;
  onLock(locked: boolean): void;
}

const _po: PushOut = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const SKY_FS = `
varying vec3 vDir; uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; uniform float time;
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(vec3(i,0.)),hash(vec3(i+vec2(1,0),0.)),f.x), mix(hash(vec3(i+vec2(0,1),0.)),hash(vec3(i+vec2(1,1),0.)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.1; a*=.5;} return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y,0.,1.);
  vec3 col = mix(hor, top, pow(h, 0.5));
  if (d.y < 0.) col = hor*0.75;
  float sd = max(dot(d, sunDir), 0.);
  col += sunCol * (pow(sd, 8.)*0.35 + pow(sd, 400.)*6.0);
  float sh = hash(floor(d*260.));
  col += vec3(step(0.9978, sh))*night*smoothstep(0.05,0.4,d.y)*(0.5+0.5*hash(floor(d*260.)+1.));
  float md = max(dot(d, -sunDir),0.); col += vec3(0.8,0.86,1.0)*pow(md,1200.)*3.0*night;
  if (d.y>0.015){
    vec2 uv = d.xz/(d.y+0.18)*1.1 + vec2(time*0.006, time*0.002);
    float c = smoothstep(0.52,0.9,fbm(uv*1.6));
    vec3 cc = mix(vec3(1.0), hor*1.1+vec3(0.1), 0.35 + 0.4*(1.0-night))*(1.0-night*0.88);
    col = mix(col, cc, c*0.75*smoothstep(0.015,0.22,d.y));
  }
  gl_FragColor = vec4(col,1.);
}`;
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f6fc4) }, hor: { value: new THREE.Color(0x9cc3e6) }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color(1, 0.9, 0.7) }, night: { value: 0 }, time: { value: 0 },
    },
    vertexShader: SKY_VS, fragmentShader: SKY_FS,
  });
}

export class Game {
  // ------------------------------------------------------------- three
  renderer: THREE.WebGLRenderer;
  isSoftwareGl = false;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  spots: THREE.SpotLight[] = [];
  frustum = new THREE.Frustum();
  projM = new THREE.Matrix4();
  container: HTMLElement;
  quality: Quality;
  // ------------------------------------------------------------- world
  city: CityData;
  world: World;
  vehicles: Vehicle[] = [];
  peds: Ped[] = [];
  props: Prop[] = [];
  pickups: Pickup[] = [];
  fx: FX;
  audio = new GameAudio();
  mapR: MapRenderer;
  ev: GameEvents;
  time = 0;
  dt = 0.016;
  hour = 9.4;
  timeScale = 1;
  dayLength = 30; // real seconds per in-game hour
  night = 0;
  // ------------------------------------------------------------- player
  player = {
    x: -297.5, y: 0.16, z: 30, yaw: Math.PI / 2, vx: 0, vz: 0, vy: 0, onGround: true, hp: 100, armor: 0, money: 500,
    weapon: 'pistol' as WeaponId,
    ammo: {
      fists: 0, bat: 0, katana: 0, pistol: 120, silenced: 80, revolver: 36, smg: 180,
      shotgun: 24, autoshotgun: 0, rifle: 120, carbine: 0, lmg: 0, sniper: 16, rpg: 3, grenade: 4,
    } as Record<WeaponId, number>,
    owned: new Set<WeaponId>(['fists', 'bat', 'katana', 'pistol', 'silenced', 'revolver', 'smg', 'shotgun', 'rifle', 'sniper', 'rpg', 'grenade']),
    rig: null as unknown as HumanRig, vehicle: null as Vehicle | null,
    alive: true, fireT: 0, punchT: 0, jumpT: 0, hurtT: 0,
    move: createMovementState(0.16) as MovementState,
    stepT: 0,
    sandPuffT: 0,
    eyeH: 1.55,
  };
  wanted = 0;
  lastSeen = 0;
  playerFiring = false;
  firingT = 0;
  playerK = 4; playerL = 4;
  playerSpeed = 0;
  // ------------------------------------------------------------- camera
  camYaw = Math.PI / 2;
  camPitch = 0.28;
  camDir = new THREE.Vector3(0, 0, 1);
  camX = 0; camZ = 0;
  camDist = 4.6;
  shakeAmt = 0;
  lastMouse = 0;
  // ------------------------------------------------------------- input
  input = { keys: new Set<string>(), pressed: new Set<string>(), fire: false, aim: false, mx: 0, my: 0, dx: 0, dy: 0, locked: false };
  // ------------------------------------------------------------- state
  state: 'playing' | 'paused' | 'dead' = 'playing';
  deadT = 0;
  mapOpen = false;
  running = false;
  raf = 0;
  last = 0;
  hudT = 0;
  mapT = 0;
  fpsAcc = 0; fpsN = 0; fps = 60;
  minimap: HTMLCanvasElement | null = null;
  fullmap: HTMLCanvasElement | null = null;
  prompt: string | null = null;
  // missions / goals
  goals: Goal[] = [];
  waypoint: { x: number; z: number } | null = null;
  route: [number, number][] | null = null;
  routeT = 0;
  missionIdx = 0;
  mission: { def: MissionDef; s: any } | null = null;
  objective = '';
  timer: { t: number | null; label: string } = { t: null, label: '' };
  progress: number | null = null;
  subQ: { who: string; text: string; dur: number; after?: () => void }[] = [];
  sub: { who: string; text: string; t: number } | null = null;
  markers: THREE.Group[] = [];
  packagesFound = 0;
  packagesTotal = 0;
  finderOn = false;
  finderT = 0;
  radioStation = 0;
  radioBeforeExit = 0;
  hornT = 0;
  pickupsCount = 0;
  debris: Prop[] = [];

  constructor(container: HTMLElement, quality: string, ev: GameEvents) {
    this.container = container;
    this.ev = ev;
    this.quality = QUALITY[quality] ?? QUALITY.medium;
    const Q = this.quality;
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    this.isSoftwareGl = /swiftshader|llvmpipe|software|mesa/i.test(renName);

    const shadowsOn = Q.shadows && !this.isSoftwareGl;
    const bloomOn = Q.bloom && !this.isSoftwareGl;
    const pr = this.isSoftwareGl ? 1 : Q.pr;

    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = shadowsOn;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.35, 5800);
    this.scene.add(this.camera);

    // postprocessing (bypass composer on software WebGL for responsive frame pacing)
    if (!this.isSoftwareGl) {
      const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: Q.msaa });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.62, 0.92);
      this.bloom.enabled = bloomOn;
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    // upgraded 3-tone atmospheric lighting rig
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x7a6852, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 3.2);
    this.sun.castShadow = shadowsOn;
    this.sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 1; sc.far = 650;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.3;
    this.scene.add(this.sun, this.sun.target);
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(0xfff0cf, 0, 75, 0.5, 0.6, 1.4);
      this.scene.add(s, s.target);
      this.spots.push(s);
    }

    // sky + PMREM RoomEnvironment for crisp PBR metallic/glass/car paint reflections
    this.skyMat = skyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4400, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0x9cc3e6, 220, 2900);
    if (!this.isSoftwareGl) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      this.scene.environment = pm.fromScene(envScene, 0.04).texture;
      envScene.dispose();
      pm.dispose();
    } else {
      this.hemi.intensity = 1.25;
    }

    // world
    this.city = buildCity();
    this.world = this.city.world;
    this.rooms = this.city.rooms ?? [];
    this.scene.add(this.city.group);
    this.fx = new FX(this.scene);
    this.mapR = new MapRenderer(this.city);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffe8c4, 0, 34, 1.8);
      this.scene.add(l);
      this.intLights.push(l);
    }
    this.spawnAllies();
    this.spawnHighwayCars();
    // markers
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 70, 20, 1, true).translate(0, 35, 0), new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2).translate(0, 0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2).translate(0, 0.25, 0), new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
      g.add(beam, ring, disc);
      g.visible = false;
      this.scene.add(g);
      this.markers.push(g);
    }
    // player
    this.player.rig = createHuman(PLAYER_LOOK);
    this.scene.add(this.player.rig.root);
    setWeapon(this.player.rig, 'pistol');
    // props
    for (const p of this.city.props) {
      const pr = new Prop(p.kind, p.x, p.z);
      this.props.push(pr);
      this.scene.add(pr.mesh);
    }
    this.setupPickups();
    this.setupInput();
    this.applyTime(0);
    this.updateCamera(0.016, true);
    // initial population (traffic, parked, peds, tourist crowds)
    for (let i = 0; i < 60; i++) {
      streamTraffic(this, 1);
      streamParked(this, 1);
      streamPeds(this, 1);
      streamCrowds(this, 1);
    }
    this.sayLater('Sal', 'Welcome to San Nova. Explore the 10km region, hit the Golden Dunes, or step into the yellow marker for work.', 7, 2);
    this.audio.setStation(0);
    window.addEventListener('resize', this.onResize);
  }

  // =============================================================== setup helpers
  setupPickups() {
    const add = (k: PickKind, x: number, z: number, v = 0, w = '') => {
      const p = new Pickup(k, x, z, v, w);
      p.group.position.set(x, groundHeight(x, z) + 0.95, z);
      this.scene.add(p.group);
      this.pickups.push(p);
      return p;
    };
    const pl = this.city.places;
    if (pl.hospital) { add('health', pl.hospital.x - 3, pl.hospital.z, 50); add('health', pl.hospital.x + 3, pl.hospital.z, 50); add('armor', pl.hospital.x, pl.hospital.z + 2.2, 50); }
    if (pl.police) { add('armor', pl.police.x - 6, pl.police.z, 50); add('weapon', pl.police.x + 6, pl.police.z, 120, 'carbine'); }
    add('weapon', -228, -255, 120, 'smg');
    add('weapon', 395, 287, 24, 'sniper');
    add('weapon', 0, -168, 6, 'grenade');
    add('weapon', -160, 238, 0, 'katana');
    add('weapon', 342, -300, 32, 'autoshotgun');
    add('weapon', 456, 120, 120, 'rifle');
    add('weapon', -280, 18, 36, 'revolver');
    add('weapon', -145, 560, 200, 'lmg');
    add('weapon', 300, 2380, 5, 'rpg');
    add('weapon', -2180, 1210, 48, 'autoshotgun');
    add('health', -297, 55, 40);
    add('armor', 114, 56, 50);
    add('health', 228, 180, 50);
    add('weapon', -120, 215, 120, 'smg');
    add('weapon', 0, 395, 24, 'shotgun');
    // hidden packages
    const r = new Rng(4242);
    const spots: { x: number; z: number }[] = [...this.city.collect];
    while (spots.length < 24) {
      const bi = r.int(0, NB - 1), bj = r.int(0, NB - 2);
      const bx = blockCenter(bi), bz = blockCenter(bj);
      const side = r.int(0, 3);
      const t = r.range(-36, 36);
      const x = side === 0 ? bx + t : side === 1 ? bx + 44.5 : side === 2 ? bx + t : bx - 44.5;
      const z = side === 0 ? bz - 44.5 : side === 1 ? bz + t : side === 2 ? bz + 44.5 : bz + t;
      spots.push({ x, z });
    }
    spots.slice(0, 24).forEach((s) => add('package', s.x, s.z, 250));
    this.packagesTotal = 24;
  }

  setupInput() {
    const k = this.input;
    const el = this.renderer.domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('contextmenu', this.onCtx);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    el.addEventListener('click', this.onCanvasClick);
    void k;
  }
  onKeyDown = (e: KeyboardEvent) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.input.keys.add(e.code);
    this.input.pressed.add(e.code);
    if (e.code === 'KeyM' && this.state === 'playing') { this.setMapOpen(!this.mapOpen); return; }
    if (e.code === 'Escape' && this.mapOpen) { this.setMapOpen(false); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
  };
  onKeyUp = (e: KeyboardEvent) => { this.input.keys.delete(e.code); };
  onMouseMove = (e: MouseEvent) => {
    this.input.mx = e.clientX; this.input.my = e.clientY;
    if (this.input.locked) { this.input.dx += e.movementX; this.input.dy += e.movementY; }
  };
  onMouseDown = (e: MouseEvent) => {
    if (this.state !== 'playing') return;
    if (e.button === 0) this.input.fire = true;
    if (e.button === 2) this.input.aim = true;
  };
  onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.input.fire = false;
    if (e.button === 2) this.input.aim = false;
  };
  onWheel = (e: WheelEvent) => {
    if (this.state !== 'playing' || this.player.vehicle) return;
    this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
  };
  onCtx = (e: Event) => e.preventDefault();
  onLockChange = () => {
    const wasLocked = this.input.locked;
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.input.locked = locked;
    this.ev.onLock(locked);
    if (wasLocked && !locked && this.state === 'playing' && this.running && !this.mapOpen) this.setPaused(true);
  };
  onLockError = () => { this.lockFailed = true; };
  onCanvasClick = () => {
    this.audio.init();
    if (this.state === 'playing' && !this.input.locked) this.requestLock();
  };
  onResize = () => {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
  requestLock() {
    try {
      const p = (this.renderer.domElement as any).requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignore */ }
  }

  togglePause() { this.setPaused(this.state === 'playing'); }
  setPaused(p: boolean) {
    if (this.state === 'dead') return;
    if (p) {
      this.state = 'paused';
      this.input.fire = false; this.input.aim = false;
      if (document.pointerLockElement) document.exitPointerLock();
      this.ev.onLock(false);
    } else {
      this.state = 'playing';
      this.audio.init();
      this.requestLock();
    }
    this.audio.setEngine(false, 0, 0);
    this.audio.setSiren(0);
    this.emitHud(true);
  }

  teleport(x: number, z: number, yaw?: number) {
    const p = this.player;
    if (this.interior) this.exitInterior();
    if (p.vehicle) this.exitVehicle();
    p.x = x; p.z = z;
    p.y = groundHeight(x, z);
    p.vx = 0; p.vz = 0; p.vy = 0;
    p.move.y = p.y; p.move.vx = 0; p.move.vy = 0; p.move.vz = 0; p.move.onGround = true;
    if (yaw !== undefined) { p.yaw = yaw; this.camYaw = yaw; }
    p.rig.root.position.set(p.x, p.y, p.z);
    for (let i = 0; i < 6; i++) streamCrowds(this, 1);
    this.updateCamera(0.016, true);
    this.emitHud(true);
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this.audio.init();
    this.requestLock();
    this.emitHud(true);
    if (!(window as any).__noAutoRun) this.raf = requestAnimationFrame(this.frame);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('contextmenu', this.onCtx);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.setEngine(false, 0, 0);
    this.audio.setSiren(0);
    this.audio.setStation(0);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
  attachMinimap(c: HTMLCanvasElement | null) { this.minimap = c; }
  attachFullmap(c: HTMLCanvasElement | null) { this.fullmap = c; }
  setMapOpen(o: boolean) {
    this.mapOpen = o;
    if (o && document.pointerLockElement) document.exitPointerLock();
    if (!o && this.state === 'playing') this.requestLock();
  }
  mapClick(px: number, py: number) {
    if (!this.fullmap) return;
    const [x, z] = this.mapR.toWorld(this.fullmap, px, py);
    this.waypoint = { x, z };
    this.routeT = 0;
    this.ev.onToast('GPS waypoint set', 'info');
  }

  // =============================================================== accessors for entity modules
  get playerX() { return this.player.x; }
  get playerZ() { return this.player.z; }
  get playerVX() { return this.player.vehicle ? this.player.vehicle.vx : this.player.vx; }
  get playerVZ() { return this.player.vehicle ? this.player.vehicle.vz : this.player.vz; }
  get playerOnFoot() { return !this.player.vehicle; }
  get playerAlive() { return this.player.alive; }
  get playerVehicle() { return this.player.vehicle; }
  inView(x: number, z: number, r: number) {
    return this.frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(x, 1, z), r));
  }
  groundAt(x: number, z: number, curY = 0) { return this.interior ? 0.26 : groundHeight(x, z, curY); }
  panOf(x: number, z: number) {
    const dx = x - this.camX, dz = z - this.camZ;
    const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
    return clamp((dx * rx + dz * rz) / (Math.hypot(dx, dz) + 5), -0.8, 0.8);
  }
  shake(a: number) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  kick(a: number) { this.camPitch = clamp(this.camPitch + a, -0.5, 1.3); }
  addPed(p: Ped) { this.peds.push(p); this.scene.add(p.rig.root); }
  removePed(p: Ped) {
    const i = this.peds.indexOf(p);
    if (i >= 0) this.peds.splice(i, 1);
    p.dispose(this);
  }
  spawnVehicle(type: VehicleType, x: number, z: number, yaw: number, o: SpawnOpts = {}) { return doSpawnVehicle(this, type, x, z, yaw, o); }
  spawnEnemy(kind: PedKind, x: number, z: number, o: { weapon?: GunKind; look?: Look; hp?: number; sight?: number; aggro?: boolean; tag?: string; dmg?: number; acc?: number } = {}) {
    const rng = new Rng((Math.random() * 1e9) | 0);
    const look = o.look ?? (kind === 'guard' ? guardLook(rng) : kind === 'target' ? TARGET_LOOK : gangLook(rng, rng.pick([0x7d1f1f, 0x1f3d7d, 0x4b1f7d, 0x111111])));
    const p = new Ped(kind, look);
    p.hostile = true;
    p.hp = p.maxHp = o.hp ?? 60;
    p.sight = o.sight ?? 38;
    p.aggro = !!o.aggro;
    p.tag = o.tag ?? '';
    p.mission = true;
    p.dmg = o.dmg ?? 6;
    p.accuracy = o.acc ?? 1;
    p.place(x, z);
    p.yaw = Math.random() * 6.28;
    p.arm(o.weapon ?? 'smg');
    this.addPed(p);
    return p;
  }
  spawnPickup(kind: PickKind, x: number, z: number, value: number, weapon = '') {
    if (this.pickups.length > 160) return;
    const p = new Pickup(kind, x, z, value, weapon);
    p.life = kind === 'package' ? -1 : 80;
    this.scene.add(p.group);
    this.pickups.push(p);
  }
  deployCops(car: Vehicle) { doDeploy(this, car); }
  npcShoot(p: Ped, acc: number) { doNpcShoot(this, p, acc); }
  explode(x: number, y: number, z: number, r: number, dmg: number, src: Vehicle | null) { doExplode(this, x, y, z, r, dmg, src); }
  spawnDebris(v: Vehicle) {
    for (let i = 0; i < 5; i++) {
      const p = new Prop('debris', v.x, v.z);
      p.y = 0.8;
      p.mesh.scale.set(1 + Math.random() * 1.5, 1 + Math.random(), 1 + Math.random());
      p.vx = (Math.random() - 0.5) * 16; p.vz = (Math.random() - 0.5) * 16; p.vy = 6 + Math.random() * 8;
      p.wx = (Math.random() - 0.5) * 14; p.wz = (Math.random() - 0.5) * 14;
      p.awake = true; p.life = 25;
      this.scene.add(p.mesh);
      this.props.push(p);
      this.debris.push(p);
    }
    if (this.debris.length > 40) {
      const o = this.debris.shift()!;
      this.scene.remove(o.mesh);
      const i = this.props.indexOf(o);
      if (i >= 0) this.props.splice(i, 1);
    }
  }

  // =============================================================== gameplay events
  crime(level: number, reason: string) {
    if (!this.player.alive) return;
    if (reason === 'cop-kill') this.wanted = Math.min(5, Math.max(this.wanted + 1, 3));
    else if (level > this.wanted) this.wanted = Math.min(5, level);
    this.lastSeen = this.time;
  }
  setWanted(n: number) {
    this.wanted = clamp(n, 0, 5);
    this.lastSeen = this.time;
  }
  hurtPlayer(dmg: number, _src: string) {
    const p = this.player;
    if (!p.alive || dmg <= 0) return;
    if (p.armor > 0) {
      const a = Math.min(p.armor, dmg * 0.7);
      p.armor -= a; dmg -= a;
    }
    p.hp -= dmg;
    p.hurtT = Math.min(1, p.hurtT + dmg / 25 + 0.2);
    if (p.hp <= 0) this.killPlayer();
  }
  alarm(x: number, z: number, radius: number, gunfire: boolean) {
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > radius) continue;
      if (!p.hostile) { if (p.state !== 'flee' || Math.random() < 0.2) p.flee(this, x, z, 8 + Math.random() * 5); }
      else if (gunfire && p.kind !== 'cop' && d < radius * 0.6) { p.aggro = true; }
    }
  }
  alertAround(src: Ped, radius: number) {
    for (const p of this.peds) if (p.hostile && !p.dead && !p.aggro && p.kind !== 'cop' && Math.hypot(p.x - src.x, p.z - src.z) < radius) p.aggro = true;
  }
  onPedKilled(p: Ped, byPlayer: boolean) {
    if (byPlayer && p.kind === 'cop') this.ev.onToast('Officer down! Wanted level increased', 'warn');
  }
  ejectPlayer(dead: boolean) {
    const p = this.player;
    const v = p.vehicle;
    if (!v) return;
    this.detachRig(v);
    p.vehicle = null;
    p.x = v.x + v.fz * 1.5; p.z = v.z - v.fx * 1.5;
    p.y = groundHeight(p.x, p.z);
    p.vx = v.vx * 0.6; p.vz = v.vz * 0.6; p.vy = 4;
    if (!dead) v.mode = 'idle';
    this.audio.setEngine(false, 0, 0);
    if (this.radioStation) this.audio.setStation(0);
  }
  killPlayer() {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    this.state = 'dead';
    this.deadT = 0;
    this.input.fire = false;
    const v = p.vehicle;
    if (v) { this.ejectPlayer(true); v.mode = 'idle'; }
    // ragdoll body
    const body = new Ped('civ', PLAYER_LOOK);
    body.tag = 'playerbody';
    body.place(p.x, p.z);
    body.yaw = p.yaw;
    this.addPed(body);
    body.kill(this, p.vx * 0.8 + (Math.random() - 0.5) * 2, 3.5, p.vz * 0.8 + (Math.random() - 0.5) * 2, false);
    p.rig.root.visible = false;
    this.audio.wasted();
    this.audio.setEngine(false, 0, 0);
    this.ev.onBanner('wasted', 'WASTED');
    if (this.mission) this.failMission('You died.');
  }
  respawn() {
    const p = this.player;
    const h = this.city.places.hospital ?? { x: -342, z: -183 };
    for (let i = this.peds.length - 1; i >= 0; i--) if (this.peds[i].tag === 'playerbody') this.removePed(this.peds[i]);
    if (this.interior) { this.interior = null; this.world.boundsOff = false; this.intLights.forEach((l) => (l.intensity = 0)); for (let i = this.peds.length - 1; i >= 0; i--) if (this.peds[i].indoor) this.removePed(this.peds[i]); }
    const fee = Math.min(p.money, Math.floor(p.money * 0.1) + 100);
    p.money -= fee;
    p.hp = 100; p.armor = 0; p.alive = true;
    p.x = h.x; p.z = h.z; p.y = groundHeight(h.x, h.z); p.vx = p.vz = 0; p.vy = 0;
    p.rig.root.visible = true;
    this.wanted = 0;
    this.state = 'playing';
    this.timeScale = 1;
    this.ev.onBanner(null);
    this.ev.onToast(`Hospital bill: $${fee}`, 'warn');
    this.requestLock();
  }

  // =============================================================== missions API
  missionGivers() {
    if (this.mission || this.missionIdx >= MISSIONS.length) return [];
    const d = MISSIONS[this.missionIdx];
    return [{ x: d.giver.x, z: d.giver.z, name: d.giver.name, def: d }];
  }
  say(who: string, text: string, dur = 4, after?: () => void) { this.subQ.push({ who, text, dur, after }); }
  sayLater(who: string, text: string, dur: number, delay: number) { setTimeout(() => this.say(who, text, dur), delay * 1000); }
  setObjective(t: string) { this.objective = t; }
  setGoals(g: Goal[]) { this.goals = g; }
  setTimer(t: number | null, label = '') { this.timer = { t, label }; }
  setProgress(p: number | null) { this.progress = p; }
  startMission(def: MissionDef) {
    if (this.mission) return;
    this.mission = { def, s: { stage: 0, t: 0 } };
    this.objective = '';
    this.goals = [];
    def.briefing.forEach((line, i) => {
      this.say(def.giver.name, line, 4.2, i === def.briefing.length - 1 ? () => this.beginMission() : undefined);
    });
    this.ev.onToast(`Mission: ${def.title}`, 'info');
  }
  beginMission() {
    if (!this.mission) return;
    this.mission.s.started = true;
    this.mission.def.start(this, this.mission.s);
  }
  completeMission(msg = '') {
    if (!this.mission) return;
    const def = this.mission.def;
    this.player.money += def.reward;
    this.cleanupMission();
    this.missionIdx++;
    this.audio.missionPass();
    this.ev.onBanner('passed', 'MISSION PASSED', `${def.title}  ·  +$${def.reward.toLocaleString()}${msg ? '  ·  ' + msg : ''}`);
    setTimeout(() => this.ev.onBanner(null), 5200);
    if (this.missionIdx >= MISSIONS.length) this.sayLater('Narrator', 'You have finished every contract in San Nova. Hunt the hidden packages and cause some mayhem!', 6, 5);
  }
  failMission(reason: string) {
    if (!this.mission) return;
    const def = this.mission.def;
    this.cleanupMission();
    this.audio.missionFail();
    this.ev.onBanner('failed', 'MISSION FAILED', `${def.title}  ·  ${reason}`);
    setTimeout(() => { if (this.state !== 'dead') this.ev.onBanner(null); }, 5200);
  }
  cleanupMission() {
    const m = this.mission;
    if (m) m.def.cleanup?.(this, m.s);
    this.mission = null;
    this.goals = [];
    this.objective = '';
    this.timer = { t: null, label: '' };
    this.progress = null;
    this.subQ = this.subQ.filter((q) => !q.after);
    for (const v of this.vehicles.slice()) {
      if (!v.mission) continue;
      v.mission = false;
      if (v.mode === 'idle' && !v.hasDriver && v !== this.player.vehicle && Math.hypot(v.x - this.player.x, v.z - this.player.z) > 80) removeVehicle(this, v);
      else if (v.mode === 'racer') { v.mode = 'ai'; v.ai.route = null; v.resnap(this); }
    }
    for (const p of this.peds.slice()) {
      if (!p.mission) continue;
      p.mission = false;
      if (p.dead || Math.hypot(p.x - this.player.x, p.z - this.player.z) > 90) this.removePed(p);
      else if (p.hostile) { p.aggro = false; p.hostile = false; p.flee(this, this.player.x, this.player.z, 12); }
    }
  }

  // =============================================================== main loop
  private afterDraw(next: () => void) {
    if (!this.isSoftwareGl) {
      this.raf = requestAnimationFrame(next);
      return;
    }
    const gl = this.renderer.getContext();
    if (!(gl instanceof WebGL2RenderingContext)) {
      window.setTimeout(() => { this.raf = requestAnimationFrame(next); }, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      window.setTimeout(() => { this.raf = requestAnimationFrame(next); }, 80);
      return;
    }
    gl.flush();
    const poll = () => {
      if (!this.running) { gl.deleteSync(sync); return; }
      const s = gl.clientWaitSync(sync, 0, 0);
      if (s === gl.WAIT_FAILED || s === gl.ALREADY_SIGNALED || s === gl.CONDITION_SATISFIED) {
        gl.deleteSync(sync);
        window.setTimeout(() => { if (this.running) this.raf = requestAnimationFrame(next); }, 80);
      } else {
        window.setTimeout(poll, 16);
      }
    };
    window.setTimeout(poll, 16);
  }

  frame = (now: number) => {
    if (!this.running) return;
    let dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    if (this.state === 'paused' || this.mapOpen) {
      this.updateCamera(0, false);
      this.render();
      this.emitHud(false);
      this.input.pressed.clear();
      if (this.mapOpen && this.fullmap) this.mapR.drawFull(this.fullmap, this);
      this.afterDraw(() => this.frame(performance.now()));
      return;
    }
    if (this.state === 'dead') {
      this.deadT += dt;
      this.timeScale = lerp(this.timeScale, 0.3, 0.1);
      if (this.deadT > 4.2) this.respawn();
    }
    dt *= this.timeScale;
    this.dt = dt;
    this.time += dt;
    if (this.interior) this.insideT += dt;
    this.update(dt);
    this.render();
    this.input.pressed.clear();
    this.afterDraw(() => this.frame(performance.now()));
  };

  render() {
    if (this.composer && !this.isSoftwareGl) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  update(dt: number) {
    const p = this.player;
    const k = this.input;
    this.applyTime(dt);
    const near = nearestNode(p.x, p.z);
    this.playerK = near[0]; this.playerL = near[1];
    this.playerSpeed = p.vehicle ? p.vehicle.speed : Math.hypot(p.vx, p.vz);
    this.firingT -= dt;
    if (this.firingT <= 0) this.playerFiring = false;
    p.hurtT = Math.max(0, p.hurtT - dt * 1.4);
    // toggles
    if (k.pressed.has('KeyT')) { this.finderOn = !this.finderOn; this.ev.onToast(this.finderOn ? 'Package finder ON' : 'Package finder OFF', 'info'); }
    if (k.pressed.has('KeyG') && !p.vehicle) {
      if (!isMeleeWeapon(p.weapon)) {
        this.scope = !this.scope;
        this.input.aim = false;
        this.audio.beep(this.scope ? 900 : 500, 0.09);
        this.ev.onToast(this.scope ? 'Scope engaged — G to release' : 'Scope released', 'info');
      } else this.ev.onToast('Melee weapons cannot be scoped', 'warn');
    }
    if (k.pressed.has('KeyR') && p.vehicle) {
      this.radioStation = (this.radioStation + 1) % this.audio.stations.length;
      this.audio.setStation(this.radioStation);
    }
    if (k.pressed.has('KeyF') || k.pressed.has('KeyE')) this.interact();
    if (p.vehicle && this.scope) this.scope = false;
    if (p.alive) {
      if (p.vehicle) this.updateDriving(dt);
      else this.updateOnFoot(dt);
    } else this.syncDeadPlayer();
    // simulation
    for (const v of this.vehicles) v.step(dt, this);
    this.collideVehicles();
    this.pedVehicle(dt);
    for (const pd of this.peds) pd.update(dt, this);
    for (const pr of this.props) pr.update(dt, this);
    this.updatePickups(dt);
    if (!this.interior) {
      streamTraffic(this, dt);
      streamParked(this, dt);
      streamPeds(this, dt);
      streamCrowds(this, dt);
      updatePolice(this, dt);
    }
    for (const gr of this.grenadeList.slice()) {
      gr.update(dt, this);
      if (gr.done) { this.scene.remove(gr.mesh); this.grenadeList.splice(this.grenadeList.indexOf(gr), 1); }
    }
    for (const rk of this.rocketList.slice()) {
      rk.update(dt, this);
      if (rk.done) { this.scene.remove(rk.mesh); this.rocketList.splice(this.rocketList.indexOf(rk), 1); }
    }
    this.updateHighwayCars(dt);
    this.allies = this.allies.filter((a) => this.peds.includes(a));
    this.updateWanted(dt);
    this.updateMissions(dt);
    this.updateSub(dt);
    this.updateFinder(dt);
    this.updateRoute(dt);
    this.updateLightsAndAudio(dt);
    this.city.update(dt, this.time);
    this.updateCamera(dt, false);
    this.fx.update(dt, this.renderer.domElement.height, this.camera.fov);
    this.updateMarkers();
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 1 / 24;
      if (this.minimap) this.mapR.drawMini(this.minimap, this);
      if (this.mapOpen && this.fullmap) this.mapR.drawFull(this.fullmap, this);
    }
    this.emitHud(false);
  }

  // =============================================================== time of day
  applyTime(dt: number) {
    this.hour = (this.hour + (dt * this.timeScale > 0 ? dt : 0) / this.dayLength) % 24;
    const h = this.hour;
    const a = ((h - 6) / 24) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(a) * 0.85, Math.sin(a), 0.35).normalize();
    const elev = sunDir.y;
    const day = smooth(-0.08, 0.2, elev);
    this.night = 1 - smooth(-0.06, 0.16, elev);
    const dusk = Math.exp(-Math.pow(elev / 0.2, 2));
    const U = this.skyMat.uniforms;
    const top = new THREE.Color(0x050a1c).lerp(new THREE.Color(0x2c6bc2), day).lerp(new THREE.Color(0x3a4a8c), dusk * 0.35 * day);
    const hor = new THREE.Color(0x0e1830).lerp(new THREE.Color(0x9cc3e6), day).lerp(new THREE.Color(0xff8a4a), dusk * 0.6);
    U.top.value.copy(top); U.hor.value.copy(hor);
    U.sunDir.value.copy(sunDir);
    const sunC = new THREE.Color(1, 0.96, 0.9).lerp(new THREE.Color(1, 0.5, 0.2), 1 - smooth(0, 0.45, elev));
    U.sunCol.value.copy(sunC).multiplyScalar(day);
    U.night.value = this.night;
    U.time.value = this.time;
    (this.scene.fog as THREE.Fog).color.copy(hor).multiplyScalar(0.92);
    this.hemi.color.set(0x30406a).lerp(new THREE.Color(0xbcd8ff), day);
    this.hemi.groundColor.set(0x14161e).lerp(new THREE.Color(0x6a5f50), day);
    this.hemi.intensity = 0.38 + day * 0.65;
    const useSun = elev > 0.02;
    const dir = useSun ? sunDir : sunDir.clone().negate();
    const cx = this.camX, cz = this.camZ;
    this.sun.position.set(cx + dir.x * 220, dir.y * 220 + 20, cz + dir.z * 220);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.color.copy(useSun ? sunC : new THREE.Color(0x8fa8ff));
    this.sun.intensity = useSun ? day * 3.1 * (0.35 + 0.65 * smooth(0, 0.35, elev)) : this.night * 0.45;
    if (!this.interior) this.renderer.toneMappingExposure = lerp(1.25, 0.92, day);
    (this.scene as any).environmentIntensity = 0.12 + day * 0.9;
    this.city.setNight(this.night);
    headMat.emissiveIntensity = 0.2 + this.night * 3.2;
    tailDim.emissiveIntensity = 0.2 + this.night * 1.2;
    beamMaterial.opacity = this.night * 0.32;
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
  }
  get clockString() {
    const hh = Math.floor(this.hour), mm = Math.floor((this.hour - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // =============================================================== player: on foot
  cycleWeapon(dir: number) {
    const p = this.player;
    const owned = WEAPON_ORDER.filter((w) => p.owned.has(w));
    const i = owned.indexOf(p.weapon);
    this.selectWeapon(owned[(i + dir + owned.length) % owned.length]);
  }
  selectWeapon(w: WeaponId) {
    const p = this.player;
    if (!p.owned.has(w)) return;
    if (isMeleeWeapon(w)) this.scope = false;
    p.weapon = w;
    setWeapon(p.rig, w === 'fists' ? null : (w as GunKind));
  }

  updateOnFoot(dt: number) {
    const p = this.player;
    const k = this.input;
    // weapon keys (1-9, 0, -, =, Q/Z cycle)
    const slotCodes = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
    slotCodes.forEach((code, i) => { if (k.pressed.has(code) && WEAPON_ORDER[i]) this.selectWeapon(WEAPON_ORDER[i]); });
    if (k.pressed.has('KeyQ')) this.cycleWeapon(1);
    if (k.pressed.has('KeyZ')) this.cycleWeapon(-1);
    const meleeW = isMeleeWeapon(p.weapon);
    if (this.scope && (meleeW || !!p.vehicle)) this.scope = false;
    const aiming = (k.aim || this.playerFiring || this.scope) && !meleeW;

    // camera look
    this.lookInput(dt);
    const ix = (k.keys.has('KeyD') ? 1 : 0) - (k.keys.has('KeyA') ? 1 : 0);
    const iz = (k.keys.has('KeyW') ? 1 : 0) - (k.keys.has('KeyS') ? 1 : 0);
    const sY = Math.sin(this.camYaw), cY = Math.cos(this.camYaw);
    let mx = sY * iz - cY * ix, mz = cY * iz + sY * ix;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }

    const sprint = k.keys.has('ShiftLeft') || k.keys.has('ShiftRight');
    const crouch = k.keys.has('ControlLeft') || k.keys.has('KeyC');
    const crouchPressed = k.pressed.has('ControlLeft') || k.pressed.has('KeyC');
    const gh = this.groundAt(p.x, p.z, p.y);
    const sandF = this.interior ? 0 : sandFactorAt(p.x, p.z, p.y);
    const wasSliding = p.move.slideT > 0;

    p.move.vx = p.vx; p.move.vy = p.vy; p.move.vz = p.vz; p.move.y = p.y; p.move.onGround = p.onGround;
    const mRes = stepMovementState(p.move, {
      wishX: ml > 0 ? mx : 0,
      wishZ: ml > 0 ? mz : 0,
      sprint,
      crouch,
      crouchPressed,
      jumpPressed: k.pressed.has('Space'),
      jumpHeld: k.keys.has('Space'),
      aiming,
      scoping: this.scope,
      groundY: gh,
      sandFactor: sandF,
    }, dt);
    p.vx = p.move.vx; p.vy = p.move.vy; p.vz = p.move.vz; p.y = p.move.y; p.onGround = p.move.onGround;

    if (!wasSliding && mRes.sliding) this.audio.slide();
    if (mRes.landed) this.audio.footstep(sandF > 0.1);

    const horizSp = Math.hypot(p.vx, p.vz);
    if (p.onGround && horizSp > 0.9 && !mRes.sliding) {
      p.stepT -= dt * (horizSp / 4.2);
      if (p.stepT <= 0) {
        p.stepT = 0.42;
        this.audio.footstep(sandF > 0.1);
      }
    }
    const sandFoot = applySandFootPhysics(horizSp, sandF);
    if (p.onGround && (sandFoot.puffRate > 0.5 || (mRes.sliding && sandF > 0.1))) {
      p.sandPuffT -= dt;
      if (p.sandPuffT <= 0) {
        p.sandPuffT = mRes.sliding ? 0.05 : 0.14;
        this.fx.sandSpray(p.x, p.y, p.z, -p.vx * 0.25, -p.vz * 0.25, mRes.sliding ? 1.0 : 0.48);
      }
    }

    p.x += p.vx * dt; p.z += p.vz * dt;
    this.world.resolve(p.x, p.z, 0.4, p.y, _po);
    if (_po.hit) { p.x = _po.x; p.z = _po.z; }
    // vehicles block the player
    for (const v of this.vehicles) {
      const dx = p.x - v.x, dz = p.z - v.z;
      if (dx * dx + dz * dz > 20) continue;
      const c = v.circles();
      for (let i = 0; i < c.length; i += 3) {
        const ox = p.x - c[i], oz = p.z - c[i + 1];
        const rr = c[i + 2] + 0.4;
        const d2 = ox * ox + oz * oz;
        if (d2 < rr * rr && p.y < v.y + 1.5) {
          const d = Math.sqrt(d2) || 0.01;
          p.x += (ox / d) * (rr - d); p.z += (oz / d) * (rr - d);
          const sp2 = v.speed;
          if (sp2 > 3 && v.mode !== 'wreck' && this.time - this.lastVehHit > 0.7) {
            this.lastVehHit = this.time;
            this.hurtPlayer(Math.min(60, sp2 * 2.2), 'vehicle');
            p.vx = v.vx * 0.6; p.vz = v.vz * 0.6; p.vy = 3.5; p.onGround = false;
            this.audio.hit(1);
            if (v.mode === 'player') this.crime(1, 'hitrun');
          }
        }
      }
    }
    // facing
    const moving = horizSp > 0.4;
    if (aiming) p.yaw = dampAngle(p.yaw, this.camYaw, 16, dt);
    else if (moving) p.yaw = dampAngle(p.yaw, Math.atan2(p.vx, p.vz), 12, dt);
    // fire
    p.fireT -= dt;
    p.punchT = p.punchT > 0 ? p.punchT + dt * 2.8 : 0;
    if (p.punchT > 1) p.punchT = 0;
    if (k.fire && p.fireT <= 0 && this.input.locked !== undefined) {
      const w = WEAPONS[p.weapon];
      if (meleeW) playerMelee(this);
      else if (w.auto || !this.fireHeld) playerFire(this);
    }
    this.fireHeld = k.fire;
    // animate
    p.rig.root.position.set(p.x, p.y - sandFoot.sinkY, p.z);
    p.rig.root.rotation.set(0, p.yaw, 0);
    p.rig.root.visible = !this.scope;
    animateHuman(p.rig, dt, {
      mode: 'stand',
      speed: horizSp,
      aim: aiming ? 1 : 0,
      aimPitch: clamp(-this.camPitch * 0.9 + 0.2, -0.5, 0.7),
      punch: p.punchT,
      crouch: p.move.crouching,
      slide: mRes.sliding,
      airborne: !p.onGround,
    });
  }
  fireHeld = false;
  lastVehHit = -10;
  lockFailed = false;

  lookInput(dt: number) {
    const k = this.input;
    const sens = 0.0024 * (this.scope ? 0.32 : 1);
    if (k.locked) {
      this.camYaw -= k.dx * sens;
      this.camPitch = clamp(this.camPitch + k.dy * sens, -0.55, 1.3);
      if (k.dx || k.dy) this.lastMouse = this.time;
    } else if (this.state === 'playing' && this.lockFailed) {
      // fallback: edge steering when pointer lock is unavailable
      const W = window.innerWidth, H = window.innerHeight;
      const ox = (k.mx - W / 2) / (W / 2), oy = (k.my - H / 2) / (H / 2);
      if (Math.abs(ox) > 0.35) { this.camYaw -= Math.sign(ox) * (Math.abs(ox) - 0.35) * 3 * dt; this.lastMouse = this.time; }
      if (Math.abs(oy) > 0.4) this.camPitch = clamp(this.camPitch + Math.sign(oy) * (Math.abs(oy) - 0.4) * 1.6 * dt, -0.55, 1.3);
    }
    k.dx = 0; k.dy = 0;
    const ar = 1.9 * dt;
    if (k.keys.has('ArrowLeft')) { this.camYaw += ar; this.lastMouse = this.time; }
    if (k.keys.has('ArrowRight')) { this.camYaw -= ar; this.lastMouse = this.time; }
    if (k.keys.has('ArrowUp')) this.camPitch = clamp(this.camPitch - ar * 0.6, -0.55, 1.3);
    if (k.keys.has('ArrowDown')) this.camPitch = clamp(this.camPitch + ar * 0.6, -0.55, 1.3);
  }

  syncDeadPlayer() { /* body handled as a ragdoll ped */ }

  // =============================================================== player: vehicles
  interact() {
    const p = this.player;
    if (!p.alive) return;
    if (p.vehicle) { this.exitVehicle(); return; }
    if (this.interior) {
      const room = this.interior.room;
      if (room.kind === 'gun' && Math.hypot(p.x - room.cx, p.z - (room.cz + 4)) < 6) { this.shop(); return; }
      if (this.insideT > 1.2 && Math.hypot(p.x - room.cx, p.z - (room.cz + room.d / 2 - 1.4)) < 1.7) { this.exitInterior(); return; }
      for (const pp of this.peds) {
        if (pp.indoor && pp.kind === 'civ' && Math.hypot(pp.x - p.x, pp.z - p.z) < 2.4) {
          pp.flee(this, p.x, p.z, 6);
          this.ev.onToast('Behind the counter — press F at the door to leave', 'info');
          return;
        }
      }
      return;
    }
    const dn = this.doorNear();
    if (dn) { this.enterInterior(dn.door); return; }
    for (const a of this.allies) {
      if (!a.recruited && !a.dead && Math.hypot(a.x - p.x, a.z - p.z) < 2.8) { this.recruitAlly(a); return; }
    }
    // shop
    const gs = this.city.places.gunshop;
    if (gs && Math.hypot(p.x - gs.x, p.z - gs.z) < 3.5) { this.shop(); return; }
    let best: Vehicle | null = null, bd = 3.2;
    for (const v of this.vehicles) {
      if (v.mode === 'wreck') continue;
      const c = v.circles();
      for (let i = 0; i < c.length; i += 3) {
        const d = Math.hypot(p.x - c[i], p.z - c[i + 1]) - c[i + 2];
        if (d < bd) { bd = d; best = v; }
      }
    }
    if (best) this.enterVehicle(best);
  }
  shop() {
    const p = this.player;
    const need = WEAPON_SHOP_ORDER.filter((w) => !p.owned.has(w));
    if (need.length) {
      const w = need[0];
      const def = WEAPONS[w];
      const price = ('price' in def ? def.price : 1500) ?? 1500;
      if (p.money >= price) {
        p.money -= price; p.owned.add(w);
        if (!isMeleeWeapon(w)) p.ammo[w] = Math.max(p.ammo[w], Math.ceil(def.ammo * 0.6));
        this.selectWeapon(w);
        this.audio.cash();
        this.ev.onToast(`Bought ${def.name} (-$${price})`, 'good');
      } else this.ev.onToast(`${def.name} costs $${price}`, 'warn');
    } else {
      const cost = 300;
      if (p.money >= cost) {
        p.money -= cost;
        for (const w of WEAPON_ORDER) if (!isMeleeWeapon(w)) p.ammo[w] = WEAPONS[w].ammo;
        p.owned.add('grenade');
        this.audio.cash();
        this.ev.onToast('All ammo, rockets & grenades refilled (-$300)', 'good');
      } else this.ev.onToast('Not enough cash for ammo', 'warn');
    }
  }
  enterVehicle(v: Vehicle) {
    const p = this.player;
    // carjack
    if (v.hasDriver) {
      const kind = v.driverKind;
      const rx = -v.fz, rz = v.fx;
      const x = v.x - rx * (v.spec.W / 2 + 0.9), z = v.z - rz * (v.spec.W / 2 + 0.9);
      v.removeDriverBust();
      if (kind === 'cop') {
        const rng = new Rng(v.id);
        const d = new Ped('cop', civilianLook(rng));
        d.place(x, z); d.hostile = true; d.aggro = true; d.arm('pistol'); d.hp = d.maxHp = 55;
        this.addPed(d);
        this.crime(3, 'carjack-cop');
      } else {
        const rng = new Rng(v.id + 11);
        const d = new Ped('civ', civilianLook(rng));
        d.place(x, z);
        d.handsUp = 1.4;
        d.yaw = Math.atan2(p.x - x, p.z - z);
        this.addPed(d);
        if (Math.random() < 0.5) this.crime(1, 'carjack');
      }
      this.audio.horn(true);
    }
    if (v.type === 'police' && this.wanted < 2) this.crime(2, 'stole-police');
    this.scope = false;
    p.vehicle = v;
    v.mode = 'player';
    v.ai.finished = false;
    v.ai.route = null;
    v.siren = false;
    // attach rig
    const rig = p.rig;
    this.scene.remove(rig.root);
    v.model.tiltGroup.add(rig.root);
    rig.root.position.set(v.spec.seat[0], v.spec.seat[1], v.spec.seat[2]);
    rig.root.rotation.set(0, 0, 0);
    rig.root.visible = true;
    setWeapon(rig, null);
    this.audio.door();
    this.camDist = 6 + v.spec.L * 0.35;
    if (this.radioStation) this.audio.setStation(this.radioStation);
    else this.audio.setStation(0);
  }
  detachRig(v: Vehicle) {
    const rig = this.player.rig;
    v.model.tiltGroup.remove(rig.root);
    this.scene.add(rig.root);
    rig.root.visible = true;
    if (this.player.weapon !== 'fists') setWeapon(rig, this.player.weapon as GunKind);
  }
  exitVehicle() {
    const p = this.player;
    const v = p.vehicle;
    if (!v) return;
    this.detachRig(v);
    const left = [Math.cos(v.yaw), -Math.sin(v.yaw)];
    const sides = [1, -1];
    let placed = false;
    for (const s of sides) {
      const x = v.x + left[0] * s * (v.spec.W / 2 + 0.9), z = v.z + left[1] * s * (v.spec.W / 2 + 0.9);
      if (!this.world.solidAt(x, 0.5, z)) { p.x = x; p.z = z; placed = true; break; }
    }
    if (!placed) { p.x = v.x + v.fx * 3; p.z = v.z + v.fz * 3; }
    p.y = groundHeight(p.x, p.z, v.y);
    if (v.y > 2) p.y = Math.max(p.y, v.y);
    p.vx = v.vx * 0.5; p.vz = v.vz * 0.5; p.vy = 0;
    p.yaw = v.yaw;
    p.vehicle = null;
    v.mode = 'idle';
    v.throttle = 0; v.brake = 0.6;
    if (v.speed > 8) this.hurtPlayer((v.speed - 7) * 1.2, 'jump');
    this.audio.door();
    this.audio.setEngine(false, 0, 0);
    this.audio.setStation(0);
    this.camDist = 4.6;
  }

  updateDriving(dt: number) {
    const p = this.player;
    const v = p.vehicle!;
    const k = this.input;
    this.lookInput(dt);
    const up = k.keys.has('KeyW') || k.keys.has('ArrowUp') && false;
    const dn = k.keys.has('KeyS');
    v.throttle = (up ? 1 : 0) - (dn ? 1 : 0);
    v.brake = 0;
    if (dn && v.fwd > 1) v.brake = 0.85;
    if (k.keys.has('Space')) { v.hand = true; v.brake = Math.max(v.brake, 0.2); } else v.hand = false;
    const target = (k.keys.has('KeyA') ? 1 : 0) - (k.keys.has('KeyD') ? 1 : 0);
    v.steerIn += (target - v.steerIn) * (1 - Math.exp(-(target === 0 ? 10 : 6) * dt));
    if (k.keys.has('KeyH')) { this.hornT -= dt; if (this.hornT <= 0) { this.audio.horn(true); this.hornT = 0.3; } }
    v.lightsOn = this.night > 0.4;
    p.x = v.x; p.z = v.z; p.y = v.y;
    p.yaw = v.yaw;
    p.vx = v.vx; p.vz = v.vz;
    // camera yaw follow
    const sp = v.speed;
    const rig = p.rig;
    animateHuman(rig, dt, { mode: 'drive', speed: 0, aim: 0, aimPitch: 0, punch: 0, steer: v.steerIn });
    if (this.time - this.lastMouse > 1.4 && sp > 2) {
      const heading = sp > 4 && v.fwd > 0 ? Math.atan2(v.vx, v.vz) : v.yaw + (v.fwd < -1 ? Math.PI : 0);
      this.camYaw = dampAngle(this.camYaw, heading, 2.2, dt);
      this.camPitch += (0.2 - this.camPitch) * (1 - Math.exp(-1.5 * dt));
    }
  }

  collideVehicles() {
    const V = this.vehicles;
    for (let i = 0; i < V.length; i++) {
      const a = V[i];
      for (let j = i + 1; j < V.length; j++) {
        const b = V[j];
        const dx = a.x - b.x, dz = a.z - b.z;
        const mr = (a.spec.L + b.spec.L) / 2 + 0.6;
        if (dx * dx + dz * dz > mr * mr) continue;
        if ((a.ghost > 0 || b.ghost > 0) && a.mode !== 'player' && b.mode !== 'player') continue;
        const ca = a.circles(), cb = b.circles();
        let best = 0, nx = 0, nz = 0, px = 0, pz = 0;
        for (let m = 0; m < ca.length; m += 3)
          for (let n = 0; n < cb.length; n += 3) {
            const ex = ca[m] - cb[n], ez = ca[m + 1] - cb[n + 1];
            const d = Math.hypot(ex, ez);
            const pen = ca[m + 2] + cb[n + 2] - d;
            if (pen > best) { best = pen; nx = ex / (d || 1); nz = ez / (d || 1); px = (ca[m] + cb[n]) / 2; pz = (ca[m + 1] + cb[n + 1]) / 2; }
          }
        if (best <= 0) continue;
        const ma = a.mode === 'parked' ? a.spec.mass * 1.4 : a.spec.mass, mb = b.mode === 'parked' ? b.spec.mass * 1.4 : b.spec.mass;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.x += nx * best * wa; a.z += nz * best * wa;
        b.x -= nx * best * wb; b.z -= nz * best * wb;
        const rvx = a.vx - b.vx, rvz = a.vz - b.vz;
        const vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          const j2 = (-(1 + 0.28) * vn) / (1 / ma + 1 / mb);
          a.vx += (nx * j2) / ma; a.vz += (nz * j2) / ma;
          b.vx -= (nx * j2) / mb; b.vz -= (nz * j2) / mb;
          a.omega += ((px - a.x) * nz - (pz - a.z) * nx) * -vn * 0.03 * wa;
          b.omega -= ((px - b.x) * nz - (pz - b.z) * nx) * -vn * 0.03 * wb;
          const imp = -vn;
          if (imp > 2) {
            a.impact(this, imp, px, pz, nx, nz, 0.55 * wb * 2);
            b.impact(this, imp, px, pz, -nx, -nz, 0.55 * wa * 2);
            if (a.mode === 'player' || b.mode === 'player') {
              const other = a.mode === 'player' ? b : a;
              if (imp > 4 && other.mode === 'police') this.crime(2, 'ram');
              else if (imp > 7 && other.hasDriver) this.crime(1, 'crash');
              if (other.mode === 'parked' || other.mode === 'ai') { other.stunned = Math.max(other.stunned, 2.5); if (other.mode === 'parked') other.hasDriver = other.hasDriver; }
            }
          }
        }
      }
    }
  }

  pedVehicle(_dt: number) {
    for (const v of this.vehicles) {
      const sp = v.speed;
      if (sp < 2.2 || v.mode === 'wreck') continue;
      const c = v.circles();
      for (const p of this.peds) {
        if (p.dead && p.landed) continue;
        const dx = p.x - v.x, dz = p.z - v.z;
        if (dx * dx + dz * dz > 25) continue;
        if (p.dead) continue;
        for (let i = 0; i < c.length; i += 3) {
          const ox = p.x - c[i], oz = p.z - c[i + 1];
          const rr = c[i + 2] + 0.35;
          if (ox * ox + oz * oz < rr * rr) {
            const d = Math.hypot(ox, oz) || 1;
            p.knock(this, v.vx * 0.95 + (ox / d) * 3, v.vz * 0.95 + (oz / d) * 3, sp * 3.3, v.mode === 'player');
            v.vx *= 0.97; v.vz *= 0.97;
            this.audio.hit(1);
            if (v.mode === 'player') this.shake(0.15);
            break;
          }
        }
      }
    }
  }

  // =============================================================== pickups / finder
  updatePickups(dt: number) {
    const p = this.player;
    const reach = p.vehicle ? 3.4 : 1.7;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.update(dt);
      if (pk.taken) {
        this.scene.remove(pk.group);
        this.pickups.splice(i, 1);
        continue;
      }
      if (!p.alive) continue;
      const dx = pk.x - p.x, dz = pk.z - p.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      pk.taken = true;
      switch (pk.kind) {
        case 'cash': p.money += pk.value; this.audio.cash(); this.ev.onToast(`+$${pk.value}`, 'cash'); break;
        case 'health': p.hp = Math.min(100, p.hp + pk.value); this.audio.pickup(); this.ev.onToast('Health restored', 'good'); break;
        case 'armor': p.armor = Math.min(100, p.armor + pk.value); this.audio.pickup(); this.ev.onToast('Body armor +' + pk.value, 'good'); break;
        case 'weapon': {
          const w = pk.weapon as WeaponId;
          p.owned.add(w); p.ammo[w] = Math.min(WEAPONS[w].ammo, p.ammo[w] + pk.value);
          this.audio.pickup(); this.ev.onToast(`Picked up ${WEAPONS[w].name}`, 'good');
          if (!p.vehicle) this.selectWeapon(w);
          break;
        }
        case 'package':
          this.packagesFound++;
          p.money += pk.value;
          this.audio.pickup(); this.audio.cash();
          this.ev.onToast(`Hidden package ${this.packagesFound}/${this.packagesTotal}  +$${pk.value}`, 'good');
          if (this.packagesFound === this.packagesTotal) { p.money += 10000; this.ev.onToast('ALL PACKAGES FOUND! +$10,000', 'good'); }
          break;
      }
    }
  }
  updateFinder(dt: number) {
    if (!this.finderOn) return;
    this.finderT -= dt;
    let best: Pickup | null = null, bd = 1e9;
    for (const pk of this.pickups) {
      if (pk.kind !== 'package' || pk.taken) continue;
      const d = Math.hypot(pk.x - this.player.x, pk.z - this.player.z);
      if (d < bd) { bd = d; best = pk; }
    }
    this.finderBest = best;
    this.finderDist = bd;
    if (best && this.finderT <= 0 && bd < 200) {
      this.audio.beep(900 + Math.max(0, 200 - bd) * 4, 0.1);
      this.finderT = clamp(bd / 70, 0.1, 2.4);
    }
  }
  finderBest: Pickup | null = null;
  finderDist = 0;

  // =============================================================== wanted
  updateWanted(_dt: number) {
    if (this.wanted === 0) return;
    if (this.interior) return;
    // cops seeing the player refresh the timer
    let seen = false;
    for (const v of this.vehicles) {
      if (v.mode !== 'police') continue;
      const d = Math.hypot(v.x - this.playerX, v.z - this.playerZ);
      if (d < 55 || (d < 110 && this.world.los(v.x, 1, v.z, this.playerX, 1, this.playerZ))) { seen = true; break; }
    }
    if (!seen) for (const p of this.peds) if (p.kind === 'cop' && !p.dead && Math.hypot(p.x - this.playerX, p.z - this.playerZ) < 60) { seen = true; break; }
    this.searching = !seen;
    if (seen) this.lastSeen = this.time;
    else if (this.time - this.lastSeen > 12 + this.wanted * 3) {
      this.wanted--;
      this.lastSeen = this.time;
      this.ev.onToast(this.wanted === 0 ? 'Wanted level cleared' : 'Wanted level decreased', 'good');
    }
    // pay n spray
    const ps = this.city.places.payspray;
    const pv = this.player.vehicle;
    if (ps && pv && Math.hypot(pv.x - ps.x, pv.z - ps.z) < (ps.r ?? 7) && pv.speed < 5 && this.player.money >= 0) {
      const cost = Math.min(this.player.money, 100);
      this.player.money -= cost;
      this.wanted = 0;
      pv.hp = pv.maxHp;
      pv.model.body.material = paintMat([0xc0392b, 0x2c3e8f, 0xe8e8e8, 0x15171a, 0x0e6e8c][Math.floor(Math.random() * 5)]);
      this.audio.cash();
      this.ev.onToast('Pay N\' Spray: car repaired & repainted, wanted level cleared!', 'good');
    }
  }
  searching = false;
  scope = false;
  grenadeList: Grenade[] = [];
  rocketList: Rocket[] = [];
  rooms: Room[] = [];
  interior: { room: Room; back: { x: number; z: number; yaw: number }; name: string } | null = null;
  insideT = 0;
  intLights: THREE.PointLight[] = [];
  allies: Ped[] = [];
  hwCars: { v: Vehicle; pts: [number, number][]; i: number; speed: number; elevated: boolean }[] = [];

  // =============================================================== missions loop
  updateMissions(dt: number) {
    const p = this.player;
    if (!this.mission) {
      if (!p.alive || this.subQ.length || this.sub) return;
      const g = this.missionGivers()[0];
      if (g && Math.hypot(p.x - g.x, p.z - g.z) < 3.2 && !p.vehicle) this.startMission(g.def);
      return;
    }
    const m = this.mission;
    m.s.t += dt;
    if (m.s.started) m.def.update(this, dt, m.s);
  }
  updateSub(dt: number) {
    if (this.sub) {
      this.sub.t -= dt;
      if (this.sub.t <= 0) this.sub = null;
    }
    if (!this.sub && this.subQ.length) {
      const q = this.subQ.shift()!;
      this.sub = { who: q.who, text: q.text, t: q.dur };
      q.after?.();
    }
  }
  updateRoute(dt: number) {
    this.routeT -= dt;
    if (this.routeT > 0) return;
    this.routeT = 0.6;
    let target: { x: number; z: number } | null = null;
    if (this.waypoint) {
      target = this.waypoint;
      if (Math.hypot(this.waypoint.x - this.playerX, this.waypoint.z - this.playerZ) < 18) { this.waypoint = null; target = null; }
    }
    if (!target) {
      const gl = this.goals.find((q) => q.kind !== 'enemy');
      if (gl) target = gl;
      else {
        const gv = this.missionGivers()[0];
        if (gv) target = gv;
      }
    }
    this.route = target ? buildRoute(this.playerX, this.playerZ, target.x, target.z) : null;
  }
  updateMarkers() {
    const list: { x: number; z: number; r: number; color: number; beam: boolean }[] = [];
    for (const g of this.missionGivers()) list.push({ x: g.x, z: g.z, r: 1.6, color: 0xffd23d, beam: true });
    for (const g of this.goals) {
      const col = g.kind === 'enemy' ? 0xff4040 : g.kind === 'vehicle' ? 0x3dd6ff : 0xffd23d;
      if (g.kind === 'enemy') continue;
      list.push({ x: g.x, z: g.z, r: g.r, color: col, beam: g.beam !== false });
    }
    for (const g of this.city.places.gunshop ? [this.city.places.gunshop] : []) list.push({ x: g.x, z: g.z, r: 1.4, color: 0xff6a3d, beam: false });
    for (const a of this.allies) if (!a.dead && !a.recruited && Math.hypot(a.x - this.playerX, a.z - this.playerZ) < 120) list.push({ x: a.x, z: a.z, r: 1.5, color: 0x4ade80, beam: false });
    if (!this.interior) for (const d of this.city.doors) {
      if (list.length > 9) break;
      if (d.kind !== 'shop' && d.kind !== 'diner' && d.kind !== 'bank' && d.kind !== 'hospital' && d.kind !== 'police') continue;
      if (Math.hypot(d.x - this.playerX, d.z - this.playerZ) < 26) list.push({ x: d.x, z: d.z, r: 1.1, color: 0x7fd6c8, beam: false });
    }
    this.markers.forEach((m, i) => {
      const d = list[i];
      if (!d) { m.visible = false; return; }
      m.visible = true;
      m.position.set(d.x, groundHeight(d.x, d.z), d.z);
      const [beam, ring, disc] = m.children as THREE.Mesh[];
      beam.scale.set(d.r, 1, d.r);
      ring.scale.set(d.r, 1, d.r);
      disc.scale.set(d.r, 1, d.r);
      beam.visible = d.beam;
      for (const c of [beam, ring, disc]) (c.material as THREE.MeshBasicMaterial).color.setHex(d.color);
      ring.rotation.y = this.time * 0.6;
    });
  }

  // =============================================================== lights / audio per frame
  updateLightsAndAudio(_dt: number) {
    const night = this.night;
    const on = night > 0.4;
    const pv = this.player.vehicle;
    for (const v of this.vehicles) {
      if (v.mode !== 'player') v.lightsOn = on;
    }
    // flashing police lights
    const ph = Math.floor(this.time * 7) % 2;
    sirenRed.emissiveIntensity = ph ? 4 : 0.2;
    sirenBlue.emissiveIntensity = ph ? 0.2 : 4;
    // headlight spots on player's vehicle
    this.spots.forEach((s, i) => {
      if (pv && pv.mode === 'player' && on) {
        const side = i === 0 ? 1 : -1;
        const lx = pv.x + pv.fx * (pv.spec.L / 2) - pv.fz * 0 + Math.cos(pv.yaw) * side * 0.6 * -1 * -1;
        const lz = pv.z + pv.fz * (pv.spec.L / 2) - Math.sin(pv.yaw) * side * 0.6;
        s.position.set(lx, 0.9, lz);
        s.target.position.set(lx + pv.fx * 20, 0, lz + pv.fz * 20);
        s.intensity = 140 * night;
      } else s.intensity = 0;
    });
    // audio
    if (pv && pv.mode === 'player') {
      this.audio.setEngine(true, clamp(Math.abs(pv.fwd) / pv.spec.maxSpeed, 0, 1), Math.max(0, pv.throttle));
    }
    let sirenVol = 0;
    for (const v of this.vehicles) if (v.siren && v.mode === 'police') sirenVol = Math.max(sirenVol, 1 - Math.hypot(v.x - this.camX, v.z - this.camZ) / 160);
    this.audio.setSiren(sirenVol);
  }

  // =============================================================== camera
  updateCamera(dt: number, snap: boolean) {
    const p = this.player;
    const pv = p.vehicle;
    const aiming = !pv && (this.input.aim || this.playerFiring || this.scope) && !isMeleeWeapon(p.weapon) && p.alive;
    const tgtEye = p.move.slideT > 0 ? 0.9 : p.move.crouching ? 1.15 : 1.55;
    p.eyeH += (tgtEye - p.eyeH) * (snap ? 1 : 1 - Math.exp(-10 * dt));
    const tgtDist = this.scope ? 0.55 : pv ? 6.2 + pv.spec.L * 0.4 + Math.min(4, pv.speed * 0.07) : aiming ? 2.7 : 4.7;
    this.camDist += (tgtDist - this.camDist) * (snap ? 1 : 1 - Math.exp(-6 * dt));
    const cosP = Math.cos(this.camPitch), sinP = Math.sin(this.camPitch);
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    let tx: number, ty: number, tz: number;
    if (pv) { tx = pv.x; ty = 1.5 + pv.y; tz = pv.z; }
    else { tx = p.x; ty = p.y + p.eyeH; tz = p.z; }
    const shoulder = this.scope ? 0.42 : aiming ? 0.75 : 0;
    const rx = -fz, rz = fx;
    tx += rx * shoulder; tz += rz * shoulder;
    let d = this.camDist;
    for (let t = 0.6; t <= d; t += 0.35) {
      const x = tx - fx * cosP * t, y = ty + sinP * t, z = tz - fz * cosP * t;
      if (y < 0.35 || this.world.solidAt(x, y, z)) { d = Math.max(0.8, t - 0.45); break; }
    }
    let cx = tx - fx * cosP * d, cy = ty + sinP * d, cz = tz - fz * cosP * d;
    cy = Math.max(cy, 0.4 + groundHeight(cx, cz));
    if (this.shakeAmt > 0.001) {
      cx += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      cy += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      cz += (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.shakeAmt *= Math.exp(-6 * dt);
    }
    this.camera.position.set(cx, cy, cz);
    this.camDir.set(fx * cosP, -sinP, fz * cosP);
    this.camera.lookAt(cx + this.camDir.x * 10, cy + this.camDir.y * 10, cz + this.camDir.z * 10);
    this.camX = cx; this.camZ = cz;
    const onFootSprint = !pv && !aiming && Math.hypot(p.vx, p.vz) > 6.8;
    const targetFov = this.scope ? 21 : aiming ? 48 : pv ? 62 + Math.min(20, pv.speed * 0.45) : onFootSprint ? 68 : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (snap ? 1 : 1 - Math.exp(-7 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.projM.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projM);
  }

  // =============================================================== interiors
  doorNear(): { door: Door; d: number } | null {
    let best: { door: Door; d: number } | null = null;
    for (const d of this.city.doors) {
      const dd = Math.hypot(d.x - this.player.x, d.z - this.player.z);
      if (dd < 3.1 && (!best || dd < best.d)) best = { door: d, d: dd };
    }
    return best;
  }
  enterInterior(door: Door) {
    if (this.player.vehicle) return;
    const room = roomForDoor(door, this.rooms);
    const back = { x: door.x, z: door.z, yaw: door.yaw };
    this.interior = { room, back, name: door.name };
    this.insideT = 0;
    this.player.x = room.cx;
    this.player.z = room.cz + room.d / 2 - 1.7;
    this.player.y = 0.26; this.player.vx = 0; this.player.vz = 0; this.player.vy = 0;
    this.player.move.y = 0.26; this.player.move.vx = 0; this.player.move.vy = 0; this.player.move.vz = 0;
    this.player.yaw = Math.PI;
    this.camYaw = Math.PI; this.camPitch = 0.16;
    this.world.boundsOff = true;
    this.scope = false;
    this.player.rig.root.visible = true;
    const tint = room.warmTint ?? 0xffe4bc;
    this.intLights.forEach((l, i) => {
      l.color.setHex(i === 3 ? 0xdbeeff : tint);
      l.intensity = i === 3 ? 7 : 14;
      if (i < 3) l.position.set(room.cx - 6.8 + i * 6.8, 3.85, room.cz - 1.2);
      else l.position.set(room.cx, 3.6, room.cz + 3.2);
    });
    if (this.bloom) this.bloom.strength = 0.16;
    this.renderer.toneMappingExposure = 0.92;
    this.spawnRoomNpcs(room);
    this.audio.door();
    this.ev.onToast(`Entering ${door.name}`, 'info');
  }
  spawnRoomNpcs(room: Room) {
    const rng = new Rng(room.id * 97 + 13);
    for (const spot of room.npcSpots) {
      const look = spot.role === 'guard' ? guardLook(rng) : civilianLook(rng);
      const p = new Ped('civ', look);
      p.indoor = true; p.mission = true;
      p.state = 'idle'; p.idleT = 9999;
      p.x = spot.x; p.z = spot.z; p.y = 0.26;
      p.yaw = spot.yaw;
      p.place(spot.x, spot.z);
      if (spot.role === 'clerk') p.arm(null);
      else if (spot.role === 'guard') p.arm('pistol');
      this.addPed(p);
    }
  }
  exitInterior() {
    if (!this.interior) return;
    const b = this.interior.back;
    const nx = Math.sin(b.yaw), nz = Math.cos(b.yaw);
    this.player.x = b.x + nx * 1.6; this.player.z = b.z + nz * 1.6;
    this.player.y = groundHeight(this.player.x, this.player.z);
    this.player.move.y = this.player.y;
    this.player.vx = 0; this.player.vz = 0;
    this.player.yaw = b.yaw + Math.PI;
    this.camYaw = this.player.yaw;
    this.interior = null;
    this.world.boundsOff = false;
    this.intLights.forEach((l) => (l.intensity = 0));
    if (this.bloom) this.bloom.strength = 0.42;
    for (let i = this.peds.length - 1; i >= 0; i--) if (this.peds[i].indoor) this.removePed(this.peds[i]);
    this.audio.door();
    this.ev.onToast('Back outside', 'info');
  }

  // =============================================================== allies & weapons
  spawnAllies() {
    const spots: [number, number][] = [[-294, 34], [blockCenter(2) + 34, blockCenter(1) + 34], [this.city.places.gunshop ? this.city.places.gunshop.x + 5 : 4, this.city.places.gunshop ? this.city.places.gunshop.z + 2 : -160]];
    const rng = new Rng(8181);
    for (const [x, z] of spots) {
      const p = new Ped('ally', gangLook(rng, 0x2f5d50));
      p.hp = p.maxHp = 130;
      p.mission = true;
      p.place(x, z);
      p.arm('carbine');
      p.y = groundHeight(x, z);
      this.addPed(p);
      this.allies.push(p);
    }
  }
  recruitAlly(a: Ped) {
    if (a.recruited || this.allies.filter((q) => q.recruited).length >= 3) {
      if (!a.recruited) this.ev.onToast('Your crew is full (3 max)', 'warn');
      return;
    }
    a.recruited = true;
    a.formation = this.allies.filter((q) => q.recruited).length - 1;
    a.followT = 0;
    this.audio.pickup();
    this.ev.onToast('Crew member joined your crew', 'good');
  }
  allyShoot(shooter: Ped, target: Ped) {
    const m = shooter.muzzle(new THREE.Vector3());
    const tx = target.x, ty = 1.2, tz = target.z;
    const hit = Math.random() < 0.62;
    const ex = tx + (hit ? 0 : (Math.random() - 0.5) * 3);
    const ez = tz + (hit ? 0 : (Math.random() - 0.5) * 3);
    this.fx.tracer(m.x, m.y, m.z, ex, ty, ez);
    this.audio.shot('carbine', Math.max(0.1, 1 - Math.hypot(m.x - this.camX, m.z - this.camZ) / 90), this.panOf(m.x, m.z));
    if (hit && !target.dead) {
      const dx = tx - shooter.x, dz = tz - shooter.z;
      const l = Math.hypot(dx, dz) || 1;
      target.hit(this, 22, dx / l, dz / l, false);
      this.fx.blood(tx, 1.2, tz, dx / l, dz / l);
    } else this.fx.spark(ex, 1.0, ez, 0, 1, 0);
  }
  throwGrenade(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const gr = new Grenade(x, y, z, vx, vy, vz);
    this.scene.add(gr.mesh);
    this.grenadeList.push(gr);
  }
  fireRocket(x: number, y: number, z: number, dx: number, dy: number, dz: number) {
    const rk = new Rocket(x, y, z, dx, dy, dz);
    this.scene.add(rk.mesh);
    this.rocketList.push(rk);
  }
  spawnHighwayCars() {
    const H = DECK.H;
    // Inner elevated ring highway traffic
    const ringPts: [number, number][] = [[-634, -634], [634, -634], [634, 614], [-634, 614]];
    for (let i = 0; i < 8; i++) {
      const seg = i % 4;
      const a = ringPts[seg], b = ringPts[(seg + 1) % 4];
      const t = (i / 8) % 1;
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const v = this.spawnVehicle((['sedan', 'suv', 'sports', 'van'] as VehicleType[])[i % 4], x, z, Math.atan2(b[0] - a[0], b[1] - a[1]), { mode: 'hw', tag: 'hw', driver: 'civ' });
      v.y = H;
      v.lightsOn = true;
      this.hwCars.push({ v, pts: ringPts, i: (seg + 1) % 4, speed: 20 + Math.random() * 9, elevated: true });
    }
    // Outer 10km Beltway & Desert Expressway traffic
    const beltPts: [number, number][] = [[-2994, -2994], [2994, -2994], [2994, 0], [-2994, 0]];
    for (let i = 0; i < 8; i++) {
      const seg = i % 4;
      const a = beltPts[seg], b = beltPts[(seg + 1) % 4];
      const t = ((i * 0.37) % 1);
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const v = this.spawnVehicle((['sports', 'pickup', 'suv', 'sedan'] as VehicleType[])[i % 4], x, z, Math.atan2(b[0] - a[0], b[1] - a[1]), { mode: 'hw', tag: 'hw-outer', driver: 'civ' });
      v.y = groundHeight(x, z);
      v.lightsOn = true;
      this.hwCars.push({ v, pts: beltPts, i: (seg + 1) % 4, speed: 26 + Math.random() * 11, elevated: false });
    }
  }
  updateHighwayCars(dt: number) {
    for (const c of this.hwCars) {
      const v = c.v;
      if (v.mode !== 'hw') continue;
      const tgt = c.pts[c.i];
      const dx = tgt[0] - v.x, dz = tgt[1] - v.z;
      const d = Math.hypot(dx, dz);
      if (d < 16) { c.i = (c.i + 1) % c.pts.length; continue; }
      const yaw = Math.atan2(dx, dz);
      v.yaw = dampAngle(v.yaw, yaw, 3, dt);
      v.x += Math.sin(v.yaw) * c.speed * dt;
      v.z += Math.cos(v.yaw) * c.speed * dt;
      v.vx = Math.sin(v.yaw) * c.speed; v.vz = Math.cos(v.yaw) * c.speed;
      v.y = c.elevated ? DECK.H : groundHeight(v.x, v.z);
      v.fwd = c.speed; v.steerIn = clamp((yaw - v.yaw) * 0.4, -1, 1);
      v.wheelRot += (c.speed * dt) / v.spec.wheelR;
      v.updateVisual(this);
    }
  }

  // =============================================================== HUD
  prompts(): string | null {
    const p = this.player;
    if (!p.alive) return null;
    if (this.interior) {
      const room = this.interior.room;
      if (room.kind === 'gun' && Math.hypot(p.x - room.cx, p.z - (room.cz + 4)) < 6) return 'Press F — Buy weapons / ammo';
      return this.insideT > 1.2 && Math.hypot(p.x - room.cx, p.z - (room.cz + room.d / 2 - 1.4)) < 2.2 ? 'Press F — Exit to the street' : null;
    }
    if (p.vehicle) return null;
    for (const a of this.allies) if (!a.recruited && !a.dead && Math.hypot(a.x - p.x, a.z - p.z) < 2.8) return 'Press F — Recruit ally to your crew';
    const dn = this.doorNear();
    if (dn) return `Press F — Enter ${dn.door.name}`;
    const gs = this.city.places.gunshop;
    if (gs && Math.hypot(p.x - gs.x, p.z - gs.z) < 3.5) return 'Press F — Ammu-Nation (buy weapons / refill ammo)';
    let bd = 3.2;
    let found = false;
    for (const v of this.vehicles) {
      if (v.mode === 'wreck') continue;
      const c = v.circles();
      for (let i = 0; i < c.length; i += 3) if (Math.hypot(p.x - c[i], p.z - c[i + 1]) - c[i + 2] < bd) found = true;
    }
    return found ? 'Press F to enter vehicle' : null;
  }

  emitHud(force: boolean) {
    this.hudT -= force ? 1 : this.dt || 0.016;
    if (this.hudT > 0 && !force) return;
    this.hudT = 0.1;
    const p = this.player;
    const pv = p.vehicle;
    const w = WEAPONS[p.weapon];
    const m = this.mission;
    const owned = WEAPON_ORDER.filter((id) => p.owned.has(id));
    let finder: HudState['finder'] = null;
    if (this.finderOn) {
      let ang = 0;
      if (this.finderBest) {
        const dx = this.finderBest.x - p.x, dz = this.finderBest.z - p.z;
        ang = Math.atan2(dx, dz) - this.camYaw;
      }
      finder = { on: true, dist: this.finderBest ? this.finderDist : -1, angle: ang };
    }
    const next = !m && this.missionIdx < MISSIONS.length ? MISSIONS[this.missionIdx].title : null;
    const surf = this.interior ? 'interior' : surfaceAt(p.x, p.z, p.y);
    this.ev.onHud({
      hp: Math.max(0, Math.round(p.hp)),
      armor: Math.round(p.armor),
      stamina: Math.round(p.move.stamina),
      money: p.money,
      wanted: this.wanted,
      searching: this.searching,
      weapon: w.name,
      weaponIdx: owned.indexOf(p.weapon) + 1,
      weaponCount: owned.length,
      ammo: isMeleeWeapon(p.weapon) ? null : p.ammo[p.weapon],
      time: this.clockString,
      mission: m ? { title: m.def.title, objective: this.objective, timer: this.timer.t, timerLabel: this.timer.label, progress: this.progress } : null,
      subtitle: this.sub ? { who: this.sub.who, text: this.sub.text } : null,
      prompt: this.prompts(),
      speed: pv ? Math.round(Math.abs(pv.fwd) * 3.6) : null,
      vehicleName: pv ? pv.spec.name : null,
      vehicleHp: pv ? Math.round((pv.hp / pv.maxHp) * 100) : null,
      radio: pv ? this.audio.stations[this.radioStation] : null,
      packages: [this.packagesFound, this.packagesTotal],
      finder,
      aiming: !pv && (this.input.aim || this.scope),
      crosshair: !pv && !isMeleeWeapon(p.weapon) && p.alive && !this.scope,
      scope: this.scope,
      allies: this.allies.filter((a) => a.recruited && !a.dead).length,
      recruitable: this.allies.filter((a) => !a.recruited && !a.dead).length,
      grenades: p.ammo.grenade,
      indoor: this.interior ? this.interior.name : null,
      hurt: p.hurtT,
      fps: this.fps,
      mapOpen: this.mapOpen,
      paused: this.state === 'paused',
      locked: this.input.locked,
      nextMission: next,
      crouching: p.move.crouching,
      sliding: p.move.slideT > 0,
      district: this.interior ? this.interior.name.toUpperCase() : districtNameAt(p.x, p.z, p.y),
      surface: surf,
      sandGrip: !this.interior && (surf === 'sand' || surf === 'wet_sand'),
      coords: [Math.round(p.x), Math.round(p.z)],
    });
  }
}
void HALF; void BOUNDS; void doNpcShoot; void castRay; void doDeploy; void TARGET_LOOK;
export type { Collider };
