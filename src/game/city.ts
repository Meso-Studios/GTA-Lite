// City & 10km x 10km Open World assembly: terrain/dunes, beach resort, roads, blocks, landmarks, lighting and signals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BLOCK_HALF, DECK, DISTRICTS, HALF, INNER_HALF, NB, P, PARK_OFF, PIER_X, ROAD_W, RURAL_GAS_STATIONS, Rng,
  SIDEWALK_Y, SUBURBAN_ZONES, WORLD_HALF, blockCenter, groundHeight, isInSuburbanZone, isOceanAt,
  nearestRuralGasStation, roadLine, signalState, terrainHeightAt,
} from './config';
import { Batcher, box, cyl, finish, flat, sph } from './geo';
import * as T from './textures';
import { World } from './world';
import {
  BCtx, Door, Lot, MapRect, Place, PropSpawn, addAirport, addBank, addBeachfront, addBoardwalkWheel, addBuilding,
  addCarDealership, addCasino, addContainers, addCrane, addGas, addGunShop, addHospital, addHouse, addLamp, addLittleHavanaBlock, addPark,
  addParkingGarage, addPaySpray, addPolice, addRuralGasStation, addSilos, addStripMallBlock, addSuburbanDistrict, addSurfaceParkingLot, addTower, addTree,
  addWarehouse, addWynwoodArtsBlock, beachProps, buildingInLot, splitLots,
} from './buildings';
import type { FacadeStyle } from './textures';
import { buildInfrastructure } from './infra';
import { buildInteriors, Room } from './interiors';
import { microtextures } from './microtextures';
import { ATM_LOCATIONS, BANK_BRANCHES } from './bankingSystem';
import { buildRealisticGrassField } from './grassField';

export interface ParkingSpot { x: number; z: number; yaw: number; used: boolean; id: number; police?: boolean }
export interface CityData {
  group: THREE.Group;
  world: World;
  mapRects: MapRect[];
  places: Record<string, Place>;
  props: PropSpawn[];
  parking: ParkingSpot[];
  collect: Place[];
  doors: Door[];
  rooms: Room[];
  update(dt: number, time: number): void;
  setNight(n: number): void;
  setRtx(enabled: boolean): void;
  setMicrotextures(enabled: boolean): void;
  ocean: THREE.Mesh;
}

