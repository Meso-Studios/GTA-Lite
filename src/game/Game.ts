// Main game engine: renderer, loop, player, world simulation, HUD data.
import * as THREE from 'three';
import { RayTracePipeline } from './raytracePass';
import { buildRtxEnvironments, RtxEnvPack } from './rtxEnv';
import {
  BOUNDS, DECK, HALF, MovementState, NB, Rng, WEAPONS, WEAPON_ORDER, WEAPON_SHOP_ORDER, WeaponId,
  applySandFootPhysics, blockCenter, clamp, createMovementState, dampAngle, districtNameAt, groundHeight,
  isMeleeWeapon, lerp, nearestNode, sandFactorAt, smooth, stepMovementState, surfaceAt,
} from './config';
import { buildCity, CityData } from './city';
import { Room, roomForDoor } from './interiors';
import { interiorFloorHeight } from './interiorMath';
import type { Door } from './buildings';
import { Vehicle } from './vehicle';
import { Ped, PedKind } from './ped';
import { Prop, Pickup, PickKind, Grenade, Rocket } from './props';
import { FX } from './fx';
import { GameAudio } from './audio';
import { World, PushOut } from './world';
import { PLAYER_LOOK, TARGET_LOOK, GunKind, animateHuman, createHuman, gangLook, guardLook, HumanRig, setWeapon, civilianLook, touristLook, upgradeHumanToGlb } from './humans';
import { VehicleType, beamMaterial, headMat, tailDim, sirenRed, sirenBlue, paintMat, setVehicleRtx, upgradeVehicleToGlb, repaintVehicleGlb } from './vehicles';
import { castRay, explode as doExplode, npcShoot as doNpcShoot, playerFire, playerMelee } from './combat';
import { MapRenderer, buildRoute } from './minimap';
import { SpawnOpts, deployCops as doDeploy, removeVehicle, spawnVehicle as doSpawnVehicle, streamCrowds, streamParked, streamPeds, updatePolice, spawnFreeCitySpawnPlaza } from './spawn';
import { MISSIONS, MissionDef } from './missions';
import { Look } from './humans';
import { Collider } from './world';
import { AmbientCandidate, AmbientDialogueController, AmbientSubtitle } from './ambientDialogue';
import { GLB_CITY_LANDMARKS, cloneBuildingGlb, cloneLandmarkPropGlb, getGlbStatus, isGlbWorldMode, onGlbAssetReady, preloadGlbAssets, setGlbRtx, setGlbWorldMode } from './glbAssets';
import type { BareHandMove } from './subAnimations';
import { NpcVoiceEngine, VoiceKind } from './npcVoices';
import { ANIMATION_COUNT } from './animations';
import { TrafficManager, getDistrictTrafficMultiplier } from './trafficManager';
import { FREE_CITY_LABELS } from './freeCityNpc';
import { microtextures } from './microtextures';
import {
  type NpcLifeWorld,
  createNpcLifeWorld,
  evaluateWitnessReasoning,
  registerCitizen,
  stepNpcLifeWorld,
  triggerUnrelatedLifeSituation,
  tryCreateSharedPlan,
  unregisterCitizen,
} from './npcLifeSim';
import {
  BANK_BRANCHES,
  type BankHeistState,
  type BankingState,
  createBankingState,
  depositCash,
  findNearestBankOrAtm,
  startBankRobbery,
  stepBankHeist,
  withdrawCash,
} from './bankingSystem';
import {
  RANDOM_EVENTS,
  type RandomEventManager,
  createRandomEventManager,
  resolveActiveRandomEvent,
  spawnRandomEventNear,
} from './randomEvents';
import {
  type PhoneAppId,
  type PhoneState,
  type SnapNovaPost,
  createPhoneState,
  endPhoneCall,
  publishSnapNovaPost,
  sendSmsMessage,
  startPhoneCall,
  togglePostLike,
} from './phoneSystem';

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
  ambientSubtitle: { who: string; text: string; kind: string } | null;
  prompt: string | null;
  speed: number | null; vehicleName: string | null; vehicleHp: number | null; radio: string | null;
  packages: [number, number];
  finder: { on: boolean; dist: number; angle: number } | null;
  aiming: boolean; crosshair: boolean; hurt: number; fps: number; mapOpen: boolean; paused: boolean; locked: boolean; scope: boolean; allies: number; recruitable: number; grenades: number; indoor: string | null;
  nextMission: string | null;
  crouching: boolean; sliding: boolean; district: string; surface: string; sandGrip: boolean; coords: [number, number];
  aircraft: { altitude: number; airspeed: number; throttle: number; stalling: boolean; onGround: boolean } | null;
  mobileMode: boolean;
  rtxEnabled: boolean;
  goreEnabled: boolean;
  voicesEnabled: boolean;
  hdGlbMode: boolean;
  microtexturesEnabled: boolean;
  experimentalBodyLogic: boolean;
  trafficSummary: string;
  freeCityCount: number;
  speakingVoice: string | null;
  animCount: number;
  playerAnim: string;
  glbLoaded: number;
  glbTotal: number;
  glbFailed: number;
  storeCount: number;
  bankBalance: number;
  bankOpen: boolean;
  bankModalInfo: { kind: 'bank' | 'atm'; id: string; name: string } | null;
  heist: BankHeistState;
  phoneOpen: boolean;
  phoneUnread: number;
  activeEvent: { title: string; headline: string; dialogue: string; dist: number; rewardCash: number; category: string } | null;
  randomEventsTotal: number;
  randomEventsDone: number;
  activePlansCount: number;
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
  rayTrace: RayTracePipeline | null = null;
  sun: THREE.DirectionalLight;
  bounceLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  neonLight: THREE.PointLight;
  neonLight2: THREE.PointLight;
  rtxEnvs: RtxEnvPack;
  private rtxShadowTight = true;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  spots: THREE.SpotLight[] = [];
  frustum = new THREE.Frustum();
  projM = new THREE.Matrix4();
  container: HTMLElement;
  quality: Quality;
  mobileMode = false;
  rtxEnabled = true;
  goreEnabled = true;
  voicesEnabled = true;
  hdGlbMode = isGlbWorldMode();
  microtexturesEnabled = true;
  experimentalBodyLogic = false;
  trafficManager = new TrafficManager();
  voices = new NpcVoiceEngine();
  npcLife: NpcLifeWorld = createNpcLifeWorld();
  banking: BankingState = createBankingState(2500);
  bankOpen = false;
  bankModalInfo: { kind: 'bank' | 'atm'; id: string; name: string } | null = null;
  randomEvents: RandomEventManager = createRandomEventManager();
  phone: PhoneState = createPhoneState();
  private npcLifePlanT = 2.5;
  private npcPosMap = new Map<number, { x: number; z: number }>();
  private meleeTokenOwner = 0;
  private meleeTokenTimer = 0;
  private eventMarker: THREE.Group | null = null;
  private _sunPosTmp = new THREE.Vector3();
  private glbUnsub: (() => void) | null = null;
  private glbLandmarksPlaced = new Set<string>();
  private glbLandmarkGroup = new THREE.Group();
  private glbPropsPlaced = new Set<string>();
  private glbPropCluster = new THREE.Group();
  private staticDirty = true;
  private lastSpokenAmbientKey = '';
  private storyVoiceSeq = 1;
  recoilT = 0;
  prevPlayerYaw = Math.PI / 2;
  touch = {
    moveX: 0, moveY: 0, lookDx: 0, lookDy: 0,
    sprint: false, fire: false, aim: false, crouch: false,
    handbrake: false, gas: 0, brake: 0, pitch: 0, throttle: 0, horn: false,
  };
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
    alive: true, fireT: 0, punchT: 0, punchDur: 0.36, punchMove: 'jab_left' as BareHandMove, comboIdx: 0, comboResetT: 0, guardT: 0, jumpT: 0, hurtT: 0,
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
  ambientDialogue = new AmbientDialogueController();
  ambientSub: AmbientSubtitle | null = null;
  private ambientCandidates: AmbientCandidate[] = [];
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
    const pr = this.isSoftwareGl ? 1 : Q.pr;

    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = shadowsOn;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.35, 5800);
    this.scene.add(this.camera);

    // True WebGL2 Screen-Space Ray-Tracing post-process pass (SSR + SSRT contact shadows + RTAO/SSGI)
    if (!this.isSoftwareGl) {
      this.rayTrace = new RayTracePipeline(w, h, pr);
    }

    // Ultra-realistic 4-light physically balanced outdoor GI + rim rig
    this.hemi = new THREE.HemisphereLight(0xc2dcff, 0x6f614f, 0.88);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff5e4, 3.15);
    this.sun.castShadow = shadowsOn;
    this.sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -68; sc.right = 68; sc.top = 68; sc.bottom = -68; sc.near = 1; sc.far = 650;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.2;
    this.scene.add(this.sun, this.sun.target);
    // Cool sky / warm ground bounce fill light
    this.bounceLight = new THREE.DirectionalLight(0x7cc4ff, 0.56);
    this.scene.add(this.bounceLight, this.bounceLight.target);
    // Subtle high-angle rim light to sculpt GLB car creases, silhouettes & wet clearcoat
    this.rimLight = new THREE.DirectionalLight(0xffe6cc, 0.32);
    this.scene.add(this.rimLight, this.rimLight.target);
    // Dual opposite-side elevated neon street bounce GI at dusk/night (soft wide wash, zero hotspot burn)
    this.neonLight = new THREE.PointLight(0xff4da2, 0, 74, 1.35);
    this.neonLight2 = new THREE.PointLight(0x28d8f8, 0, 74, 1.35);
    this.scene.add(this.neonLight, this.neonLight2);
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(0xfff0cf, 0, 75, 0.5, 0.6, 1.4);
      this.scene.add(s, s.target);
      this.spots.push(s);
    }

    // sky + dynamic Day/Sunset/Night/Flat HDR PMREM environments (active on all devices!)
    this.skyMat = skyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4400, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0x9cc3e6, 260, 3100);
    this.rtxEnvs = buildRtxEnvironments(this.renderer);
    this.scene.environment = this.rtxEnvs.day;
    if (this.isSoftwareGl) {
      this.hemi.intensity = 1.15;
    }

    // Begin preloading real binary .glb models for cars, hero buildings, player & NPCs
    preloadGlbAssets();

    // world
    this.city = buildCity();
    this.world = this.city.world;
    this.rooms = this.city.rooms ?? [];
    this.scene.add(this.city.group);
    this.scene.add(this.glbLandmarkGroup);
    this.scene.add(this.glbPropCluster);
    this.fx = new FX(this.scene);
    this.mapR = new MapRenderer(this.city);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[SanNova] WebGL context lost — pausing heavy GLB upgrades');
    });
    this.glbUnsub = onGlbAssetReady(() => this.syncGlbAssets());
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffe8c4, 0, 26, 1.65);
      this.scene.add(l);
      this.intLights.push(l);
    }
    this.spawnAllies();
    this.spawnHighwayCars();
    this.spawnAircraft();
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
    // Pulsing gold beacon for active Random World Events
    {
      const eg = new THREE.Group();
      const eBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.75, 42, 16, 1, true).translate(0, 21, 0),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      const eRing = new THREE.Mesh(
        new THREE.RingGeometry(1.1, 1.45, 36).rotateX(-Math.PI / 2).translate(0, 0.28, 0),
        new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      );
      eg.add(eBeam, eRing);
      eg.visible = false;
      this.scene.add(eg);
      this.eventMarker = eg;
    }
    // player
    this.player.rig = createHuman(PLAYER_LOOK);
    this.player.rig.kindHint = 'player';
    this.scene.add(this.player.rig.root);
    setWeapon(this.player.rig, 'pistol');
    // props
    for (const p of this.city.props) {
      const pr = new Prop(p.kind, p.x, p.z);
      const dCam = Math.hypot(pr.x - this.player.x, pr.z - this.player.z);
      pr.mesh.visible = dCam < (this.isSoftwareGl ? 62 : 125);
      this.props.push(pr);
      this.scene.add(pr.mesh);
    }
    this.setupPickups();
    this.setupInput();
    this.applyTime(0);
    this.updateCamera(0.016, true);
    // Hero spawn showcase cars & Free City plaza NPCs
    this.spawnVehicle('sports', -276.2, 34, 0, { mode: 'parked', paint: 0xd92626, tag: 'spawn-ferrari' });
    this.spawnVehicle('van', -276.2, 22, 0, { mode: 'parked', paint: 0xf2f4f8, tag: 'spawn-milktruck' });
    spawnFreeCitySpawnPlaza(this);
    // initial population (time-of-day dynamic traffic, parked, peds, tourist crowds)
    for (let i = 0; i < 60; i++) {
      this.trafficManager.update(this, 1, 1.15);
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
    add('weapon', -276.2, 16.2, 36, 'revolver');
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
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.code === 'Escape') {
        if (this.phone.open) this.togglePhone(false);
        if (this.bankOpen) this.closeBankModal();
      }
      return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Tab' && this.state === 'playing' && !this.mapOpen) {
      this.togglePhone();
      return;
    }
    this.input.keys.add(e.code);
    this.input.pressed.add(e.code);
    if (e.code === 'KeyM' && this.state === 'playing' && !this.phone.open && !this.bankOpen) { this.setMapOpen(!this.mapOpen); return; }
    if (e.code === 'Escape' && this.phone.open) { this.togglePhone(false); return; }
    if (e.code === 'Escape' && this.bankOpen) { this.closeBankModal(); return; }
    if (e.code === 'Escape' && this.mapOpen) { this.setMapOpen(false); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
  };
  onKeyUp = (e: KeyboardEvent) => { this.input.keys.delete(e.code); };
  onMouseMove = (e: MouseEvent) => {
    this.input.mx = e.clientX; this.input.my = e.clientY;
    if (this.input.locked) { this.input.dx += e.movementX; this.input.dy += e.movementY; }
  };
  onMouseDown = (e: MouseEvent) => {
    if (this.state !== 'playing' || this.phone.open || this.bankOpen) return;
    if (e.button === 0) this.input.fire = true;
    if (e.button === 2) this.input.aim = true;
  };
  onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.input.fire = false;
    if (e.button === 2) this.input.aim = false;
  };
  onWheel = (e: WheelEvent) => {
    if (this.state !== 'playing' || this.player.vehicle || this.phone.open || this.bankOpen) return;
    this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
  };
  onCtx = (e: Event) => e.preventDefault();
  onLockChange = () => {
    const wasLocked = this.input.locked;
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.input.locked = locked;
    this.ev.onLock(locked);
    if (wasLocked && !locked && this.state === 'playing' && this.running && !this.mapOpen && !this.phone.open && !this.bankOpen) this.setPaused(true);
  };
  onLockError = () => { this.lockFailed = true; };
  onCanvasClick = () => {
    this.audio.init();
    if (this.mobileMode || this.phone.open || this.bankOpen) return;
    if (this.state === 'playing' && !this.input.locked) this.requestLock();
  };
  onResize = () => {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    const pr = this.isSoftwareGl ? 1 : this.quality.pr;
    this.renderer.setSize(w, h);
    this.rayTrace?.setSize(w, h, pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.staticDirty = true;
  };
  requestLock() {
    if (this.mobileMode) return;
    try {
      const p = (this.renderer.domElement as any).requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignore */ }
  }

  setMobileMode(enabled: boolean) {
    this.mobileMode = enabled;
    if (enabled && document.pointerLockElement) document.exitPointerLock();
    this.touch.moveX = 0; this.touch.moveY = 0;
    this.touch.fire = false; this.touch.aim = false;
    this.touch.gas = 0; this.touch.brake = 0; this.touch.pitch = 0; this.touch.throttle = 0;
    this.emitHud(true);
  }
  setRtxEnabled(enabled: boolean) {
    this.rtxEnabled = enabled;
    this.city.setRtx(enabled);
    setVehicleRtx(enabled);
    setGlbRtx(enabled);
    this.applyTime(0);
    this.staticDirty = true;
    this.emitHud(true);
  }
  setGoreEnabled(enabled: boolean) {
    this.goreEnabled = enabled;
    this.fx.setGoreEnabled(enabled);
    this.emitHud(true);
  }
  setVoicesEnabled(enabled: boolean) {
    this.voicesEnabled = enabled;
    this.voices.setEnabled(enabled);
    this.emitHud(true);
  }
  setVoiceVolume(vol01: number) {
    this.voices.setMasterVolume(vol01);
  }
  setHdGlbMode(enabled: boolean) {
    this.hdGlbMode = enabled;
    setGlbWorldMode(enabled);
    this.syncGlbAssets();
    this.staticDirty = true;
    this.emitHud(true);
  }
  setMicrotexturesEnabled(enabled: boolean) {
    this.microtexturesEnabled = enabled;
    this.city.setMicrotextures(enabled);
    microtextures.setEnabled(enabled);
    this.staticDirty = true;
    this.emitHud(true);
  }
  setExperimentalBodyLogic(enabled: boolean) {
    this.experimentalBodyLogic = enabled;
    for (const p of this.peds) p.experimentalBodyLogic = enabled;
    this.staticDirty = true;
    this.ev.onToast(
      enabled
        ? 'BETA Body-Logic Kinematics ON — NPCs moving purely via IK & physics!'
        : 'Standard NPC animations restored',
      'info',
    );
    this.emitHud(true);
  }

  // =============================================================== GTA 5 Smartphone API
  togglePhone(forceOpen?: boolean) {
    const next = forceOpen !== undefined ? forceOpen : !this.phone.open;
    if (next === this.phone.open) return;
    this.phone.open = next;
    if (next) {
      this.bankOpen = false;
      this.input.fire = false;
      this.input.aim = false;
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (this.state === 'playing' && !this.mobileMode && !this.mapOpen) {
      this.requestLock();
    }
    this.emitHud(true);
  }
  setPhoneApp(app: PhoneAppId) {
    this.phone.activeApp = app;
    if (app === 'messages') {
      this.phone.unreadByContact[this.phone.selectedContactId] = 0;
    }
    this.emitHud(true);
  }
  selectPhoneContact(contactId: string) {
    this.phone.selectedContactId = contactId;
    this.phone.unreadByContact[contactId] = 0;
    this.emitHud(true);
  }
  sendPhoneSms(contactId: string, text: string) {
    if (!text.trim()) return;
    sendSmsMessage(this.phone, contactId, text, this.clockString);
    this.audio.beep(680, 0.05);
    this.emitHud(true);
  }
  callPhoneContact(contactId: string) {
    const call = startPhoneCall(this.phone, contactId);
    if (!call) return;
    this.audio.beep(520, 0.09);
    if (!call.actionDispatched) {
      call.actionDispatched = true;
      const p = this.player;
      switch (call.action) {
        case 'mechanic_deliver_car': {
          if (this.interior) {
            this.ev.onToast('Step outside to receive your delivered supercar!', 'warn');
          } else {
            const ang = p.yaw;
            const sx = p.x + Math.sin(ang) * 9.5;
            const sz = p.z + Math.cos(ang) * 9.5;
            const v = this.spawnVehicle('sports', sx, sz, ang + Math.PI * 0.5, { mode: 'idle', paint: 0xdc2626, tag: 'mechanic-drop' });
            v.y = groundHeight(sx, sz);
            this.ev.onToast('Tito Customs delivered a tuned Supercar right ahead!', 'good');
          }
          break;
        }
        case 'fixer_clear_wanted': {
          if (this.wanted === 0) {
            this.ev.onToast('Vesper: You have zero heat right now — save your cash.', 'info');
          } else if (p.money >= 350) {
            p.money -= 350;
            this.wanted = 0;
            this.searching = false;
            this.audio.cash();
            this.ev.onToast('Vesper wiped police dispatch (-$350). Wanted level cleared!', 'good');
          } else if (this.banking.bankBalance >= 350) {
            withdrawCash(this.banking, p.money, 350, this.clockString);
            this.wanted = 0;
            this.searching = false;
            this.audio.cash();
            this.ev.onToast('Vesper wired $350 from NovaBank. Wanted level cleared!', 'good');
          } else {
            this.ev.onToast('Vesper needs $350 to clear your wanted level.', 'warn');
          }
          break;
        }
        case 'dispatch_911': {
          if (!this.interior) {
            const sx = p.x + Math.sin(p.yaw + 0.8) * 18;
            const sz = p.z + Math.cos(p.yaw + 0.8) * 18;
            const v = this.spawnVehicle('police', sx, sz, p.yaw, { mode: 'idle', driver: 'cop', tag: '911-unit' });
            v.siren = true;
            this.ev.onToast('911 Dispatch: Patrol cruiser & EMS arriving nearby!', 'info');
          }
          break;
        }
        case 'crew_backup': {
          if (!this.interior && this.allies.filter((a) => a.recruited && !a.dead).length < 3) {
            const rng = new Rng((Date.now() & 0xffffff) + 91);
            const a = new Ped('ally', gangLook(rng, 0xec4899));
            a.hp = a.maxHp = 140;
            a.mission = true;
            a.recruited = true;
            a.formation = this.allies.filter((q) => q.recruited).length;
            a.place(p.x + 2.4, p.z + 2.4);
            a.y = groundHeight(a.x, a.z);
            a.arm('carbine');
            this.addPed(a);
            this.allies.push(a);
            this.ev.onToast('Maya Vega arrived to back up your crew!', 'good');
          } else {
            this.ev.onToast('Maya: Your crew is already rolling deep!', 'info');
          }
          break;
        }
        case 'friend_hangout': {
          if (!this.interior) {
            const ev = spawnRandomEventNear(this.randomEvents, p.x, p.z, this.hour);
            this.ev.onToast(`Marco tipped you off: ${ev.def.title} nearby!`, 'info');
          }
          break;
        }
      }
    }
    this.emitHud(true);
  }
  hangUpPhone() {
    endPhoneCall(this.phone);
    this.audio.beep(320, 0.06);
    this.emitHud(true);
  }
  captureCanvasPhoto(): string | null {
    try {
      // Force an immediate fresh frame so preserveDrawingBuffer=false never yields a blank black snapshot
      this.render();
      return this.renderer.domElement.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }
  postSnapNovaPhoto(caption: string, filter: SnapNovaPost['filter'], imageDataUrl: string | null) {
    const loc = this.interior ? this.interior.name.toUpperCase() : districtNameAt(this.player.x, this.player.z, this.player.y);
    publishSnapNovaPost(this.phone, {
      caption,
      location: loc,
      filter,
      imageDataUrl,
      timeStr: this.clockString,
    });
    this.audio.pickup();
    this.ev.onToast('Posted live to SnapNova!', 'good');
    this.emitHud(true);
  }
  likeSnapNovaPost(postId: number) {
    togglePostLike(this.phone, postId);
    this.emitHud(true);
  }

  // =============================================================== Banking & Heist API
  openBankModal(kind: 'bank' | 'atm', id: string, name: string) {
    this.bankOpen = true;
    this.bankModalInfo = { kind, id, name };
    this.phone.open = false;
    this.input.fire = false;
    this.input.aim = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.emitHud(true);
  }
  closeBankModal() {
    if (!this.bankOpen) return;
    this.bankOpen = false;
    if (this.state === 'playing' && !this.mobileMode && !this.mapOpen && !this.phone.open) {
      this.requestLock();
    }
    this.emitHud(true);
  }
  bankDeposit(amount: number): { ok: boolean; message: string } {
    const res = depositCash(this.banking, this.player.money, amount, this.clockString);
    if (res.ok) {
      this.player.money = res.newWallet;
      this.audio.cash();
      this.ev.onToast(res.message, 'good');
    } else {
      this.ev.onToast(res.message, 'warn');
    }
    this.emitHud(true);
    return { ok: res.ok, message: res.message };
  }
  bankWithdraw(amount: number): { ok: boolean; message: string } {
    const res = withdrawCash(this.banking, this.player.money, amount, this.clockString);
    if (res.ok) {
      this.player.money = res.newWallet;
      this.audio.cash();
      this.ev.onToast(res.message, 'cash');
    } else {
      this.ev.onToast(res.message, 'warn');
    }
    this.emitHud(true);
    return { ok: res.ok, message: res.message };
  }
  bankStartRobbery(branchId: string): { ok: boolean; message: string } {
    const res = startBankRobbery(this.banking, branchId);
    if (!res.ok) {
      this.ev.onToast(res.message, 'warn');
      this.emitHud(true);
      return { ok: false, message: res.message };
    }
    this.closeBankModal();
    this.wanted = Math.max(this.wanted, res.wantedStars);
    this.lastSeen = this.time;
    this.audio.beep(880, 0.25);
    this.ev.onToast(res.message, 'warn');
    // Alert nearby guards & frighten tellers
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (ped.indoor && ped.indoorRole === 'guard') {
        ped.hostile = true;
        ped.aggro = true;
        ped.arm('pistol');
      } else if (ped.indoor) {
        ped.handsUp = 18;
      }
    }
    // Spawn 2 armored bank response guards outside/near the vault
    const branch = BANK_BRANCHES.find((b) => b.id === branchId) ?? BANK_BRANCHES[0];
    const bx = this.interior ? this.interior.room.cx : branch.x;
    const bz = this.interior ? this.interior.room.cz + 6 : branch.z + 8;
    for (let i = 0; i < 2; i++) {
      const gPed = this.spawnEnemy('guard', bx + (i === 0 ? -3.2 : 3.2), bz, { weapon: 'smg', hp: 75, aggro: true, tag: 'bank-guard' });
      if (this.interior) {
        gPed.indoor = true;
        gPed.y = this.interior.room.elevation.baseY;
      }
    }
    this.emitHud(true);
    return { ok: true, message: res.message };
  }

  claimMeleeToken(pedId: number, dist: number): boolean {
    if (dist > 3.2) return false;
    if (this.meleeTokenOwner === pedId) {
      this.meleeTokenTimer = 0.85;
      return true;
    }
    if (this.meleeTokenTimer <= 0 || this.meleeTokenOwner === 0) {
      this.meleeTokenOwner = pedId;
      this.meleeTokenTimer = 0.85;
      return true;
    }
    return false;
  }
  /** Upgrades spawned vehicles, props, pickups, player, NPCs & curated landmarks to real .glb / Model-Site .glb models. */
  syncGlbAssets() {
    try {
      if (this.player.rig) upgradeHumanToGlb(this.player.rig, this.hdGlbMode, 'player');
    } catch { /* isolate player GLB upgrade */ }
    for (const p of this.peds) {
      try { upgradeHumanToGlb(p.rig, this.hdGlbMode, p.rig.kindHint); } catch { /* isolate ped GLB */ }
    }
    for (const v of this.vehicles) {
      try {
        upgradeVehicleToGlb(v.model, v.type, this.hdGlbMode, v === this.player.vehicle || v.tag === 'spawn-ferrari');
      } catch { /* isolate vehicle GLB */ }
    }
    for (const pr of this.props) {
      try { pr.setGlbMode(this.hdGlbMode); } catch { /* isolate prop GLB */ }
    }
    for (const pk of this.pickups) {
      try { pk.setGlbMode(this.hdGlbMode); } catch { /* isolate pickup GLB */ }
    }
    this.staticDirty = true;

    this.glbLandmarkGroup.visible = this.hdGlbMode;
    this.glbPropCluster.visible = this.hdGlbMode;

    if (this.hdGlbMode) {
      for (const lm of GLB_CITY_LANDMARKS) {
        const key = `${lm.key}_${lm.x}_${lm.z}`;
        if (this.glbLandmarksPlaced.has(key)) continue;
        try {
          const mesh = cloneBuildingGlb(lm.key, lm.tint);
          if (!mesh) continue;
          const gy = groundHeight(lm.x, lm.z);
          // Seat landmark slightly into the plaza slab so plinth never floats at curb edges
          mesh.position.set(lm.x, gy - 0.08, lm.z);
          mesh.rotation.y = lm.yaw;
          if (lm.scale) mesh.scale.setScalar(lm.scale);
          this.glbLandmarkGroup.add(mesh);
          this.world.addBox(lm.x - lm.halfW, lm.x + lm.halfW, lm.z - lm.halfD, lm.z + lm.halfD, gy + lm.height, lm.label);
          this.glbLandmarksPlaced.add(key);
        } catch { /* isolate single landmark */ }
      }

      const heroProps: { key: 'palm' | 'lamp'; x: number; z: number; yaw: number; scale: number }[] = [
        { key: 'palm', x: -295.6, z: 22, yaw: 0.3, scale: 1.0 },
        { key: 'palm', x: -295.6, z: 38, yaw: 1.9, scale: 0.95 },
        { key: 'lamp', x: -274.4, z: 29, yaw: -Math.PI / 2, scale: 1.0 },
      ];
      for (const hp of heroProps) {
        const k = `${hp.key}_${hp.x}_${hp.z}`;
        if (this.glbPropsPlaced.has(k)) continue;
        try {
          const obj = cloneLandmarkPropGlb(hp.key);
          if (!obj) continue;
          obj.position.set(hp.x, groundHeight(hp.x, hp.z) - 0.04, hp.z);
          obj.rotation.y = hp.yaw;
          obj.scale.setScalar(hp.scale);
          this.glbPropCluster.add(obj);
          this.glbPropsPlaced.add(k);
        } catch { /* isolate hero prop */ }
      }
    }
  }
  setTouchMove(x: number, y: number) {
    this.touch.moveX = clamp(x, -1, 1);
    this.touch.moveY = clamp(y, -1, 1);
  }
  addTouchLook(dx: number, dy: number) {
    this.touch.lookDx += dx;
    this.touch.lookDy += dy;
    this.lastMouse = this.time;
  }
  setTouchAction(
    action:
      | 'fire' | 'aim' | 'sprint' | 'crouch' | 'jump' | 'interact' | 'scope' | 'horn'
      | 'gas' | 'brake' | 'handbrake' | 'pitchUp' | 'pitchDown' | 'thrUp' | 'thrDown'
      | 'prevWeapon' | 'nextWeapon' | 'radio',
    down: boolean,
  ) {
    this.audio.init();
    switch (action) {
      case 'fire': this.touch.fire = down; break;
      case 'aim': this.touch.aim = down; break;
      case 'sprint': this.touch.sprint = down; break;
      case 'crouch':
        this.touch.crouch = down;
        if (down) this.input.pressed.add('KeyC');
        break;
      case 'jump':
        if (down) { this.input.pressed.add('Space'); this.input.keys.add('Space'); }
        else this.input.keys.delete('Space');
        break;
      case 'interact':
        if (down) this.interact();
        break;
      case 'scope':
        if (down && !this.player.vehicle) this.input.pressed.add('KeyG');
        break;
      case 'horn': this.touch.horn = down; break;
      case 'gas': this.touch.gas = down ? 1 : 0; break;
      case 'brake': this.touch.brake = down ? 1 : 0; break;
      case 'handbrake': this.touch.handbrake = down; break;
      case 'pitchUp': this.touch.pitch = down ? 1 : 0; break;
      case 'pitchDown': this.touch.pitch = down ? -1 : 0; break;
      case 'thrUp': this.touch.throttle = down ? 1 : 0; break;
      case 'thrDown': this.touch.throttle = down ? -1 : 0; break;
      case 'prevWeapon': if (down && !this.player.vehicle) this.cycleWeapon(-1); break;
      case 'nextWeapon': if (down && !this.player.vehicle) this.cycleWeapon(1); break;
      case 'radio':
        if (down && this.player.vehicle) {
          this.radioStation = (this.radioStation + 1) % this.audio.stations.length;
          this.audio.setStation(this.radioStation);
          this.emitHud(true);
        }
        break;
    }
  }

  togglePause() { this.setPaused(this.state === 'playing'); }
  setPaused(p: boolean) {
    if (this.state === 'dead') return;
    if (p) {
      this.state = 'paused';
      this.input.fire = false; this.input.aim = false;
      this.touch.fire = false; this.touch.aim = false;
      this.voices.stop();
      if (document.pointerLockElement) document.exitPointerLock();
      this.ev.onLock(false);
    } else {
      this.state = 'playing';
      this.audio.init();
      this.voices.unlock();
      this.requestLock();
    }
    this.audio.setEngine(false, 0, 0);
    this.audio.setSiren(0);
    this.staticDirty = true;
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
    this.voices.unlock();
    this.syncGlbAssets();
    this.requestLock();
    this.emitHud(true);
    if (!(window as any).__noAutoRun) this.raf = requestAnimationFrame(this.frame);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.glbUnsub?.();
    this.glbUnsub = null;
    this.voices.dispose();
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
    this.rayTrace?.dispose();
    this.rtxEnvs.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
  attachMinimap(c: HTMLCanvasElement | null) { this.minimap = c; }
  attachFullmap(c: HTMLCanvasElement | null) { this.fullmap = c; }
  setMapOpen(o: boolean) {
    this.mapOpen = o;
    this.staticDirty = true;
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
  groundAt(x: number, z: number, curY = 0) {
    return this.interior ? interiorFloorHeight(this.interior.room.elevation, x, z, curY) : groundHeight(x, z, curY);
  }
  panOf(x: number, z: number) {
    const dx = x - this.camX, dz = z - this.camZ;
    const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
    return clamp((dx * rx + dz * rz) / (Math.hypot(dx, dz) + 5), -0.8, 0.8);
  }
  shake(a: number) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  kick(a: number) {
    this.camPitch = clamp(this.camPitch + a, -0.5, 1.3);
    this.recoilT = Math.min(1, this.recoilT + 0.72);
  }
  addPed(p: Ped) {
    p.experimentalBodyLogic = this.experimentalBodyLogic;
    if ((p.kind === 'civ' || p.kind === 'tourist') && !p.indoor && p.tag !== 'playerbody') {
      p.lifeProfile = registerCitizen(this.npcLife, p.id);
    }
    this.peds.push(p);
    this.scene.add(p.rig.root);
  }
  removePed(p: Ped) {
    unregisterCitizen(this.npcLife, p.id);
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
    const playerArmed = !isMeleeWeapon(this.player.weapon) && (this.player.ammo[this.player.weapon] ?? 0) > 0;
    const sev = this.banking.heist.active ? 'robbery' : gunfire ? 'gunfire' : 'assault';
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > radius) continue;
      if (!p.hostile) {
        if (p.lifeProfile && !p.indoor) {
          const w = evaluateWitnessReasoning(p.lifeProfile, sev, null, playerArmed);
          p.freeCityLastHint = w.line;
          if (w.decision === 'confront' && d < 18 && !gunfire) {
            p.state = 'brawl';
            p.brawlT = 16;
            p.guardT = 4;
            continue;
          }
          if (w.decision === 'film_video' && d > 7) {
            p.state = 'photo';
            p.photoT = 5.5;
            p.yaw = Math.atan2(x - p.x, z - p.z);
            continue;
          }
          if (w.decision === 'call_911') {
            p.lifeProfile.situation = 'phone_call';
            p.lifeProfile.situationTimer = 5;
            if (this.wanted === 0 && d < 28) this.crime(1, 'witness-911');
          }
        }
        if (p.state !== 'flee' || Math.random() < 0.2) p.flee(this, x, z, 8 + Math.random() * 5);
      } else if (gunfire && p.kind !== 'cop' && d < radius * 0.6) {
        p.aggro = true;
      }
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
      if (!v.mission || v.spec.isAircraft) continue;
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
      if (!this.isSoftwareGl || this.staticDirty) {
        this.updateCamera(0, false);
        this.render();
        this.staticDirty = false;
      }
      this.emitHud(false);
      this.input.pressed.clear();
      if (this.mapOpen && this.fullmap) this.mapR.drawFull(this.fullmap, this);
      if (this.isSoftwareGl) {
        window.setTimeout(() => { if (this.running) this.raf = requestAnimationFrame(this.frame); }, 150);
      } else {
        this.afterDraw(() => this.frame(performance.now()));
      }
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
    try {
      this.update(dt);
    } catch (err) {
      console.error('[SanNova] update error recovered:', err);
    }
    try {
      this.render();
    } catch (err) {
      console.error('[SanNova] render error recovered:', err);
    }
    this.input.pressed.clear();
    this.afterDraw(() => this.frame(performance.now()));
  };

  render() {
    if (this.rtxEnabled && this.rayTrace && !this.isSoftwareGl) {
      this._sunPosTmp.copy(this.sun.position).sub(this.sun.target.position);
      const wetness = this.interior ? 0.14 : (this.night > 0.4 ? 0.34 : 0.2);
      this.rayTrace.render(
        this.renderer,
        this.scene,
        this.camera,
        this._sunPosTmp,
        this.night,
        wetness,
        1.0,
      );
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
    if (this.meleeTokenTimer > 0) {
      this.meleeTokenTimer = Math.max(0, this.meleeTokenTimer - dt);
      if (this.meleeTokenTimer <= 0) this.meleeTokenOwner = 0;
    }
    if (this.phone.activeCall) {
      this.phone.activeCall.elapsedSec += dt;
    }
    p.hurtT = Math.max(0, p.hurtT - dt * 1.4);
    // toggles (suppressed while typing in smartphone or bank modal)
    const uiBlockingKeys = this.phone.open || this.bankOpen;
    if (!uiBlockingKeys && k.pressed.has('KeyT')) { this.finderOn = !this.finderOn; this.ev.onToast(this.finderOn ? 'Package finder ON' : 'Package finder OFF', 'info'); }
    if (!uiBlockingKeys && k.pressed.has('KeyG') && !p.vehicle) {
      if (!isMeleeWeapon(p.weapon)) {
        this.scope = !this.scope;
        this.input.aim = false;
        this.audio.beep(this.scope ? 900 : 500, 0.09);
        this.ev.onToast(this.scope ? 'Scope engaged — G to release' : 'Scope released', 'info');
      } else this.ev.onToast('Melee weapons cannot be scoped', 'warn');
    }
    if (!uiBlockingKeys && k.pressed.has('KeyR') && p.vehicle) {
      this.radioStation = (this.radioStation + 1) % this.audio.stations.length;
      this.audio.setStation(this.radioStation);
    }
    if (!uiBlockingKeys && (k.pressed.has('KeyF') || k.pressed.has('KeyE'))) this.interact(k.pressed.has('KeyE'));
    if (p.vehicle && this.scope) this.scope = false;
    if (p.alive) {
      if (p.vehicle) this.updateDriving(dt);
      else this.updateOnFoot(dt);
    } else this.syncDeadPlayer();
    // simulation
    for (const v of this.vehicles) v.step(dt, this);
    this.collideVehicles();
    this.pedVehicle(dt);
    this.updateNpcLife(dt);
    for (const pd of this.peds) pd.update(dt, this);
    for (const pr of this.props) pr.update(dt, this);
    this.updatePickups(dt);
    this.updateBankHeist(dt);
    this.updateRandomEvents(dt);
    if (!this.interior) {
      const distMult = getDistrictTrafficMultiplier(districtNameAt(p.x, p.z, p.y));
      this.trafficManager.update(this, dt, distMult);
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

  private updateNpcLife(dt: number) {
    this.npcPosMap.clear();
    for (const ped of this.peds) {
      if (!ped.dead && ped.lifeProfile && !ped.indoor) {
        this.npcPosMap.set(ped.id, { x: ped.x, z: ped.z });
      }
    }
    stepNpcLifeWorld(this.npcLife, dt, this.npcPosMap);
    this.npcLifePlanT -= dt;
    if (this.npcLifePlanT <= 0) {
      this.npcLifePlanT = 3.2;
      const outdoorIds = Array.from(this.npcPosMap.keys());
      if (outdoorIds.length >= 2) {
        const idx = Math.floor(Math.random() * outdoorIds.length);
        const id = outdoorIds[idx];
        // Attempt cooperative shared plan first; otherwise trigger an unrelated everyday life situation
        const plan = tryCreateSharedPlan(this.npcLife, id, this.npcPosMap, 120);
        if (!plan && Math.random() < 0.62) {
          triggerUnrelatedLifeSituation(this.npcLife, id);
        }
      }
    }
  }

  private updateBankHeist(dt: number) {
    const h = this.banking.heist;
    const branch = BANK_BRANCHES.find((b) => b.id === h.branchId) ?? BANK_BRANCHES[0];
    const inBank = Boolean(this.interior && this.interior.room.kind === 'bank');
    let nearVault = false;
    if (inBank && this.interior?.room.vaultPos) {
      const vp = this.interior.room.vaultPos;
      nearVault = Math.hypot(this.player.x - vp.x, this.player.z - vp.z) < 5.5;
    } else if (branch) {
      nearVault = Math.hypot(this.player.x - branch.x, this.player.z - branch.z) < 9.0;
    }
    const distFromBank = inBank
      ? 0
      : Math.hypot(this.player.x - branch.x, this.player.z - branch.z);
    const res = stepBankHeist(this.banking, {
      dt,
      playerInBank: inBank,
      nearVault,
      distFromBank,
      wantedLevel: this.wanted,
      playerAlive: this.player.alive,
    });
    if (res.cashGainedNow > 0) {
      this.player.money += res.cashGainedNow;
      if (Math.random() < 0.22) this.audio.cash();
    }
    if (res.bumpWantedTo > this.wanted) {
      this.wanted = res.bumpWantedTo;
      this.lastSeen = this.time;
    }
    if (res.banner) {
      this.ev.onToast(res.banner, res.completed ? 'good' : res.failed ? 'warn' : 'info');
      if (res.completed) this.audio.missionPass();
    }
  }

  private updateRandomEvents(dt: number) {
    if (this.interior) {
      if (this.eventMarker) this.eventMarker.visible = false;
      return;
    }
    const mgr = this.randomEvents;
    if (mgr.active) {
      mgr.active.timeRemaining -= dt;
      const dist = Math.hypot(mgr.active.x - this.player.x, mgr.active.z - this.player.z);
      if (this.eventMarker) {
        this.eventMarker.visible = true;
        const gy = groundHeight(mgr.active.x, mgr.active.z);
        this.eventMarker.position.set(mgr.active.x, gy, mgr.active.z);
        const pulse = 1 + Math.sin(this.time * 4.5) * 0.14;
        this.eventMarker.children[1].scale.set(pulse, 1, pulse);
      }
      if (mgr.active.timeRemaining <= 0 || dist > 260) {
        mgr.active = null;
        mgr.cooldown = 18;
      }
    } else {
      if (this.eventMarker) this.eventMarker.visible = false;
      mgr.cooldown -= dt;
      if (mgr.cooldown <= 0 && this.player.alive && !this.banking.heist.active) {
        const ev = spawnRandomEventNear(mgr, this.player.x, this.player.z, this.hour);
        this.ev.onToast(`Random Event Nearby: ${ev.def.title} (Check gold ? on radar)`, 'info');
      }
    }
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
    this.hemi.color.set(0x2d3f68).lerp(new THREE.Color(0xc2dcff), day).lerp(new THREE.Color(0xffbfa0), dusk * 0.28);
    this.hemi.groundColor.set(0x13161e).lerp(new THREE.Color(0x6e604f), day);
    this.hemi.intensity = (this.isSoftwareGl ? 0.58 : 0.34) + day * (this.isSoftwareGl ? 0.72 : 0.6);
    const useSun = elev > 0.02;
    const dir = useSun ? sunDir : sunDir.clone().negate();
    const cx = this.camX, cz = this.camZ;
    this.sun.position.set(cx + dir.x * 220, dir.y * 220 + 20, cz + dir.z * 220);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.color.copy(useSun ? sunC : new THREE.Color(0x96b2ff));
    this.sun.intensity = useSun ? day * (this.rtxEnabled ? 3.45 : 2.85) * (0.38 + 0.62 * smooth(0, 0.35, elev)) : this.night * (this.rtxEnabled ? 0.68 : 0.45);
    // Tighten sun shadow frustum when RTX is enabled for crisper contact shadows
    if (this.rtxShadowTight !== this.rtxEnabled) {
      this.rtxShadowTight = this.rtxEnabled;
      const sc = this.sun.shadow.camera;
      const span = this.rtxEnabled ? 68 : 96;
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.updateProjectionMatrix();
      this.sun.shadow.bias = this.rtxEnabled ? -0.00025 : -0.0005;
      this.sun.shadow.normalBias = this.rtxEnabled ? 0.03 : 0.055;
      this.sun.shadow.radius = this.rtxEnabled ? 2.2 : 3.2;
    }
    // Dynamic HDR PMREM environment selection (Day / Golden-Hour Sunset / Vice Neon Night / Flat)
    const targetEnv = !this.rtxEnabled
      ? this.rtxEnvs.flat
      : dusk > 0.34 && this.night < 0.72
        ? this.rtxEnvs.sunset
        : this.night > 0.45
          ? this.rtxEnvs.night
          : this.rtxEnvs.day;
    if (this.scene.environment !== targetEnv) {
      this.scene.environment = targetEnv;
    }
    // Multi-bounce sky/golden GI fill + crisp silhouette rim sculpting
    this.bounceLight.position.set(cx - dir.x * 160, 48, cz - dir.z * 160);
    this.bounceLight.target.position.set(cx, 0, cz);
    this.bounceLight.color.set(0x45c4f8).lerp(new THREE.Color(0xff9c58), dusk * 0.72 + (1 - this.night) * 0.24);
    this.bounceLight.intensity = this.rtxEnabled ? (0.44 + day * 0.42 + dusk * 0.42) : 0.12;
    this.rimLight.position.set(cx - dir.z * 120, 92, cz + dir.x * 120);
    this.rimLight.target.position.set(cx, 0, cz);
    this.rimLight.color.set(0xffe0be).lerp(new THREE.Color(0x62b4ff), this.night * 0.8);
    this.rimLight.intensity = this.rtxEnabled ? (0.28 + dusk * 0.36 + this.night * 0.2) : 0.07;
    if (this.rtxEnabled && !this.interior) {
      const neonPhase = (Math.sin(this.time * 0.35 + this.player.x * 0.018) + 1) * 0.5;
      const sx = Math.cos(this.camYaw), sz = -Math.sin(this.camYaw);
      // Elevated soft warm coral/magenta storefront bounce (casts realistic tint without blowing out asphalt)
      this.neonLight.color.set(0xff5298).lerp(new THREE.Color(0xff8e4a), dusk * 0.65 + neonPhase * 0.25);
      this.neonLight.position.set(this.player.x + sx * 17, this.player.y + 9.5, this.player.z + sz * 17);
      this.neonLight.intensity = this.night * 3.1 + dusk * 0.65;
      // Elevated cool cyan/amber opposite storefront bounce
      this.neonLight2.color.set(0x2cd8ff).lerp(new THREE.Color(0xffb868), dusk * 0.55 + (1 - neonPhase) * 0.25);
      this.neonLight2.position.set(this.player.x - sx * 17, this.player.y + 9.5, this.player.z - sz * 17);
      this.neonLight2.intensity = this.night * 2.7 + dusk * 0.55;
    } else {
      this.neonLight.intensity = 0;
      this.neonLight2.intensity = 0;
    }
    if (!this.interior) {
      this.renderer.toneMappingExposure = lerp(this.rtxEnabled ? 1.16 : 1.05, this.rtxEnabled ? 1.08 : 1.0, day);
    }
    (this.scene as any).environmentIntensity = this.rtxEnabled
      ? (0.34 + day * 0.72 + dusk * 0.16 + this.night * 0.34)
      : (0.14 + day * 0.42);
    this.city.setNight(this.night);
    headMat.emissiveIntensity = 0.2 + this.night * 2.2;
    tailDim.emissiveIntensity = 0.18 + this.night * 0.95;
    beamMaterial.opacity = this.night * 0.28;
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
    const aiming = (k.aim || this.touch.aim || this.playerFiring || this.scope) && !meleeW;

    // camera look
    this.lookInput(dt);
    const ix = clamp(((k.keys.has('KeyD') ? 1 : 0) - (k.keys.has('KeyA') ? 1 : 0)) + this.touch.moveX, -1, 1);
    const iz = clamp(((k.keys.has('KeyW') ? 1 : 0) - (k.keys.has('KeyS') ? 1 : 0)) + this.touch.moveY, -1, 1);
    const sY = Math.sin(this.camYaw), cY = Math.cos(this.camYaw);
    let mx = sY * iz - cY * ix, mz = cY * iz + sY * ix;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }

    const sprint = k.keys.has('ShiftLeft') || k.keys.has('ShiftRight') || this.touch.sprint;
    const crouch = k.keys.has('ControlLeft') || k.keys.has('KeyC') || this.touch.crouch;
    const crouchPressed = k.pressed.has('ControlLeft') || k.pressed.has('KeyC');
    const gh = this.groundAt(p.x, p.z, p.y);
    const sandF = this.interior ? 0 : sandFactorAt(p.x, p.z, p.y);
    const wasSliding = p.move.slideT > 0;

    p.move.vx = p.vx; p.move.vy = p.vy; p.move.vz = p.vz; p.move.y = p.y; p.move.onGround = p.onGround;
    const mRes = stepMovementState(p.move, {
      wishX: ml > 0.05 ? mx : 0,
      wishZ: ml > 0.05 ? mz : 0,
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

    const stepSurface: 'wood' | 'sand' | 'pavement' = this.interior ? 'wood' : sandF > 0.1 ? 'sand' : 'pavement';
    if (!wasSliding && mRes.sliding) this.audio.slide();
    if (mRes.landed) this.audio.footstep(stepSurface);

    const horizSp = Math.hypot(p.vx, p.vz);
    if (p.onGround && horizSp > 0.9 && !mRes.sliding) {
      p.stepT -= dt * (horizSp / 4.2);
      if (p.stepT <= 0) {
        p.stepT = 0.42;
        this.audio.footstep(stepSurface);
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
      const maxR = v.spec.isAircraft ? 64 : 20;
      if (dx * dx + dz * dz > maxR) continue;
      if (v.spec.isAircraft && Math.abs(p.y - v.y) > 4) continue;
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
    const prevYaw = this.prevPlayerYaw;
    const moving = horizSp > 0.4;
    if (aiming) p.yaw = dampAngle(p.yaw, this.camYaw, 16, dt);
    else if (moving) p.yaw = dampAngle(p.yaw, Math.atan2(p.vx, p.vz), 12, dt);
    let dyaw = p.yaw - prevYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const turnRate = clamp(dyaw / Math.max(dt, 0.008), -5, 5);
    this.prevPlayerYaw = p.yaw;

    // fire (supports mouse and mobile fire button)
    p.fireT -= dt;
    this.recoilT = Math.max(0, this.recoilT - dt * 5.2);
    if (p.comboResetT > 0) {
      p.comboResetT = Math.max(0, p.comboResetT - dt);
      if (p.comboResetT === 0) p.comboIdx = 0;
    }
    if (p.guardT > 0) p.guardT = Math.max(0, p.guardT - dt);
    if (p.punchT > 0) {
      p.punchT += dt / Math.max(0.18, p.punchDur);
      if (p.punchT >= 1) p.punchT = 0;
    }
    const firingNow = k.fire || this.touch.fire;
    if (firingNow && p.fireT <= 0 && this.input.locked !== undefined) {
      const w = WEAPONS[p.weapon];
      if (meleeW) playerMelee(this);
      else if (w.auto || !this.fireHeld) playerFire(this);
    }
    this.fireHeld = firingNow;
    // animate
    p.rig.root.position.set(p.x, p.y - sandFoot.sinkY, p.z);
    p.rig.root.rotation.set(0, p.yaw, 0);
    p.rig.root.visible = !this.scope;
    const fistGuard = p.weapon === 'fists' ? clamp(Math.max(aiming ? 1 : 0, p.guardT * 0.55), 0, 1) : 0;
    animateHuman(p.rig, dt, {
      mode: 'stand',
      speed: horizSp,
      aim: aiming ? 1 : 0,
      aimPitch: clamp(-this.camPitch * 0.9 + 0.2, -0.5, 0.7),
      punch: p.punchT,
      punchMove: p.punchMove,
      boxingGuard: fistGuard,
      crouch: p.move.crouching,
      slide: mRes.sliding,
      airborne: !p.onGround,
      recoil: this.recoilT,
      turnRate,
      flinch: p.hurtT > 0.25 ? Math.min(1, p.hurtT) : 0,
      isPlayer: true,
    });
  }
  fireHeld = false;
  lastVehHit = -10;
  lockFailed = false;

  lookInput(dt: number) {
    const k = this.input;
    const sens = 0.0024 * (this.scope ? 0.32 : 1);
    if (this.touch.lookDx || this.touch.lookDy) {
      this.camYaw -= this.touch.lookDx * sens * 1.45;
      this.camPitch = clamp(this.camPitch + this.touch.lookDy * sens * 1.25, -0.55, 1.3);
      this.touch.lookDx = 0;
      this.touch.lookDy = 0;
    }
    if (k.locked && !this.mobileMode) {
      this.camYaw -= k.dx * sens;
      this.camPitch = clamp(this.camPitch + k.dy * sens, -0.55, 1.3);
      if (k.dx || k.dy) this.lastMouse = this.time;
    } else if (this.state === 'playing' && this.lockFailed && !this.mobileMode) {
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
    if (!this.player.vehicle?.spec.isAircraft) {
      if (k.keys.has('ArrowUp')) this.camPitch = clamp(this.camPitch - ar * 0.6, -0.55, 1.3);
      if (k.keys.has('ArrowDown')) this.camPitch = clamp(this.camPitch + ar * 0.6, -0.55, 1.3);
    }
  }

  syncDeadPlayer() { /* body handled as a ragdoll ped */ }

  // =============================================================== player: vehicles & world interactions
  interact(preferBankOrEvent = false) {
    const p = this.player;
    if (!p.alive) return;
    if (p.vehicle) {
      // Allow resolving nearby random world event with E even while cruising slowly
      if (preferBankOrEvent && this.randomEvents.active) {
        const dEv = Math.hypot(this.randomEvents.active.x - p.x, this.randomEvents.active.z - p.z);
        if (dEv < 12) {
          const res = resolveActiveRandomEvent(this.randomEvents);
          if (res) {
            p.money += res.rewardCash;
            this.audio.cash();
            this.ev.onToast(`${res.title}: ${res.resolutionText} (+$${res.rewardCash})`, 'good');
            this.emitHud(true);
            return;
          }
        }
      }
      this.exitVehicle();
      return;
    }
    if (this.interior) {
      const room = this.interior.room;
      if (room.kind === 'bank') {
        const nearTeller = room.tellerPos ? Math.hypot(p.x - room.tellerPos.x, p.z - room.tellerPos.z) < 5.5 : false;
        const nearAtm = Math.hypot(p.x - (room.cx - 8.2), p.z - (room.cz + 4.4)) < 3.6;
        if (nearTeller || nearAtm || preferBankOrEvent) {
          const nearBranch = findNearestBankOrAtm(this.interior.back.x, this.interior.back.z, 26);
          const bId = nearBranch?.branch?.id ?? BANK_BRANCHES[0].id;
          const bName = nearBranch?.branch?.name ?? this.interior.name;
          this.openBankModal('bank', bId, bName);
          return;
        }
      }
      if (room.kind === 'gun' && Math.hypot(p.x - (room.cx - 4.8), p.z - (room.cz + 1.0)) < 5.5 && p.y < 1.6) { this.shop(); return; }
      if (this.insideT > 0.8) {
        for (const ex of room.exits) {
          if (Math.hypot(p.x - ex.x, p.z - ex.z) < 2.4 && Math.abs(p.y - ex.y) < 1.6) {
            this.exitInterior();
            return;
          }
        }
      }
      for (const pp of this.peds) {
        if (pp.indoor && pp.kind === 'civ' && Math.hypot(pp.x - p.x, pp.z - p.z) < 2.2 && Math.abs(pp.y - p.y) < 1.2) {
          if (pp.indoorRole === 'clerk' || pp.indoorRole === 'server') {
            this.ev.onToast('Welcome in! Walk to any EXIT sign and press F to leave', 'info');
          } else {
            this.ev.onToast('Excusing yourself past a customer — press F at any EXIT sign to leave', 'info');
          }
          return;
        }
      }
      return;
    }
    // 1. Active Random World Event interaction
    if (this.randomEvents.active) {
      const dEv = Math.hypot(this.randomEvents.active.x - p.x, this.randomEvents.active.z - p.z);
      if (dEv < 10.5) {
        const res = resolveActiveRandomEvent(this.randomEvents);
        if (res) {
          p.money += res.rewardCash;
          this.audio.cash();
          this.ev.onToast(`${res.title}: ${res.resolutionText} (+$${res.rewardCash})`, 'good');
          this.emitHud(true);
          return;
        }
      }
    }
    // 2. Sidewalk NovaBank ATM or quick bank access via E
    const nearBankAtm = findNearestBankOrAtm(p.x, p.z, preferBankOrEvent ? 10 : 4.5);
    if (nearBankAtm && (nearBankAtm.kind === 'atm' || preferBankOrEvent)) {
      this.openBankModal(nearBankAtm.kind, nearBankAtm.id, nearBankAtm.name);
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
      if (v.spec.isAircraft) {
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        if (d < 7.2 && d < bd + 4.5) { bd = d; best = v; }
        continue;
      }
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
    if (v.type === 'sports') upgradeVehicleToGlb(v.model, v.type, this.hdGlbMode, true);
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
    this.camDist = v.spec.isAircraft ? 15 + v.spec.L * 0.45 : 6 + v.spec.L * 0.35;
    if (v.spec.isAircraft) {
      this.ev.onToast(`${v.spec.name}: W/S Throttle · A/D Roll · Space/↓ Climb · ↑ Dive · Q/E Rudder`, 'info');
    }
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
    if (v.type === 'sports' && v.tag !== 'spawn-ferrari') upgradeVehicleToGlb(v.model, v.type, this.hdGlbMode, false);
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

    if (v.spec.isAircraft) {
      // 6-DOF Aircraft Flight Controls (keyboard + mobile touch)
      const thrUp = k.keys.has('KeyW') || this.touch.throttle > 0;
      const thrDn = k.keys.has('KeyS') || this.touch.throttle < 0;
      v.throttleDelta = (thrUp ? 1 : 0) - (thrDn ? 1 : 0);
      const pitchUp = k.keys.has('ArrowDown') || k.keys.has('KeyK') || k.keys.has('Space') || this.touch.pitch > 0 || this.touch.moveY < -0.35;
      const pitchDn = k.keys.has('ArrowUp') || k.keys.has('KeyI') || this.touch.pitch < 0 || this.touch.moveY > 0.35;
      v.pitchIn = (pitchUp ? 1 : 0) - (pitchDn ? 1 : 0);
      const rollTarget = clamp(((k.keys.has('KeyA') ? 1 : 0) - (k.keys.has('KeyD') ? 1 : 0)) - this.touch.moveX, -1, 1);
      v.rollIn += (rollTarget - v.rollIn) * (1 - Math.exp(-8 * dt));
      v.yawIn = (k.keys.has('KeyQ') ? 1 : 0) - (k.keys.has('KeyE') ? 1 : 0);
      v.hand = k.keys.has('ShiftLeft') || k.keys.has('ShiftRight') || this.touch.handbrake;
      v.brake = v.hand ? 1 : 0;
      v.lightsOn = this.night > 0.35;
      p.x = v.x; p.z = v.z; p.y = v.y;
      p.yaw = v.yaw;
      p.vx = v.vx; p.vz = v.vz;
      animateHuman(p.rig, dt, { mode: 'drive', speed: 0, aim: 0, aimPitch: 0, punch: 0, steer: v.rollIn });
      if (this.time - this.lastMouse > 1.2) {
        this.camYaw = dampAngle(this.camYaw, v.yaw, 3.2, dt);
        this.camPitch += (clamp(0.18 - v.pitch * 0.45, -0.35, 0.55) - this.camPitch) * (1 - Math.exp(-2.8 * dt));
      }
      return;
    }

    const up = k.keys.has('KeyW') || this.touch.gas > 0;
    const dn = k.keys.has('KeyS') || this.touch.brake > 0;
    v.throttle = (up ? 1 : 0) - (dn ? 1 : 0);
    v.brake = 0;
    if (dn && v.fwd > 1) v.brake = 0.85;
    if (k.keys.has('Space') || this.touch.handbrake) { v.hand = true; v.brake = Math.max(v.brake, 0.2); } else v.hand = false;
    const target = clamp(((k.keys.has('KeyA') ? 1 : 0) - (k.keys.has('KeyD') ? 1 : 0)) - this.touch.moveX, -1, 1);
    v.steerIn += (target - v.steerIn) * (1 - Math.exp(-(target === 0 ? 10 : 6) * dt));
    if (k.keys.has('KeyH') || this.touch.horn) { this.hornT -= dt; if (this.hornT <= 0) { this.audio.horn(true); this.hornT = 0.3; } }
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
      if (sp < 1.8 || v.mode === 'wreck') continue;
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
            // Pass genuine vehicle speed & mass so light taps cause stumbles with ZERO blood explosion
            const pushX = v.vx + (ox / d) * Math.min(2.2, sp * 0.35);
            const pushZ = v.vz + (oz / d) * Math.min(2.2, sp * 0.35);
            p.knock(this, pushX, pushZ, sp * 3.0, v.mode === 'player', v.spec.mass);
            v.vx *= sp < 5.5 ? 0.94 : 0.97;
            v.vz *= sp < 5.5 ? 0.94 : 0.97;
            this.audio.hit(sp < 5.5 ? 0.38 : 1.0);
            if (v.mode === 'player') this.shake(sp < 5.5 ? 0.04 : 0.16);
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
      const newPaint = [0xc0392b, 0x2c3e8f, 0xe8e8e8, 0x15171a, 0x0e6e8c][Math.floor(Math.random() * 5)];
      pv.model.body.material = paintMat(newPaint);
      repaintVehicleGlb(pv.model, newPaint);
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
      if (this.voicesEnabled) {
        try {
          this.voices.speak(99000 + (this.storyVoiceSeq++), 'story', q.text, 2.0, true);
        } catch {
          // Never allow voice playback issues to interrupt subtitle or game loop
        }
      }
      q.after?.();
    }
    // Proximity-based ambient NPC dialogue when walking on foot (yields to mission subtitles)
    const p = this.player;
    this.ambientCandidates.length = 0;
    if (p.alive && !p.vehicle && !this.sub && !this.subQ.length) {
      for (const ped of this.peds) {
        if (ped.dead) continue;
        if (Math.abs(ped.x - p.x) > 25 || Math.abs(ped.z - p.z) > 25) continue;
        this.ambientCandidates.push({
          id: ped.id,
          kind: ped.kind,
          x: ped.x,
          y: ped.y,
          z: ped.z,
          dead: ped.dead,
          panicking: ped.state === 'flee' || ped.state === 'cower' || ped.panicT > 0.2,
          speakerName: ped.freeCity ? FREE_CITY_LABELS[ped.freeCity.archetype] : undefined,
          freeCityLine: ped.freeCityLastHint,
        });
      }
    }
    const moving = Math.hypot(p.move.vx, p.move.vz) > 0.6;
    const armed = !isMeleeWeapon(p.weapon) && (p.ammo[p.weapon] ?? 0) > 0;
    const district = this.interior ? this.interior.name.toUpperCase() : districtNameAt(p.x, p.z, p.y);
    const nextAmbient = this.ambientDialogue.step(
      {
        playerX: p.x,
        playerY: p.y,
        playerZ: p.z,
        playerMoving: moving,
        inVehicle: Boolean(p.vehicle),
        playerAlive: p.alive,
        playerArmed: armed,
        missionSubActive: Boolean(this.sub || this.subQ.length),
        district,
        isNight: this.night > 0.45,
        candidates: this.ambientCandidates,
      },
      dt,
    );
    this.ambientSub = nextAmbient;
    if (nextAmbient) {
      const key = `${nextAmbient.pedId}|${nextAmbient.text}`;
      if (key !== this.lastSpokenAmbientKey) {
        this.lastSpokenAmbientKey = key;
        const speaker = this.peds.find((q) => q.id === nextAmbient.pedId);
        let dist = 5;
        if (speaker) {
          dist = Math.hypot(speaker.x - p.x, speaker.z - p.z);
          speaker.speakingT = Math.max(2.6, nextAmbient.text.length * 0.055);
        }
        if (this.voicesEnabled) {
          try {
            this.voices.speak(nextAmbient.pedId, nextAmbient.kind as VoiceKind, nextAmbient.text, dist, false, Boolean(this.interior));
          } catch {
            // Fault-isolated: never disrupt gameplay if voice engine errors
          }
        }
      }
    } else {
      this.lastSpokenAmbientKey = '';
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

    // Smooth environmental background noise crossfading (ocean surf, wind, urban hum, night, indoor room tone & crowd murmur)
    const distToOcean = this.interior ? 9999 : Math.max(0, 610 - this.player.z);
    const inDunes = !this.interior && this.player.x < -900 && this.player.z > -400;
    this.audio.updateAmbience({
      indoor: Boolean(this.interior),
      indoorKind: this.interior ? this.interior.room.kind : null,
      distToOcean,
      inDunes,
      speedMps: this.playerSpeed,
      altitudeM: pv?.spec.isAircraft ? pv.y : 0,
      night01: this.night,
      voiceActive: this.voices.isSpeaking,
      inVehicle: Boolean(pv),
    });
  }

  // =============================================================== camera
  updateCamera(dt: number, snap: boolean) {
    const p = this.player;
    const pv = p.vehicle;
    const aiming = !pv && (this.input.aim || this.playerFiring || this.scope) && !isMeleeWeapon(p.weapon) && p.alive;
    const tgtEye = p.move.slideT > 0 ? 0.9 : p.move.crouching ? 1.15 : 1.55;
    p.eyeH += (tgtEye - p.eyeH) * (snap ? 1 : 1 - Math.exp(-10 * dt));
    const tgtDist = this.scope
      ? 0.55
      : pv
        ? pv.spec.isAircraft
          ? 14.5 + pv.spec.L * 0.45 + Math.min(8, pv.speed * 0.08)
          : 6.2 + pv.spec.L * 0.4 + Math.min(4, pv.speed * 0.07)
        : aiming
          ? 2.7
          : 4.7;
    this.camDist += (tgtDist - this.camDist) * (snap ? 1 : 1 - Math.exp(-6 * dt));
    const cosP = Math.cos(this.camPitch), sinP = Math.sin(this.camPitch);
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    let tx: number, ty: number, tz: number;
    if (pv) { tx = pv.x; ty = (pv.spec.isAircraft ? 2.8 : 1.5) + pv.y; tz = pv.z; }
    else { tx = p.x; ty = p.y + p.eyeH; tz = p.z; }
    const shoulder = this.scope ? 0.42 : aiming ? 0.75 : 0;
    const rx = -fz, rz = fx;
    tx += rx * shoulder; tz += rz * shoulder;
    let d = this.camDist;
    if (!pv?.spec.isAircraft) {
      for (let t = 0.6; t <= d; t += 0.35) {
        const x = tx - fx * cosP * t, y = ty + sinP * t, z = tz - fz * cosP * t;
        if (y < 0.35 || this.world.solidAt(x, y, z)) { d = Math.max(0.8, t - 0.45); break; }
      }
    }
    let cx = tx - fx * cosP * d, cy = ty + sinP * d, cz = tz - fz * cosP * d;
    cy = Math.max(cy, 0.4 + this.groundAt(cx, cz, p.y));
    if (this.interior) cy = Math.min(cy, this.interior.room.h - 0.35);
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
    const targetFov = this.scope
      ? 21
      : aiming
        ? 48
        : pv
          ? pv.spec.isAircraft
            ? 66 + Math.min(24, pv.speed * 0.22)
            : 62 + Math.min(20, pv.speed * 0.45)
          : onFootSprint
            ? 68
            : 62;
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
    const baseY = room.elevation.baseY;
    this.player.x = room.spawn.x;
    this.player.z = room.spawn.z;
    this.player.y = baseY; this.player.vx = 0; this.player.vz = 0; this.player.vy = 0;
    this.player.move.y = baseY; this.player.move.vx = 0; this.player.move.vy = 0; this.player.move.vz = 0;
    this.player.yaw = room.spawn.yaw;
    this.camYaw = room.spawn.yaw; this.camPitch = 0.14;
    this.world.boundsOff = true;
    this.scope = false;
    this.player.rig.root.visible = true;
    const tint = room.warmTint ?? 0xffe4bc;
    this.intLights.forEach((l, i) => {
      const pos = room.pendantLights[i];
      if (pos) {
        l.position.set(pos[0], pos[1], pos[2]);
        l.color.setHex(tint);
        l.intensity = i < 4 ? 12.5 : 10.0;
      } else {
        l.intensity = 0;
      }
    });
    this.renderer.toneMappingExposure = 1.02;
    this.spawnRoomNpcs(room);
    this.audio.door();
    this.ev.onToast(`Entering ${door.name}`, 'info');
  }
  spawnRoomNpcs(room: Room) {
    const rng = new Rng(room.id * 97 + 13);
    for (let i = 0; i < room.npcSpots.length; i++) {
      const spot = room.npcSpots[i];
      const useTourist = (spot.role === 'customer' || spot.role === 'queue' || spot.role === 'seated') && rng.chance(0.35);
      const look = spot.role === 'guard' ? guardLook(rng) : useTourist ? touristLook(rng) : civilianLook(rng);
      const p = new Ped(useTourist ? 'tourist' : 'civ', look);
      p.indoor = true;
      p.indoorRole = spot.role;
      p.indoorHomeX = spot.x;
      p.indoorHomeZ = spot.z;
      p.indoorBaseYaw = spot.yaw;
      p.mission = true;
      p.state = 'idle';
      p.idleT = 9999;
      p.x = spot.x;
      p.z = spot.z;
      p.y = spot.y ?? 0.26;
      p.yaw = spot.yaw;
      p.place(spot.x, spot.z);
      p.rig.root.position.set(p.x, p.y, p.z);
      p.rig.root.rotation.set(0, p.yaw, 0);
      if (spot.role === 'guard') p.arm('pistol');
      else p.arm(null);
      upgradeHumanToGlb(p.rig);
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
    for (let i = this.peds.length - 1; i >= 0; i--) if (this.peds[i].indoor) this.removePed(this.peds[i]);
    this.audio.door();
    this.ev.onToast('Back outside', 'info');
  }

  // =============================================================== allies & weapons
  spawnAllies() {
    const spots: [number, number][] = [[-295.6, 35.5], [blockCenter(2) + 34, blockCenter(1) + 34], [this.city.places.gunshop ? this.city.places.gunshop.x + 5 : 4, this.city.places.gunshop ? this.city.places.gunshop.z + 2 : -160]];
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
  spawnAircraft() {
    // Flyable aircraft parked at San Nova International Airport, Ocean Beach Marina & Nova Keys
    const jet = this.spawnVehicle('jet', 1335, -260, Math.PI / 2, { mode: 'idle', paint: 0x3b4450, tag: 'airport-jet' });
    jet.place(1335, -260, Math.PI / 2, 0);
    const prop = this.spawnVehicle('prop_plane', 1515, -312, Math.PI / 2, { mode: 'idle', paint: 0xf4f6f8, tag: 'airport-prop' });
    prop.place(1515, -312, Math.PI / 2, 0);
    const sea1 = this.spawnVehicle('seaplane', 1650, -312, Math.PI / 2, { mode: 'idle', paint: 0xf5f2e8, tag: 'airport-seaplane' });
    sea1.place(1650, -312, Math.PI / 2, 0);
    const seaBeach = this.spawnVehicle('seaplane', 220, 650, Math.PI * 0.15, { mode: 'idle', paint: 0xf5f2e8, tag: 'marina-seaplane' });
    seaBeach.place(220, 650, Math.PI * 0.15, -0.35);
    const seaKeys = this.spawnVehicle('seaplane', 240, 2340, 0, { mode: 'idle', paint: 0xf5f2e8, tag: 'keys-seaplane' });
    seaKeys.place(240, 2340, 0, groundHeight(240, 2340));
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
      if (room.kind === 'bank') {
        const nearTeller = room.tellerPos ? Math.hypot(p.x - room.tellerPos.x, p.z - room.tellerPos.z) < 5.5 : false;
        const nearAtm = Math.hypot(p.x - (room.cx - 8.2), p.z - (room.cz + 4.4)) < 3.6;
        if (nearTeller) return 'Press E — NovaBank Teller (Deposit / Withdraw / Rob Bank)';
        if (nearAtm) return 'Press E — NovaBank Lobby ATM';
      }
      if (room.kind === 'gun' && Math.hypot(p.x - (room.cx - 4.8), p.z - (room.cz + 1.0)) < 5.5 && p.y < 1.6) return 'Press F — Buy weapons / ammo';
      if (this.insideT > 0.8) {
        for (const ex of room.exits) {
          if (Math.hypot(p.x - ex.x, p.z - ex.z) < 2.5 && Math.abs(p.y - ex.y) < 1.6) {
            return `Press F — ${ex.label} to the street`;
          }
        }
      }
      return null;
    }
    if (this.randomEvents.active) {
      const dEv = Math.hypot(this.randomEvents.active.x - p.x, this.randomEvents.active.z - p.z);
      if (dEv < 10.5) return `Press E — ${this.randomEvents.active.def.title} (+$${this.randomEvents.active.def.rewardCash})`;
    }
    if (p.vehicle) return null;
    const nearAtm = findNearestBankOrAtm(p.x, p.z, 4.5);
    if (nearAtm?.kind === 'atm') return `Press E — ${nearAtm.name} (Deposit / Withdraw Cash)`;
    for (const a of this.allies) if (!a.recruited && !a.dead && Math.hypot(a.x - p.x, a.z - p.z) < 2.8) return 'Press F — Recruit ally to your crew';
    const dn = this.doorNear();
    if (dn) {
      if (dn.door.kind === 'bank') return `Press F — Enter ${dn.door.name}  |  Press E — Quick Bank / Rob`;
      return `Press F — Enter ${dn.door.name}`;
    }
    const gs = this.city.places.gunshop;
    if (gs && Math.hypot(p.x - gs.x, p.z - gs.z) < 3.5) return 'Press F — Ammu-Nation (buy weapons / refill ammo)';
    let bd = 3.2;
    let foundVeh: Vehicle | null = null;
    for (const v of this.vehicles) {
      if (v.mode === 'wreck') continue;
      if (v.spec.isAircraft) {
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        if (d < 7.2) { foundVeh = v; break; }
        continue;
      }
      const c = v.circles();
      for (let i = 0; i < c.length; i += 3) if (Math.hypot(p.x - c[i], p.z - c[i + 1]) - c[i + 2] < bd) foundVeh = v;
    }
    if (foundVeh) {
      const key = this.mobileMode ? 'Tap USE' : 'Press F';
      return foundVeh.spec.isAircraft ? `${key} — Fly ${foundVeh.spec.name}` : `${key} — Enter ${foundVeh.spec.name}`;
    }
    return null;
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
    const aircraft = pv && pv.spec.isAircraft && pv.flight
      ? {
          altitude: Math.max(0, Math.round(pv.y)),
          airspeed: Math.round(pv.flight.airspeed * 3.6),
          throttle: Math.round(pv.flight.throttle * 100),
          stalling: pv.flight.stalling,
          onGround: pv.flight.onGround,
        }
      : null;
    const glbStat = getGlbStatus();
    const phoneUnread = Object.values(this.phone.unreadByContact).reduce((s, n) => s + n, 0);
    const activeEv = this.randomEvents.active
      ? {
          title: this.randomEvents.active.def.title,
          headline: this.randomEvents.active.def.headline,
          dialogue: this.randomEvents.active.def.dialogue,
          dist: Math.round(Math.hypot(this.randomEvents.active.x - p.x, this.randomEvents.active.z - p.z)),
          rewardCash: this.randomEvents.active.def.rewardCash,
          category: this.randomEvents.active.def.category,
        }
      : null;
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
      ambientSubtitle: this.ambientSub ? { who: this.ambientSub.who, text: this.ambientSub.text, kind: this.ambientSub.kind } : null,
      prompt: this.prompts(),
      speed: pv ? Math.round(Math.abs(pv.fwd) * 3.6) : null,
      vehicleName: pv ? pv.spec.name : null,
      vehicleHp: pv ? Math.round((pv.hp / pv.maxHp) * 100) : null,
      radio: pv ? this.audio.stations[this.radioStation] : null,
      packages: [this.packagesFound, this.packagesTotal],
      finder,
      aiming: !pv && (this.input.aim || this.touch.aim || this.scope),
      crosshair: !pv && !isMeleeWeapon(p.weapon) && p.alive && !this.scope && !this.phone.open && !this.bankOpen,
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
      aircraft,
      mobileMode: this.mobileMode,
      rtxEnabled: this.rtxEnabled,
      goreEnabled: this.goreEnabled,
      voicesEnabled: this.voicesEnabled,
      hdGlbMode: this.hdGlbMode,
      microtexturesEnabled: this.microtexturesEnabled,
      experimentalBodyLogic: this.experimentalBodyLogic,
      trafficSummary: this.trafficManager.getSummary(),
      freeCityCount: this.peds.filter((q) => !q.dead && Boolean(q.freeCity)).length,
      speakingVoice: this.voices.speakingVoiceName,
      animCount: ANIMATION_COUNT,
      playerAnim: p.rig.animClipName,
      glbLoaded: glbStat.loaded,
      glbTotal: glbStat.total,
      glbFailed: glbStat.failed,
      storeCount: this.city.doors.length,
      bankBalance: this.banking.bankBalance,
      bankOpen: this.bankOpen,
      bankModalInfo: this.bankModalInfo,
      heist: { ...this.banking.heist },
      phoneOpen: this.phone.open,
      phoneUnread,
      activeEvent: activeEv,
      randomEventsTotal: RANDOM_EVENTS.length,
      randomEventsDone: this.randomEvents.completedCount,
      activePlansCount: this.npcLife.plans.size,
    });
  }
}
void HALF; void BOUNDS; void doNpcShoot; void castRay; void doDeploy; void TARGET_LOOK;
export type { Collider };