export function buildCity(): CityData {
  const group = new THREE.Group();
  const world = new World();
  const rng = new Rng(20240611);
  const batch = new Batcher();
  const chunk = (x: number, z: number) => `${Math.floor((x + WORLD_HALF + 200) / 420)}_${Math.floor((z + WORLD_HALF + 200) / 420)}`;
  const ctx: BCtx = {
    b: batch, world, rng, mapRects: [], places: {}, props: [], chunk, collect: [], lampBulbs: [], doors: [],
    storeUsed: new Set<number>(), storeCursor: 0,
  };
  const mapRects = ctx.mapRects;

  // ---------------------------------------------------------------- PBR & Simulated RTX materials
  const mats: Record<string, THREE.Material> = {};
  const facadeMats: THREE.MeshStandardMaterial[] = [];
  (['brick', 'office', 'glass', 'stone', 'apartment', 'industrial'] as FacadeStyle[]).forEach((s, i) => {
    const t = T.makeFacade(s, 100 + i * 17);
    const m = s === 'glass'
      ? new THREE.MeshPhysicalMaterial({
        map: t.map, bumpMap: t.bump, bumpScale: 0.08,
        emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true,
        roughness: 0.24, metalness: 0.36, clearcoat: 0.16, clearcoatRoughness: 0.24, envMapIntensity: 0.52,
      })
      : new THREE.MeshStandardMaterial({
        map: t.map, bumpMap: t.bump, bumpScale: 0.28,
        emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true,
        roughness: 0.90, metalness: 0.02, envMapIntensity: 0.22,
      });
    mats['f_' + s] = m;
    facadeMats.push(m);
  });
  const st = T.makeStorefront(55);
  mats.store = new THREE.MeshPhysicalMaterial({
    map: st.map, bumpMap: st.bump, bumpScale: 0.14,
    emissiveMap: st.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true,
    roughness: 0.76, metalness: 0.06, clearcoat: 0.0, clearcoatRoughness: 0.52, envMapIntensity: 0.24,
  });
  facadeMats.push(mats.store as THREE.MeshStandardMaterial);
  const atlas = T.makeSignAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.56, vertexColors: true, roughness: 0.42 });
  mats.sign = signMat;
  signMat.userData.cast = false;
  const hwAtlas = T.makeHighwaySignAtlas();
  const hwSignMat = new THREE.MeshStandardMaterial({ map: hwAtlas, emissiveMap: hwAtlas, emissive: 0xffffff, emissiveIntensity: 0.35, vertexColors: true, roughness: 0.45 });
  mats.hwSign = hwSignMat;
  hwSignMat.userData.cast = false;
  const ads = T.makeAdAtlas();
  const adMat = new THREE.MeshStandardMaterial({ map: ads, emissiveMap: ads, emissive: 0xffffff, emissiveIntensity: 0.25, vertexColors: true, roughness: 0.68 });
  mats.ad = adMat;
  const leafAtlas = T.makeLeafAtlas();
  mats.leaf = new THREE.MeshStandardMaterial({ map: leafAtlas, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.88, metalness: 0 });
  mats.leaf.userData.cast = false;
  mats.emit = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  mats.glass = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xbcd4e2, roughness: 0.16, metalness: 0.12, clearcoat: 0.22, clearcoatRoughness: 0.14, transparent: true, opacity: 0.34, envMapIntensity: 0.48 });
  const floorWoodBump = T.makeFloorboardsBump();
  const upholsteryTex = T.makeUpholstery();
  const upholsteryBump = T.makeUpholsteryBump();
  const exitSignTex = T.makeExitSign();
  mats.intWall = new THREE.MeshStandardMaterial({ map: T.makeWallPlaster(), vertexColors: true, roughness: 0.94, metalness: 0.0, envMapIntensity: 0.14 });
  mats.intCeil = new THREE.MeshStandardMaterial({ map: T.makeCeilingTile(), vertexColors: true, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.14 });
  mats.intTrim = new THREE.MeshStandardMaterial({ map: T.makeWood(), vertexColors: true, roughness: 0.72, metalness: 0.0, envMapIntensity: 0.16 });
  mats.intFloorWood = new THREE.MeshStandardMaterial({
    map: T.makeFloorboards(),
    bumpMap: floorWoodBump,
    bumpScale: 0.05,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.0,
    envMapIntensity: 0.18,
  });
  mats.intFloorWood.userData.cast = false;
  mats.intWood = new THREE.MeshStandardMaterial({
    map: T.makeWood(),
    bumpMap: floorWoodBump,
    bumpScale: 0.03,
    vertexColors: true,
    roughness: 0.70,
    metalness: 0.0,
    envMapIntensity: 0.18,
  });
  mats.intAccent = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.06, envMapIntensity: 0.20 });
  mats.carpet = new THREE.MeshStandardMaterial({
    map: upholsteryTex,
    bumpMap: upholsteryBump,
    bumpScale: 0.05,
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
    envMapIntensity: 0.10,
  });
  mats.carpet2 = new THREE.MeshStandardMaterial({
    map: upholsteryTex,
    bumpMap: upholsteryBump,
    bumpScale: 0.05,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.12,
  });
  mats.intExitSign = new THREE.MeshStandardMaterial({
    map: exitSignTex,
    emissiveMap: exitSignTex,
    emissive: 0xffffff,
    emissiveIntensity: 1.45,
    vertexColors: true,
    roughness: 0.30,
  });
  mats.intExitSign.userData.cast = false;
  const intTileTex = T.makeInteriorTile();
  intTileTex.repeat.set(1, 1);
  mats.intTile = new THREE.MeshStandardMaterial({ map: intTileTex, vertexColors: true, roughness: 0.72, metalness: 0.0, envMapIntensity: 0.18 });
  mats.intTile.userData.cast = false;
  const marbleTex = T.makeInteriorMarble();
  marbleTex.repeat.set(1, 1);
  mats.intMarble = new THREE.MeshStandardMaterial({ map: marbleTex, color: 0xf4f0e8, vertexColors: true, roughness: 0.52, metalness: 0.02, envMapIntensity: 0.24 });
  mats.intMarble.userData.cast = false;
  const gravel = T.makeGravel();
  mats.roof = new THREE.MeshStandardMaterial({ map: gravel, vertexColors: true, roughness: 0.98, envMapIntensity: 0.14 });
  mats.prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02, envMapIntensity: 0.18 });
  mats.propMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.56, envMapIntensity: 0.45 });
  mats.red = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.65, 0.12, 0.08), toneMapped: false });
  const gSidewalk = new THREE.MeshStandardMaterial({ map: T.makeSidewalk(), bumpMap: T.makeSidewalkBump(), bumpScale: 0.11, vertexColors: true, roughness: 0.94, envMapIntensity: 0.16 });
  const gConc = new THREE.MeshStandardMaterial({ map: T.makeConcrete(), vertexColors: true, roughness: 0.94, envMapIntensity: 0.16 });
  const gAsph = new THREE.MeshStandardMaterial({ map: T.makeAsphaltLot(), vertexColors: true, roughness: 0.94, envMapIntensity: 0.18 });
  const gGrass = new THREE.MeshStandardMaterial({ map: T.makeGrass(), vertexColors: true, roughness: 0.98, envMapIntensity: 0.12 });
  const gSand = new THREE.MeshStandardMaterial({ map: T.makeSand(), bumpMap: T.makeSandBump(), bumpScale: 0.16, vertexColors: true, roughness: 0.97, envMapIntensity: 0.14 });
  const gWood = new THREE.MeshStandardMaterial({ map: T.makeWood(), vertexColors: true, roughness: 0.88, envMapIntensity: 0.18 });
  const runwayMat = new THREE.MeshStandardMaterial({ map: T.makeRunwayTexture(), bumpMap: T.makeRoadBump(), bumpScale: 0.08, vertexColors: true, roughness: 0.92, envMapIntensity: 0.18 });
  for (const m of [gSidewalk, gConc, gAsph, gGrass, gSand, gWood, runwayMat]) m.userData.cast = false;
  Object.assign(mats, { g_sidewalk: gSidewalk, conc: gConc, g_asph: gAsph, g_grass: gGrass, g_sand: gSand, wood: gWood, runway: runwayMat });
  mats.water = new THREE.MeshPhysicalMaterial({ color: 0x2c7ea6, roughness: 0.16, metalness: 0.14, clearcoat: 0.35, clearcoatRoughness: 0.18, vertexColors: true, envMapIntensity: 0.72 });
  mats.pool = new THREE.MeshPhysicalMaterial({ color: 0x35c4e6, roughness: 0.12, metalness: 0.08, clearcoat: 0.32, emissive: 0x0a4a5a, emissiveIntensity: 0.45, envMapIntensity: 0.65 });
  mats.water.userData.cast = false; mats.pool.userData.cast = false;
  const roadBump = T.makeRoadBump();
  const roadRough = T.makeRoadRoughness();
  roadRough.repeat.set(1, 1);
  const roadMat = new THREE.MeshPhysicalMaterial({
    map: T.makeRoad(), bumpMap: roadBump, bumpScale: 0.11,
    roughnessMap: roadRough, roughness: 0.95, metalness: 0.0,
    clearcoat: 0.0, clearcoatRoughness: 0.85, envMapIntensity: 0.18, vertexColors: true,
  });
  const interMat = new THREE.MeshPhysicalMaterial({
    map: T.makeIntersection(), bumpMap: roadBump, bumpScale: 0.11,
    roughnessMap: roadRough, roughness: 0.95, metalness: 0.0,
    clearcoat: 0.0, clearcoatRoughness: 0.85, envMapIntensity: 0.18, vertexColors: true,
  });
  const xwMat = new THREE.MeshStandardMaterial({ map: T.makeCrosswalk(), vertexColors: true, roughness: 0.88, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const m of [roadMat, interMat, xwMat]) m.userData.cast = false;
  Object.assign(mats, { road: roadMat, inter: interMat, xwalk: xwMat });
  microtextures.registerCityMaterials(mats);

  // ---------------------------------------------------------------- 10km x 10km continuous terrain mesh (matches terrainHeightAt 1:1)
  {
    const SIZE = WORLD_HALF * 2 + 600; // 10,600m x 10,600m
    const SEG = 160;
    const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    tGeo.rotateX(-Math.PI / 2);
    const pos = tGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0x6d9354);
    const cSand = new THREE.Color(0xe0cb94);
    const cWetSand = new THREE.Color(0xa69367);
    const cRock = new THREE.Color(0x7c7b72);
    const cCityBase = new THREE.Color(0x5f744c);
    const cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const h = terrainHeightAt(vx, vz);
      // Slight -0.06 offset in flat core/suburbs/gas-pads so crisp roads/sidewalks never z-fight
      const flatCore = Math.abs(vx) <= 700 && vz >= -700 && vz <= 630;
      const inSuburb = isInSuburbanZone(vx, vz, 16) !== null;
      const inGasPad = nearestRuralGasStation(vx, vz).dist <= 60;
      pos.setY(i, flatCore || inSuburb || inGasPad ? -0.06 : h - 0.04);
      const isl = DECK.ISLAND;
      const di = Math.hypot(vx - isl.cx, vz - isl.cz);
      if (isOceanAt(vx, vz)) {
        cc.copy(cWetSand).multiplyScalar(0.75);
      } else if (di < isl.r + 30) {
        cc.copy(di > isl.r - 160 ? cSand : cGrass);
      } else if (inSuburb) {
        cc.copy(cCityBase);
      } else if (vx < -730) {
        // Golden Dunes & Western Desert
        const ridge = Math.min(1, Math.max(0, h / 16));
        cc.copy(cSand).lerp(new THREE.Color(0xead69e), ridge * 0.45);
        if (vz > 4320) cc.copy(cWetSand);
      } else if (vz >= 522 && vz <= 622 && vx >= -730) {
        cc.copy(vz > 596 ? cWetSand : cSand);
      } else if (vz < -730) {
        cc.copy(cGrass).lerp(cRock, Math.min(1, Math.max(0, (h - 14) / 26)));
      } else if (flatCore) {
        cc.copy(cCityBase);
      } else {
        cc.copy(cGrass).lerp(cSand, Math.min(1, Math.max(0, (vz - 340) / 260)) * 0.45);
      }
      colors[i * 3] = cc.r; colors[i * 3 + 1] = cc.g; colors[i * 3 + 2] = cc.b;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tGeo.computeVertexNormals();
    const sandDetail = T.makeSand();
    sandDetail.repeat.set(320, 320);
    const sandBump = T.makeSandBump();
    sandBump.repeat.set(320, 320);
    const terrainMesh = new THREE.Mesh(
      tGeo,
      new THREE.MeshStandardMaterial({
        map: sandDetail, bumpMap: sandBump, bumpScale: 0.14, vertexColors: true, roughness: 0.96, metalness: 0.02,
      }),
    );
    terrainMesh.receiveShadow = true;
    group.add(terrainMesh);
  }

  // Dedicated crisp beachfront sand strip right south of downtown for ultra-sharp local sand ripples
  {
    const sandTex = T.makeSand();
    sandTex.repeat.set(160, 14);
    const sandB = T.makeSandBump();
    sandB.repeat.set(160, 14);
    const beachStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 112).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: sandTex, bumpMap: sandB, bumpScale: 0.16, roughness: 0.96 }),
    );
    beachStrip.position.set(0, -0.018, 528 + 56);
    beachStrip.receiveShadow = true;
    group.add(beachStrip);
    const wet = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 16).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xa49266, roughness: 0.48, metalness: 0.08 }),
    );
    wet.position.set(0, -0.012, 606);
    group.add(wet);
  }

  // Expansive shimmering ocean covering the southern 10km bay & horizon
  const waterNormal = T.makeWaterNormal(256);
  waterNormal.repeat.set(420, 420);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(14000, 9000).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: 0x0e6b8c, roughness: 0.16, metalness: 0.24, clearcoat: 0.35, clearcoatRoughness: 0.16,
      normalMap: waterNormal, normalScale: new THREE.Vector2(0.95, 0.95), envMapIntensity: 1.15,
    }),
  );
  ocean.position.set(0, -0.42, 4800);
  group.add(ocean);

  // Distant mountain silhouette peaks ringing the far 5km northern/eastern edges
  {
    const parts: THREE.BufferGeometry[] = [];
    const mr = new Rng(99);
    for (let i = 0; i < 42; i++) {
      const a = Math.PI * 0.06 + (i / 42) * Math.PI * 1.88;
      const ang = a + Math.PI / 2;
      const dist = mr.range(4600, 5400);
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist - 400;
      if (z > 1200) continue;
      const rad = mr.range(420, 780);
      const g = new THREE.IcosahedronGeometry(rad, 1);
      const p = g.attributes.position;
      const peak = mr.range(0.45, 0.92);
      for (let k = 0; k < p.count; k++) {
        const hsh = Math.sin(p.getX(k) * 0.01 + p.getZ(k) * 0.012 + i) * 0.08;
        const f = 1 + hsh;
        const yy = p.getY(k) < 0 ? p.getY(k) * 0.2 : p.getY(k) * peak;
        p.setXYZ(k, p.getX(k) * f * 1.2, Math.max(-rad * 0.18, yy), p.getZ(k) * f * 1.2);
      }
      g.computeVertexNormals();
      const col = new Float32Array(p.count * 3);
      const c1 = new THREE.Color(0x3a5c40), c2 = new THREE.Color(0x888b82), cc = new THREE.Color();
      for (let k = 0; k < p.count; k++) {
        const h = Math.max(0, p.getY(k)) / (rad * 0.7);
        cc.copy(c1).lerp(c2, Math.min(1, h * 1.2));
        col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.translate(x, -rad * 0.2, z);
      const ng = g.index ? g.toNonIndexed() : g;
      ng.deleteAttribute('uv');
      parts.push(ng);
    }
    const mg = mergeGeometries(parts, false)!;
    const mm = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    group.add(mm);
  }

  // ---------------------------------------------------------------- roads
  const roadG: THREE.BufferGeometry[] = [], interG: THREE.BufferGeometry[] = [], xwG: THREE.BufferGeometry[] = [];
  const RW = ROAD_W / 2;
  for (let k = 0; k <= NB; k++)
    for (let l = 0; l < NB; l++) {
      const x = roadLine(k), z0 = roadLine(l) + RW, z1 = roadLine(l + 1) - RW;
      roadG.push(flat(x - RW, z0, x + RW, z1, 0.01, (px, pz) => [(px - (x - RW)) / ROAD_W, (pz - z0) / T.ROAD_TILE_LEN]));
    }
  for (let l = 0; l <= NB; l++)
    for (let k = 0; k < NB; k++) {
      const z = roadLine(l), x0 = roadLine(k) + RW, x1 = roadLine(k + 1) - RW;
      roadG.push(flat(x0, z - RW, x1, z + RW, 0.01, (px, pz) => [(pz - (z - RW)) / ROAD_W, (px - x0) / T.ROAD_TILE_LEN]));
    }
  for (let k = 0; k <= NB; k++)
    for (let l = 0; l <= NB; l++) {
      const x = roadLine(k), z = roadLine(l);
      interG.push(flat(x - RW, z - RW, x + RW, z + RW, 0.012, (px, pz) => [(px - (x - RW)) / ROAD_W, (pz - (z - RW)) / ROAD_W]));
      const y = 0.03;
      if (k < NB) xwG.push(flat(x + 11, z - RW, x + 14, z + RW, y, (px, pz) => [(px - (x + 11)) / 3, (pz - (z - RW)) / ROAD_W]));
      if (k > 0) xwG.push(flat(x - 14, z - RW, x - 11, z + RW, y, (px, pz) => [(px - (x - 14)) / 3, (pz - (z - RW)) / ROAD_W]));
      if (l < NB) xwG.push(flat(x - RW, z + 11, x + RW, z + 14, y, (px, pz) => [(pz - (z + 11)) / 3, (px - (x - RW)) / ROAD_W]));
      if (l > 0) xwG.push(flat(x - RW, z - 14, x + RW, z - 11, y, (px, pz) => [(pz - (z - 14)) / 3, (px - (x - RW)) / ROAD_W]));
    }
  const addMerged = (arr: THREE.BufferGeometry[], mat: THREE.Material, order = 0) => {
    const mesh = new THREE.Mesh(mergeGeometries(arr, false)!, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    group.add(mesh);
  };
  addMerged(roadG, roadMat);
  addMerged(interG, interMat);
  addMerged(xwG, xwMat, 1);
  for (let k = 0; k <= NB; k++) mapRects.push({ x0: roadLine(k) - RW, z0: -HALF - RW, x1: roadLine(k) + RW, z1: HALF + RW, c: '#2a2d33' });
  for (let l = 0; l <= NB; l++) mapRects.push({ x0: -HALF - RW, z0: roadLine(l) - RW, x1: HALF + RW, z1: roadLine(l) + RW, c: '#2a2d33' });

  // Open outer sidewalk ring around the core city (NO enclosing perimeter walls — seamless transition into the 10km world!)
  {
    const o = HALF + 10, e = HALF + 16;
    const strips: [number, number, number, number][] = [[-e, -e, e, -o], [-e, o, e, e], [-e, -o, -o, o], [o, -o, e, o]];
    for (const [x0, z0, x1, z1] of strips) {
      batch.add('g_sidewalk', flat(x0, z0, x1, z1, SIDEWALK_Y, (px, pz) => [px / 4, pz / 4]));
      batch.add('prop', box(x1 - x0, 0.15, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0x9a9a96));
    }
  }

  // ---------------------------------------------------------------- core city blocks
  const shift = (lot: Lot, bx: number, bz: number): Lot => ({ x0: lot.x0 + bx, x1: lot.x1 + bx, z0: lot.z0 + bz, z1: lot.z1 + bz, faces: lot.faces });
  const mapColors: Record<string, string> = { R: '#5b6b4a', C: '#6c675e', M: '#6c675e', D: '#6c675e', B: '#6c675e', L: '#596068', V: '#b5923e', A: '#4c6d8c', P: '#4f7a3a', I: '#5b5d60', H: '#6c675e', Q: '#6c675e', T: '#8a8160', K: '#55575c', S: '#55575c', Y: '#55575c', G: '#6c675e' };
  for (let bj = 0; bj < NB; bj++)
    for (let bi = 0; bi < NB; bi++) {
      const bx = blockCenter(bi), bz = blockCenter(bj);
      const t = DISTRICTS[bj][bi];
      const ch = chunk(bx, bz);
      mapRects.push({ x0: bx - BLOCK_HALF, z0: bz - BLOCK_HALF, x1: bx + BLOCK_HALF, z1: bz + BLOCK_HALF, c: mapColors[t] ?? '#555' });
      batch.add('prop', box(SLAB_W, 0.15, SLAB_W, bx, 0, bz, 0x9d9d99), ch);
      batch.add('g_sidewalk', flat(bx - BLOCK_HALF, bz - BLOCK_HALF, bx + BLOCK_HALF, bz + BLOCK_HALF, SIDEWALK_Y, (px, pz) => [px / 4, pz / 4]), ch);
      const innerMat = t === 'R' || t === 'P' ? 'g_grass' : t === 'I' || t === 'K' || t === 'S' || t === 'Y' ? 'g_asph' : 'conc';
      const inner = (x0: number, z0: number, x1: number, z1: number, m = innerMat, y = 0.18) =>
        batch.add(m, flat(x0, z0, x1, z1, y, (px, pz) => [px / (m === 'g_grass' ? 6 : 4), pz / (m === 'g_grass' ? 6 : 4)]), ch);
      inner(bx - INNER_HALF, bz - INNER_HALF, bx + INNER_HALF, bz + INNER_HALF);
      const lotsOf = (cols: number, rows: number, gap: number) => splitLots(rng, cols, rows, gap).map((l) => shift(l, bx, bz));
      const styleMid = (): FacadeStyle => rng.pick(['brick', 'office', 'stone', 'apartment', 'brick']);
      switch (t) {
        case 'D': {
          for (const lot of lotsOf(2, 2, 6)) addTower(ctx, lot, rng.int(20, 46));
          break;
        }
        case 'M': {
          const dist: 'havana' | 'wynwood' | 'downtown' = bi <= 2 ? 'havana' : bi >= 6 ? 'wynwood' : 'downtown';
          const midLots = lotsOf(rng.chance(0.5) ? 2 : 3, 2, 4);
          midLots.forEach((lot, idx) => {
            // Dedicate realistic urban surface parking lots on selected midtown parcels
            if (idx === midLots.length - 1 && (bi + bj) % 3 === 1) {
              addSurfaceParkingLot(ctx, lot);
              return;
            }
            const style = styleMid();
            buildingInLot(ctx, lot, { floors: rng.int(6, 14), style, store: true, fire: true, ad: rng.chance(0.25), district: dist });
          });
          break;
        }
        case 'C':
        case 'G':
        case 'T': {
          if (t === 'T') { addBeachfront(ctx, bx, bz, bi); break; }
          if (t === 'C') {
            // Hand-crafted Leonida / GTA-6 neighborhood diversity across commercial blocks!
            if (bj <= 1 || (bj === 6 && bi === 5) || (bj === 7 && bi === 5)) {
              addStripMallBlock(ctx, bx, bz);
              break;
            }
            if (bi <= 2) {
              addLittleHavanaBlock(ctx, bx, bz);
              break;
            }
            if (bi >= 6) {
              addWynwoodArtsBlock(ctx, bx, bz);
              break;
            }
          }
          let lots: Lot[];
          if (t === 'G') {
            addGunShop(ctx, bx, bz);
            lots = [
              { x0: -42, x1: -18, z0: -42, z1: 42, faces: 8 | 4 | 1 }, { x0: 18, x1: 42, z0: -42, z1: 42, faces: 2 | 4 | 1 }, { x0: -14, x1: 14, z0: -2, z1: 42, faces: 1 },
            ].map((l) => shift(l, bx, bz));
          } else lots = lotsOf(3, rng.chance(0.5) ? 2 : 3, 4);
          lots.forEach((lot, idx) => {
            if (t === 'C' && idx === 0 && (bi + bj) % 2 === 0) {
              addSurfaceParkingLot(ctx, lot);
              return;
            }
            if (rng.chance(0.05)) {
              addTree(ctx, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, 3);
              return;
            }
            const style = rng.pick(['brick', 'apartment', 'stone', 'brick'] as FacadeStyle[]);
            buildingInLot(ctx, lot, { floors: rng.int(2, 5), style, store: true, fire: true, ad: rng.chance(0.15), district: 'strip' });
          });
          break;
        }
        case 'R': {
          for (const row of [-1, 1]) {
            for (let i = 0; i < 4; i++) {
              const lx = bx - 42 + 10.5 + i * 21;
              addHouse(ctx, lx, bz + row * 42, row, lx - 10.5, lx + 10.5);
            }
          }
          break;
        }
        case 'I': {
          if (rng.chance(0.5)) {
            for (const lot of lotsOf(2, 2, 10)) {
              const lw = lot.x1 - lot.x0 - 4, ld = lot.z1 - lot.z0 - 4;
              addWarehouse(ctx, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, Math.floor(lw / 3.5) * 3.5, Math.floor(ld / 3.5) * 3.5, lot.faces);
            }
          } else {
            addWarehouse(ctx, bx, bz - 24, 80, 34, 4);
            addContainers(ctx, bx - 36, bz + 4, 8, 3, 3);
            addSilos(ctx, bx + 12, bz + 30, 3);
          }
          for (let i = 0; i < 5; i++) ctx.props.push({ kind: rng.chance(0.4) ? 'xbarrel' : 'barrel', x: bx + rng.range(-40, 40), z: bz + rng.range(-5, 40) });
          for (let i = 0; i < 6; i++) ctx.props.push({ kind: 'crate', x: bx + rng.range(-40, 40), z: bz + rng.range(10, 40) });
          break;
        }
        case 'K': {
          addContainers(ctx, bx - 38, bz - 38, 13, 3, 3);
          addContainers(ctx, bx - 38, bz + 2, 13, 3, 2);
          if (bj === 8) addCrane(ctx, bx, bz + 40);
          for (let i = 0; i < 6; i++) ctx.props.push({ kind: 'crate', x: bx + rng.range(-40, 40), z: bz + rng.range(-5, 5) });
          break;
        }
        case 'P': addPark(ctx, bx, bz); break;
        case 'H': addHospital(ctx, bx, bz); break;
        case 'Q': addPolice(ctx, bx, bz); break;
        case 'B': addBank(ctx, bx, bz); break;
        case 'L': addParkingGarage(ctx, bx, bz); break;
        case 'V': addCasino(ctx, bx, bz, bi === 5 ? 'ROYAL PALMS CASINO' : 'GOLDEN SANDS CASINO'); break;
        case 'A': addCarDealership(ctx, bx, bz, bi === 6 ? 'APEX MOTORS' : 'NOVA AUTO GALLERY'); break;
        case 'S': {
          addGas(ctx, bx, bz);
          for (const s of [-1, 1]) addBuilding(ctx, { cx: bx + s * 33, cz: bz - 8, w: 14, d: 38, floors: 3, style: 'apartment', store: true, faces: s > 0 ? 2 : 8, fire: false });
          break;
        }
        case 'Y': {
          addPaySpray(ctx, bx, bz);
          const lots = [{ x0: -42, x1: -2, z0: -42, z1: 0, faces: 8 | 4 }, { x0: 2, x1: 42, z0: -42, z1: 0, faces: 2 | 4 }].map((l) => shift(l, bx, bz));
          for (const lot of lots) buildingInLot(ctx, lot, { floors: rng.int(2, 4), style: 'brick', store: true, fire: true });
          break;
        }
      }
    }

  // ---------------------------------------------------------------- outer 10km landmarks, beach cabanas & desert outposts
  buildOuterLandmarks(ctx, rng);

  // ---------------------------------------------------------------- elevated highways, 10km beltway, bridges, infrastructure
  buildInfrastructure(ctx);
  const rooms = buildInteriors(ctx);

  // ---------------------------------------------------------------- beach / pier + Vice Wheel + tourist umbrellas
  beachProps(ctx, PIER_X);
  addBoardwalkWheel(ctx, 78, 560);
  buildBeachTouristZone(ctx, rng);

  // ---------------------------------------------------------------- street furniture along every road segment
  const parking: ParkingSpot[] = [];
  let spotId = 0;
  const hydrant = finish(new THREE.CylinderGeometry(0.17, 0.2, 0.7, 8).translate(0, 0.35, 0), 0xc0392b);
  const segs: { x0: number; z0: number; dx: number; dz: number; len: number; k: number; l: number }[] = [];
  for (let k = 0; k <= NB; k++) for (let l = 0; l < NB; l++) segs.push({ x0: roadLine(k), z0: roadLine(l) + RW, dx: 0, dz: 1, len: P - ROAD_W, k, l });
  for (let l = 0; l <= NB; l++) for (let k = 0; k < NB; k++) segs.push({ x0: roadLine(k) + RW, z0: roadLine(l), dx: 1, dz: 0, len: P - ROAD_W, k, l });
  const cones = new Set<number>();
  for (let i = 0; i < 7; i++) cones.add(rng.int(0, segs.length - 1));
  segs.forEach((s, si) => {
    const rx = -s.dz, rz = s.dx;
    const at = (a: number, lat: number): [number, number] => [s.x0 + s.dx * a + rx * lat, s.z0 + s.dz * a + rz * lat];
    const bannerCols = [0xc83e4d, 0x2563eb, 0xd97706, 0x0f766e, 0x7c3aed];
    for (let i = 0; i < 2; i++) {
      const side = (i + si) % 2 ? 1 : -1;
      const [lx, lz] = at(26 + i * 42, side * (RW + 1.4));
      addLamp(ctx, lx, lz, -rx * side, -rz * side);
      // Hanging fabric streetlamp district banner (mounted flush to lamp mast)
      const byaw = Math.atan2(-rx * side, -rz * side);
      const bCol = bannerCols[(si + i) % bannerCols.length];
      batch.add('propMetal', box(0.06, 0.06, 0.72, lx - rx * side * 0.42, 5.45, lz - rz * side * 0.42, 0x3a3f46, byaw), chunk(lx, lz));
      batch.add('prop', box(0.05, 1.38, 0.56, lx - rx * side * 0.44, 4.08, lz - rz * side * 0.44, bCol, byaw), chunk(lx, lz));
    }
    const dist = Math.hypot(s.x0 + s.dx * 47, s.z0 + s.dz * 47);
    const treeP = dist < 150 ? 0.45 : 0.8;
    for (const side of [-1, 1]) {
      for (let a = 20; a < s.len - 18; a += 22) {
        if (!rng.chance(treeP)) continue;
        const aa = a + rng.range(-2, 2) + (side > 0 ? 6 : 0);
        const [tx, tz] = at(aa, side * (RW + 2.35));
        addTree(ctx, tx, tz, rng.chance(0.15) ? 2 : -1, 0.8);
        // Cast-iron square sidewalk tree grate seated flush around tree trunk
        batch.add('propMetal', box(1.65, 0.04, 1.65, tx, SIDEWALK_Y + 0.005, tz, 0x2d3238), chunk(tx, tz));
      }

      // Rich Sidewalk Streetscape Details: wooden/cast-iron benches, newspaper boxes, parking meters, storm grates & cafe seating
      const faceYaw = Math.atan2(-rx * side, -rz * side);
      const benchA = side > 0 ? 34 : 58;
      if (rng.chance(0.58)) {
        const [bx3, bz3] = at(benchA, side * (RW + 3.4));
        const bCh = chunk(bx3, bz3);
        batch.add('wood', box(1.85, 0.08, 0.48, bx3, SIDEWALK_Y + 0.46, bz3, 0x7d5533, faceYaw), bCh);
        batch.add('wood', box(1.85, 0.42, 0.07, bx3 + rx * side * 0.22, SIDEWALK_Y + 0.56, bz3 + rz * side * 0.22, 0x7d5533, faceYaw), bCh);
        for (const off of [-0.72, 0.72]) {
          batch.add('propMetal', box(0.08, 0.46, 0.48, bx3 + s.dx * off, SIDEWALK_Y, bz3 + s.dz * off, 0x2a2f36, faceYaw), bCh);
        }
        world.addBox(bx3 - 0.95, bx3 + 0.95, bz3 - 0.5, bz3 + 0.5, SIDEWALK_Y + 0.95);
      }
      // Colorful sidewalk newspaper & mail boxes near street corners
      if (rng.chance(0.42)) {
        const [nx, nz] = at(18, side * (RW + 1.35));
        const nCh = chunk(nx, nz);
        batch.add('propMetal', box(0.52, 1.12, 0.46, nx, SIDEWALK_Y, nz, 0x1d4ed8, faceYaw), nCh);
        batch.add('prop', box(0.46, 1.02, 0.42, nx + s.dx * 0.58, SIDEWALK_Y, nz + s.dz * 0.58, 0xd97706, faceYaw), nCh);
        batch.add('prop', box(0.46, 1.02, 0.42, nx + s.dx * 1.12, SIDEWALK_Y, nz + s.dz * 1.12, 0xb91c1c, faceYaw), nCh);
      }
      // Curb storm-drain grates & street manhole covers (realistic urban street detail!)
      const [gx, gz] = at(22, side * (RW - 0.55));
      batch.add('propMetal', box(0.65, 0.02, 0.95, gx, 0.02, gz, 0x2b3036, faceYaw), chunk(gx, gz));
      if (side === 1) {
        const [mx, mz] = at(s.len * 0.52, 0);
        batch.add('propMetal', cyl(0.44, 0.44, 0.025, mx, 0.02, mz, 0x32373e, 10), chunk(mx, mz));
      }
      // Sidewalk cafe bistro table + umbrella in lively downtown/commercial zones
      if (dist < 280 && rng.chance(0.32)) {
        const [cx3, cz3] = at(48, side * (RW + 3.9));
        const cCh = chunk(cx3, cz3);
        batch.add('propMetal', cyl(0.04, 0.04, 2.25, cx3, SIDEWALK_Y, cz3, 0x3b424c, 6), cCh);
        batch.add('prop', cyl(0.58, 0.58, 0.06, cx3, SIDEWALK_Y + 0.74, cz3, 0xf2ede4, 10), cCh);
        const uCol = bannerCols[(si + (side > 0 ? 1 : 3)) % bannerCols.length];
        const umb = new THREE.ConeGeometry(1.18, 0.42, 8);
        umb.translate(cx3, SIDEWALK_Y + 2.25, cz3);
        batch.add('prop', finish(umb, uCol), cCh);
        world.addCircle(cx3, cz3, 0.65, SIDEWALK_Y + 2.4, 'cafe');
      }
    }
    if (rng.chance(0.4)) {
      const side = rng.chance(0.5) ? 1 : -1;
      const [hx, hz] = at(rng.range(30, s.len - 30), side * (RW + 1.0));
      batch.add('prop', finish(hydrant.clone(), 0xc0392b, { x: hx, z: hz }), chunk(hx, hz));
      world.addCircle(hx, hz, 0.22, 0.7, 'hydrant');
    }
    if (rng.chance(0.35)) {
      const side = rng.chance(0.5) ? 1 : -1;
      const [bx2, bz2] = at(rng.range(24, s.len - 24), side * (RW + 1.0));
      ctx.props.push({ kind: 'bin', x: bx2, z: bz2 });
    }
    if (rng.chance(0.18)) {
      const side = rng.chance(0.5) ? 1 : -1;
      const [px, pz] = at(s.len / 2 + rng.range(-8, 8), side * (RW + 2.2));
      const yaw = Math.atan2(-rx * side, -rz * side);
      const g: THREE.BufferGeometry[] = [
        box(3.6, 0.1, 1.6, 0, 2.6, 0, 0x2d3a46), box(0.1, 2.6, 0.1, -1.7, 0, -0.7, 0x2d3a46), box(0.1, 2.6, 0.1, 1.7, 0, -0.7, 0x2d3a46),
        box(3.4, 1.7, 0.04, 0, 0.7, -0.75, 0x8fb7c9), box(2.4, 0.08, 0.5, 0, 0.5, -0.4, 0x6b4a2a),
        box(0.7, 1.4, 0.06, 1.2, 0.5, -0.82, 0xffffff),
      ];
      for (const gg of g) {
        gg.rotateY(yaw);
        gg.translate(px, 0, pz);
        batch.add('prop', gg, chunk(px, pz));
      }
      world.addBox(px - 1.9, px + 1.9, pz - 1.9, pz + 1.9, 2.7, 'busstop');
    }
    if (cones.has(si)) {
      for (let q = 0; q < 6; q++) {
        const [cx2, cz2] = at(24 + q * 1.9, 6.1 + (q > 3 ? (q - 3) * 0.3 : 0));
        ctx.props.push({ kind: 'cone', x: cx2, z: cz2 });
      }
      const [wx, wz] = at(22, 7.2);
      batch.add('prop', box(0.12, 1.1, 0.12, wx, 0, wz, 0x888888), chunk(wx, wz));
      batch.add('prop', box(1.6, 0.5, 0.06, wx, 1.0, wz, 0xf39c12, Math.atan2(rx, rz)), chunk(wx, wz));
    }
    for (const dirSign of [1, -1]) {
      let meterIdx = 0;
      for (let a = 30; a < s.len - 24; a += 6.4) {
        if (!rng.chance(0.4)) continue;
        const lat = PARK_OFF * dirSign;
        const [px, pz] = at(a, lat);
        const yaw = Math.atan2(s.dx * dirSign, s.dz * dirSign);
        parking.push({ x: px, z: pz, yaw, used: false, id: spotId++ });
        // Sidewalk stainless parking meter alongside parked curb bays
        if (meterIdx++ % 2 === 0) {
          const [mx, mz] = at(a, (RW + 0.65) * dirSign);
          const mCh = chunk(mx, mz);
          batch.add('propMetal', cyl(0.035, 0.04, 1.15, mx, SIDEWALK_Y, mz, 0x4b5563, 6), mCh);
          batch.add('propMetal', box(0.16, 0.24, 0.12, mx, SIDEWALK_Y + 1.15, mz, 0x374151, yaw), mCh);
        }
      }
    }
  });

  if (ctx.places.police) {
    const pp = ctx.places.police;
    for (let i = 0; i < 6; i++) parking.push({ x: pp.x - 25 + i * 10, z: pp.z + 8, yaw: Math.PI, used: false, id: spotId++, police: true });
  }
  if (ctx.places.parking) {
    const pg = ctx.places.parking;
    for (let i = 0; i < 5; i++) {
      const ox = -19.2 + i * 9.6;
      if (Math.abs(ox) < 5) continue;
      parking.push({ x: pg.x + ox, z: pg.z + 2.5, yaw: 0, used: false, id: spotId++ });
    }
  }

  // ---------------------------------------------------------------- traffic signals
  const heads: { k: number; l: number; axis: 0 | 1; idx: number; last: number }[] = [];
  const lensPos: THREE.Vector3[] = [];
  const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let k = 0; k <= NB; k++)
    for (let l = 0; l <= NB; l++) {
      for (const [dx, dz] of dirs) {
        if (dx === 1 && k === 0) continue;
        if (dx === -1 && k === NB) continue;
        if (dz === 1 && l === 0) continue;
        if (dz === -1 && l === NB) continue;
        const rx = -dz, rz = dx;
        const cx = roadLine(k), cz = roadLine(l);
        const px = cx - dx * 11 + rx * 11, pz = cz - dz * 11 + rz * 11;
        const hx = px - rx * 4.2, hz = pz - rz * 4.2;
        const ch = chunk(px, pz);
        batch.add('propMetal', cyl(0.1, 0.13, 5.5, px, 0, pz, 0x3a3d42, 8), ch);
        batch.add('propMetal', box(0.12, 0.12, 4.4, (px + hx) / 2, 5.4, (pz + hz) / 2, 0x3a3d42, Math.atan2(-rx, -rz)), ch);
        batch.add('prop', box(0.42, 1.4, 0.34, hx, 4.7, hz, 0x1b1c1f, Math.atan2(dx, dz)), ch);
        world.addCircle(px, pz, 0.16, 5.5, 'signal');
        const idx = lensPos.length;
        for (let q = 0; q < 3; q++) lensPos.push(new THREE.Vector3(hx - dx * 0.2, 5.4 + (1 - q) * 0.42, hz - dz * 0.2));
        heads.push({ k, l, axis: dx !== 0 ? 0 : 1, idx, last: -1 });
      }
    }

  // Spawn-corner curb props so sculpted prop_cone.glb & wooden crate are visible near spawn
  ctx.props.push(
    { kind: 'cone', x: -292, z: 33.8 },
    { kind: 'cone', x: -288.5, z: 33.8 },
    { kind: 'crate', x: -293.5, z: 36.2 },
    { kind: 'barrel', x: -292.0, z: 36.4 },
  );

  // Handcrafted NovaBank Sidewalk ATM Kiosks & Branch Entrance Plinths
  for (const atm of ATM_LOCATIONS) {
    const ch = chunk(atm.x, atm.z);
    const gy = Math.max(0, groundHeight(atm.x, atm.z));
    batch.add('propMetal', box(0.95, 2.05, 0.72, atm.x, gy, atm.z, 0x18262e), ch);
    batch.add('propMetal', box(1.12, 0.14, 0.96, atm.x, gy + 2.05, atm.z, 0x0f9d76), ch);
    batch.add('emit', box(0.68, 0.52, 0.06, atm.x, gy + 1.24, atm.z + 0.37, 0x1cf2a8), ch);
    batch.add('emit', box(0.68, 0.52, 0.06, atm.x, gy + 1.24, atm.z - 0.37, 0x1cf2a8), ch);
    world.addBox(atm.x - 0.52, atm.x + 0.52, atm.z - 0.42, atm.z + 0.42, gy + 2.2);
  }
  for (const br of BANK_BRANCHES) {
    ctx.doors.push({ x: br.x, z: br.z, yaw: br.doorYaw, name: br.name, kind: 'bank' });
  }

  // ---------------------------------------------------------------- build batches & real 3D grass blades
  batch.build(group, mats);
  const grassField = buildRealisticGrassField(world, rng);
  group.add(grassField.mesh);

  // instanced traffic lenses
  const lens = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), lensPos.length);
  const m4 = new THREE.Matrix4();
  lensPos.forEach((p, i) => lens.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  lens.instanceMatrix.needsUpdate = true;
  lens.setColorAt(0, new THREE.Color(0.1, 0.1, 0.1));
  lens.frustumCulled = false;
  group.add(lens);
  const cRed = new THREE.Color(3.2, 0.12, 0.08), cYel = new THREE.Color(3.2, 2.0, 0.05), cGrn = new THREE.Color(0.08, 3, 0.7);
  const dRed = new THREE.Color(0.14, 0.015, 0.015), dYel = new THREE.Color(0.14, 0.09, 0.0), dGrn = new THREE.Color(0.0, 0.12, 0.03);

  // lamp bulbs + warm street light pools
  const bulbGeo = new THREE.BoxGeometry(0.5, 0.1, 0.3);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x555555, toneMapped: false });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, Math.max(1, ctx.lampBulbs.length));
  const glow = T.makeGlow();
  const poolMat = new THREE.MeshBasicMaterial({ map: glow, color: 0xffcf8a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), poolMat, Math.max(1, ctx.lampBulbs.length));
  ctx.lampBulbs.forEach((b, i) => {
    bulbs.setMatrixAt(i, m4.makeTranslation(b.x, b.y, b.z));
    const py = Math.max(0.035, groundHeight(b.x, b.z) + 0.035);
    pools.setMatrixAt(i, m4.makeTranslation(b.x, py, b.z));
  });
  bulbs.frustumCulled = false;
  pools.frustumCulled = false;
  pools.renderOrder = 2;
  group.add(bulbs, pools);

  let lastNight = -1;
  const city: CityData = {
    group, world, mapRects, places: ctx.places, props: ctx.props, parking, collect: ctx.collect, ocean,
    doors: ctx.doors, rooms,
    setNight(n: number) {
      if (Math.abs(n - lastNight) < 0.01) return;
      lastNight = n;
      for (const m of facadeMats) m.emissiveIntensity = n * (m === mats.store ? 0.9 : 1.95);
      signMat.emissiveIntensity = 0.58 + n * 1.55;
      hwSignMat.emissiveIntensity = 0.28 + n * 1.1;
      adMat.emissiveIntensity = 0.22 + n * 0.9;
      const k = 0.35 + n * 3.3;
      bulbMat.color.setRGB(k, k * 0.88, k * 0.62);
      poolMat.opacity = n * 0.56;
      pools.visible = n > 0.04;
    },
    setRtx(enabled: boolean) {
      // Natural physically-grounded non-shiny outdoor material response (matte asphalt/brick, satin glass, crisp relief)
      const cc = 0.0;
      const rEnv = enabled ? 0.20 : 0.14;
      roadMat.clearcoat = cc;
      roadMat.clearcoatRoughness = 0.85;
      roadMat.roughnessMap = enabled ? roadRough : null;
      roadMat.roughness = enabled ? 0.95 : 0.97;
      roadMat.metalness = 0.0;
      roadMat.envMapIntensity = rEnv;
      roadMat.needsUpdate = true;
      interMat.clearcoat = cc;
      interMat.clearcoatRoughness = 0.85;
      interMat.roughnessMap = enabled ? roadRough : null;
      interMat.roughness = enabled ? 0.95 : 0.97;
      interMat.metalness = 0.0;
      interMat.envMapIntensity = rEnv;
      interMat.needsUpdate = true;
      const fGlass = mats.f_glass as THREE.MeshPhysicalMaterial;
      if (fGlass) {
        fGlass.clearcoat = enabled ? 0.16 : 0.0;
        fGlass.clearcoatRoughness = enabled ? 0.24 : 0.38;
        fGlass.metalness = enabled ? 0.36 : 0.24;
        fGlass.roughness = enabled ? 0.24 : 0.38;
        fGlass.envMapIntensity = enabled ? 0.52 : 0.32;
        fGlass.needsUpdate = true;
      }
      const pm = mats.propMetal as THREE.MeshStandardMaterial;
      if (pm) {
        pm.roughness = enabled ? 0.48 : 0.54;
        pm.envMapIntensity = enabled ? 0.34 : 0.24;
        pm.needsUpdate = true;
      }
      const stM = mats.store as THREE.MeshPhysicalMaterial;
      if (stM) {
        stM.clearcoat = 0.0;
        stM.clearcoatRoughness = 0.62;
        stM.roughness = 0.76;
        stM.envMapIntensity = enabled ? 0.24 : 0.18;
        stM.needsUpdate = true;
      }
      if (ocean.material instanceof THREE.MeshPhysicalMaterial) {
        ocean.material.roughness = enabled ? 0.16 : 0.28;
        ocean.material.clearcoat = enabled ? 0.35 : 0.0;
        ocean.material.envMapIntensity = enabled ? 1.15 : 0.62;
        ocean.material.needsUpdate = true;
      }
    },
    setMicrotextures(enabled: boolean) {
      microtextures.setEnabled(enabled);
    },
    update(dt: number, time: number) {
      void dt;
      grassField.update(time);
      if (ocean.material instanceof THREE.MeshStandardMaterial && ocean.material.normalMap) {
        ocean.material.normalMap.offset.set(time * 0.004, time * 0.0026);
      }
      let dirty = false;
      for (const h of heads) {
        const s = signalState(h.k, h.l, h.axis, time);
        if (s === h.last) continue;
        h.last = s;
        dirty = true;
        lens.setColorAt(h.idx, s === 2 ? cRed : dRed);
        lens.setColorAt(h.idx + 1, s === 1 ? cYel : dYel);
        lens.setColorAt(h.idx + 2, s === 0 ? cGrn : dGrn);
      }
      if (dirty && lens.instanceColor) lens.instanceColor.needsUpdate = true;
    },
  };
  void sph;
  return city;
}

/** Colorful beach umbrellas, towels, cabanas, and boardwalk lifeguard towers for tourist crowds. */
function buildBeachTouristZone(c: BCtx, rng: Rng) {
  const cols = [0xff4b5c, 0x2ec4b6, 0xffbe0b, 0x3a86ff, 0xff6f91, 0x06d6a0];
  for (let i = 0; i < 28; i++) {
    const x = -480 + i * 32 + rng.range(-7, 7);
    const z = 545 + rng.range(-8, 36);
    if (Math.abs(x - PIER_X) < 16) continue;
    const y0 = Math.max(0, terrainHeightAt(x, z));
    const ch = c.chunk(x, z);
    const col = cols[i % cols.length];
    // umbrella pole embedded cleanly into sand + canopy
    c.b.add('propMetal', cyl(0.05, 0.05, 2.55, x, y0 - 0.2, z, 0xe8eaec, 6), ch);
    const cone = new THREE.ConeGeometry(1.75, 0.58, 8);
    cone.translate(x, y0 + 2.35, z);
    c.b.add('prop', finish(cone, col), ch);
    // beach towel & cooler seated flush on sand
    c.b.add('prop', box(1.05, 0.04, 2.1, x + 0.9, y0 + 0.01, z + 0.5, cols[(i + 2) % cols.length], rng.range(-0.3, 0.3)), ch);
    if (i % 3 === 0) c.b.add('prop', box(0.65, 0.42, 0.42, x - 0.85, y0, z + 0.4, 0x2a7de1), ch);
  }
  // Lifeguard towers with grounded pilings
  for (const lx of [-340, 20, 260]) {
    const lz = 576, ch = c.chunk(lx, lz);
    const y0 = Math.max(0, terrainHeightAt(lx, lz));
    for (const ox of [-1.2, 1.2]) for (const oz of [-1.2, 1.2]) c.b.add('wood', box(0.22, 2.85, 0.22, lx + ox, y0 - 0.25, lz + oz, 0xa87d4b), ch);
    c.b.add('prop', box(3.0, 2.2, 3.0, lx, y0 + 2.5, lz, 0xf2f4f7), ch);
    c.b.add('prop', box(3.4, 0.28, 3.4, lx, y0 + 4.7, lz, 0xd63638), ch);
    c.b.add('glass', box(2.5, 0.9, 3.05, lx, y0 + 3.3, lz, 0x2a4e60), ch);
    c.world.addBox(lx - 1.5, lx + 1.5, lz - 1.5, lz + 1.5, y0 + 4.8, 'lifeguard');
  }
}

/** Populates expanded suburbs, 6 rural highway gas stations, airport, island resort, desert motel & outer landmarks. */
function buildOuterLandmarks(c: BCtx, rng: Rng) {
  // 0a. Expanded Suburban Neighborhoods ringing the urban core
  for (const sub of SUBURBAN_ZONES) {
    addSuburbanDistrict(c, sub);
  }

  // 0b. 6 Rural Highway Gas Stations & Truck Stops along the outer expressways & beltway
  for (const st of RURAL_GAS_STATIONS) {
    addRuralGasStation(c, st);
  }

  // 0c. San Nova International Airport (Eastern Coastal Plains, x = 1220..2180, z = -410..-110)
  addAirport(c);

  // 1. Nova Keys Resort Island (south across the cable-stayed ocean causeway)
  const isl = DECK.ISLAND;
  {
    const ch = c.chunk(isl.cx, isl.cz);
    const y0 = Math.max(1.8, terrainHeightAt(isl.cx, isl.cz));
    // Grounded foundation skirt + Resort hotel tower & pool plaza
    c.b.add('prop', box(44, 1.4, 22, isl.cx, y0 - 1.2, isl.cz + 40, 0xb8ad98), ch);
    c.b.add('f_apartment', box(42, 36, 20, isl.cx, y0, isl.cz + 40, 0xfff0d8), ch);
    c.b.add('prop', box(46, 1.2, 24, isl.cx, y0 + 36, isl.cz + 40, 0xd8c8a8), ch);
    c.b.add('pool', box(28, 0.2, 14, isl.cx, y0 + 0.05, isl.cz + 6, 0x35c4e6), ch);
    c.world.addBox(isl.cx - 21, isl.cx + 21, isl.cz + 30, isl.cz + 50, y0 + 36, 'resort');
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = isl.cx + Math.cos(a) * 140, pz = isl.cz + Math.sin(a) * 140;
      addTree(c, px, pz, 2, 1.15);
    }
    c.mapRects.push({ x0: isl.cx - 40, z0: isl.cz - 30, x1: isl.cx + 40, z1: isl.cz + 70, c: '#c8b288' });
    c.places.resort = { x: isl.cx, z: isl.cz + 10 };
  }

  // 2. Golden Dunes Oasis & Desert Motel (West Dunes at -2200, 1200)
  {
    const ox = -2200, oz = 1200;
    const y0 = Math.max(0, terrainHeightAt(ox, oz));
    const ch = c.chunk(ox, oz);
    c.b.add('prop', box(112, 0.8, 92, ox, y0 - 0.72, oz, 0x7c7465), ch);
    c.b.add('g_asph', flat(ox - 55, oz - 45, ox + 55, oz + 45, y0 + 0.08, (px, pz) => [px / 6, pz / 6]), ch);
    c.b.add('f_stone', box(38, 8.4, 14, ox, y0, oz - 24, 0xe8caa0), ch);
    c.b.add('prop', box(18, 4.5, 10, ox - 28, y0, oz + 12, 0xd85a3a), ch);
    c.b.add('propMetal', box(22, 0.6, 12, ox + 22, y0 + 5.2, oz + 14, 0xd8dce0), ch);
    for (const sx of [-8, 8]) c.b.add('propMetal', cyl(0.35, 0.35, 5.2, ox + 22 + sx, y0, oz + 14, 0xc0392b, 8), ch);
    c.world.addBox(ox - 19, ox + 19, oz - 31, oz - 17, y0 + 9, 'motel');
    c.mapRects.push({ x0: ox - 55, z0: oz - 45, x1: ox + 55, z1: oz + 45, c: '#b89460' });
    c.places.oasis = { x: ox, z: oz };
  }

  // 3. North Ridge Observatory & Radio Peak (0, -3400)
  {
    const nx = 0, nz = -3400;
    const y0 = Math.max(0, terrainHeightAt(nx, nz));
    const ch = c.chunk(nx, nz);
    c.b.add('prop', cyl(21.5, 22.5, 1.2, nx, y0 - 0.9, nz, 0x8e949c, 20), ch);
    c.b.add('prop', cyl(18, 20, 10, nx, y0, nz, 0xe6e8ec, 20), ch);
    c.b.add('prop', sph(17, nx, y0 + 10, nz, 0xf2f4f8, 1, 0.85, 1, 16), ch);
    c.b.add('propMetal', box(3, 18, 3, nx + 24, y0 - 0.35, nz - 10, 0x9aa2a8), ch);
    c.world.addCircle(nx, nz, 20, y0 + 20, 'observatory');
    c.mapRects.push({ x0: nx - 30, z0: nz - 30, x1: nx + 30, z1: nz + 30, c: '#c8d0d8' });
    c.places.observatory = { x: nx, z: nz };
  }

  // 4. Outer Highway Rest Stops & Clusters of Trees/Palms across the 10km expanse
  const hubs: [number, number][] = [[-3000, 0], [3000, 0], [0, -3000], [-3000, -3000], [3000, -3000]];
  for (const [hx, hz] of hubs) {
    const ch = c.chunk(hx, hz);
    const y0 = Math.max(0, terrainHeightAt(hx, hz));
    c.b.add('prop', box(25, 0.8, 19, hx + 46, y0 - 0.6, hz - 38, 0x7c8188), ch);
    c.b.add('prop', box(33, 0.8, 23, hx - 52, y0 - 0.6, hz + 40, 0x7c8188), ch);
    c.b.add('f_office', box(24, 14, 18, hx + 46, y0, hz - 38, 0xd8dce0), ch);
    c.b.add('f_industrial', box(32, 10, 22, hx - 52, y0, hz + 40, 0xb8bec2), ch);
    c.world.addBox(hx + 34, hx + 58, hz - 47, hz - 29, y0 + 14);
    c.world.addBox(hx - 68, hx - 36, hz + 29, hz + 51, y0 + 10);
    c.mapRects.push({ x0: hx - 70, z0: hz - 50, x1: hx + 60, z1: hz + 55, c: '#787e88' });
  }

  // Scattered scenic desert palms & northern hillside pines (skip suburbs, airport, gas stations & highways)
  const ap = DECK.AIRPORT;
  for (let i = 0; i < 85; i++) {
    const rx = rng.range(-4200, 4200), rz = rng.range(-4200, 2200);
    if (Math.abs(rx) < 760 && Math.abs(rz) < 760) continue;
    if (isOceanAt(rx, rz)) continue;
    if (isInSuburbanZone(rx, rz, 24)) continue;
    if (nearestRuralGasStation(rx, rz).dist < 78) continue;
    if (rx >= ap.x0 - 40 && rx <= ap.x1 + 40 && rz >= ap.z0 - 40 && rz <= ap.z1 + 60) continue;
    if (Math.abs(rx) < 55 || Math.abs(rz) < 55 || Math.abs(Math.abs(rx) - 3000) < 55 || Math.abs(rz + 3000) < 55) continue;
    const kind = rx < -750 ? 2 : rz < -750 ? 1 : 0;
    addTree(c, rx, rz, kind, rng.range(0.95, 1.45));
  }
}

const SLAB_W = 94;
