// Generates real glTF 2.0 binary (.glb) 3D models into public/models/ for SAN NOVA.
// Models match the San Nova / Leonida aesthetic with sculpted high-detail geometry & PBR materials.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';

interface PrimitiveData {
  geo: THREE.BufferGeometry;
  materialIndex: number;
}

interface NodeDef {
  name: string;
  primitives: PrimitiveData[];
  translation?: [number, number, number];
}

interface MatSpec {
  name: string;
  baseColorFactor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  emissiveFactor?: [number, number, number];
  alphaMode?: 'OPAQUE' | 'BLEND';
  doubleSided?: boolean;
}

/** Converts a BufferGeometry to non-indexed Float32 POSITION + NORMAL + optional UV buffers. */
function normalizeGeo(raw: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = raw.index ? raw.toNonIndexed() : raw.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Merges multiple geometries with POSITION + NORMAL + TEXCOORD_0 into one BufferGeometry. */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const norm = geos.map(normalizeGeo);
  let totalVerts = 0;
  for (const g of norm) totalVerts += g.attributes.position.count;
  const pos = new Float32Array(totalVerts * 3);
  const nrm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  let off = 0;
  let uvOff = 0;
  for (const g of norm) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      pos[off] = px;
      pos[off + 1] = py;
      pos[off + 2] = pz;
      nrm[off] = nx;
      nrm[off + 1] = ny;
      nrm[off + 2] = nz;
      if (u) {
        uv[uvOff] = u.getX(i);
        uv[uvOff + 1] = u.getY(i);
      } else {
        // Clean triplanar box projection fallback when ExtrudeGeometry lacks normalized UVs
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ay >= ax && ay >= az) {
          uv[uvOff] = px * 0.5 + 0.5;
          uv[uvOff + 1] = pz * 0.5 + 0.5;
        } else if (ax >= az) {
          uv[uvOff] = pz * 0.5 + 0.5;
          uv[uvOff + 1] = py * 0.5 + 0.5;
        } else {
          uv[uvOff] = px * 0.5 + 0.5;
          uv[uvOff + 1] = py * 0.5 + 0.5;
        }
      }
      off += 3;
      uvOff += 2;
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

function tx(
  geo: THREE.BufferGeometry,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
): THREE.BufferGeometry {
  const g = normalizeGeo(geo);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  return g;
}

function extrudeProfile(
  pts: [number, number][],
  depth: number,
  bevelSize = 0.04,
  bevelThickness = 0.04,
  bevelSegments = 2,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelSize > 0,
    bevelSize,
    bevelThickness,
    bevelSegments,
    curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  // Rotate so 2D profile (x=length along Z, y=height along Y) maps cleanly to vehicle/building axes
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return normalizeGeo(g);
}

/** Writes a spec-compliant glTF 2.0 binary (.glb) buffer from NodeDefs and MatSpecs. */
function encodeGLB(nodes: NodeDef[], materials: MatSpec[]): Buffer {
  const chunks: Buffer[] = [];
  const bufferViews: any[] = [];
  const accessors: any[] = [];
  const meshes: any[] = [];
  const gltfNodes: any[] = [];
  let byteOffset = 0;

  const pushTypedArray = (arr: Float32Array, target: number) => {
    const raw = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (raw.length % 4)) % 4;
    const buf = pad > 0 ? Buffer.concat([raw, Buffer.alloc(pad)]) : raw;
    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: raw.length,
      target,
    });
    chunks.push(buf);
    byteOffset += buf.length;
    return viewIndex;
  };

  for (const node of nodes) {
    const meshPrimitives: any[] = [];
    for (const prim of node.primitives) {
      const g = normalizeGeo(prim.geo);
      const posAttr = g.attributes.position as THREE.BufferAttribute;
      const nrmAttr = g.attributes.normal as THREE.BufferAttribute;
      const posArr = new Float32Array(posAttr.array);
      const nrmArr = new Float32Array(nrmAttr.array);

      const minP = [Infinity, Infinity, Infinity];
      const maxP = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < posArr.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = posArr[i + k];
          if (v < minP[k]) minP[k] = v;
          if (v > maxP[k]) maxP[k] = v;
        }
      }

      const posView = pushTypedArray(posArr, 34962);
      const posAcc = accessors.length;
      accessors.push({
        bufferView: posView,
        componentType: 5126, // FLOAT
        count: posAttr.count,
        type: 'VEC3',
        min: minP,
        max: maxP,
      });

      const nrmView = pushTypedArray(nrmArr, 34962);
      const nrmAcc = accessors.length;
      accessors.push({
        bufferView: nrmView,
        componentType: 5126,
        count: nrmAttr.count,
        type: 'VEC3',
      });

      const attributes: Record<string, number> = {
        POSITION: posAcc,
        NORMAL: nrmAcc,
      };
      const uvAttr = g.attributes.uv as THREE.BufferAttribute | undefined;
      if (uvAttr) {
        const uvArr = new Float32Array(uvAttr.array);
        const uvView = pushTypedArray(uvArr, 34962);
        const uvAcc = accessors.length;
        accessors.push({
          bufferView: uvView,
          componentType: 5126,
          count: uvAttr.count,
          type: 'VEC2',
        });
        attributes.TEXCOORD_0 = uvAcc;
      }

      meshPrimitives.push({
        attributes,
        material: prim.materialIndex,
        mode: 4, // TRIANGLES
      });
      g.dispose();
    }

    const meshIndex = meshes.length;
    meshes.push({ name: `${node.name}_mesh`, primitives: meshPrimitives });
    const gNode: any = { name: node.name, mesh: meshIndex };
    if (node.translation) gNode.translation = node.translation;
    gltfNodes.push(gNode);
  }

  const binBuffer = Buffer.concat(chunks);
  const gltfMats = materials.map((m) => {
    const out: any = {
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.baseColorFactor,
        metallicFactor: m.metallicFactor,
        roughnessFactor: m.roughnessFactor,
      },
    };
    if (m.emissiveFactor) out.emissiveFactor = m.emissiveFactor;
    if (m.alphaMode && m.alphaMode !== 'OPAQUE') out.alphaMode = m.alphaMode;
    if (m.doubleSided) out.doubleSided = true;
    return out;
  });

  const jsonObj = {
    asset: { version: '2.0', generator: 'SanNova-GLB-Builder' },
    scene: 0,
    scenes: [{ nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes,
    materials: gltfMats,
    bufferViews,
    accessors,
    buffers: [{ byteLength: binBuffer.length }],
  };

  let jsonStr = JSON.stringify(jsonObj);
  while (Buffer.byteLength(jsonStr, 'utf8') % 4 !== 0) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);          // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuffer]);
}

function hexToRgba(hex: number, a = 1): [number, number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b, a];
}

// ========================================================================= CAR MODELS
const CAR_MATS: MatSpec[] = [
  { name: 'paint', baseColorFactor: hexToRgba(0xd92638), metallicFactor: 0.42, roughnessFactor: 0.16 },
  { name: 'paint_secondary', baseColorFactor: hexToRgba(0x161920), metallicFactor: 0.35, roughnessFactor: 0.25 },
  { name: 'glass', baseColorFactor: hexToRgba(0x121d26, 0.72), metallicFactor: 0.15, roughnessFactor: 0.06, alphaMode: 'BLEND' },
  { name: 'chrome', baseColorFactor: hexToRgba(0xe6ecf2), metallicFactor: 0.92, roughnessFactor: 0.14 },
  { name: 'trim', baseColorFactor: hexToRgba(0x181b20), metallicFactor: 0.15, roughnessFactor: 0.72 },
  { name: 'interior', baseColorFactor: hexToRgba(0x282423), metallicFactor: 0.05, roughnessFactor: 0.85 },
  { name: 'headlight', baseColorFactor: hexToRgba(0xfff8e6), metallicFactor: 0.1, roughnessFactor: 0.1, emissiveFactor: [0.85, 0.82, 0.72] },
  { name: 'taillight', baseColorFactor: hexToRgba(0xdd1818), metallicFactor: 0.1, roughnessFactor: 0.12, emissiveFactor: [0.85, 0.06, 0.05] },
  { name: 'siren_red', baseColorFactor: hexToRgba(0xff1e24), metallicFactor: 0.1, roughnessFactor: 0.1, emissiveFactor: [0.95, 0.08, 0.08] },
  { name: 'siren_blue', baseColorFactor: hexToRgba(0x1e6cff), metallicFactor: 0.1, roughnessFactor: 0.1, emissiveFactor: [0.08, 0.35, 0.98] },
];

function buildCarGlb(kind: 'sports' | 'sedan' | 'suv' | 'police'): Buffer {
  const paintGeos: THREE.BufferGeometry[] = [];
  const secGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const chromeGeos: THREE.BufferGeometry[] = [];
  const trimGeos: THREE.BufferGeometry[] = [];
  const intGeos: THREE.BufferGeometry[] = [];
  const headGeos: THREE.BufferGeometry[] = [];
  const tailGeos: THREE.BufferGeometry[] = [];
  const sirenR: THREE.BufferGeometry[] = [];
  const sirenB: THREE.BufferGeometry[] = [];

  const isSports = kind === 'sports';
  const isSuv = kind === 'suv';
  const isPolice = kind === 'police';
  const W = isSports ? 2.02 : isSuv ? 2.12 : 1.94;
  const L = isSports ? 4.42 : isSuv ? 4.78 : isPolice ? 4.72 : 4.55;
  const hL = L / 2;
  const hW = W / 2;

  // Sculpted extruded side silhouette for sleek aerodynamic body
  const bodyProfile: [number, number][] = isSports
    ? [[-hL, 0.34], [-hL + 0.06, 0.86], [-hL + 0.68, 0.96], [-0.45, 0.98], [0.75, 0.92], [hL - 0.38, 0.72], [hL, 0.56], [hL - 0.05, 0.28], [-hL + 0.08, 0.28]]
    : isSuv
      ? [[-hL, 0.42], [-hL + 0.05, 1.12], [0.88, 1.14], [hL - 0.18, 1.04], [hL, 0.88], [hL - 0.04, 0.4], [-hL + 0.06, 0.4]]
      : [[-hL, 0.36], [-hL + 0.06, 0.96], [-hL + 0.72, 0.98], [0.82, 0.98], [hL - 0.28, 0.86], [hL, 0.72], [hL - 0.04, 0.34], [-hL + 0.08, 0.34]];

  // Note: extrudeProfile maps profile X -> -Z, so negate X to keep +Z as front
  const flippedBody = bodyProfile.map(([z, y]): [number, number] => [-z, y]);
  paintGeos.push(extrudeProfile(flippedBody, W - 0.12, 0.05, 0.05, 2));

  // Sculpted wheel arch fender flares + shoulder creases on both sides
  const wf = isSports ? 1.32 : isSuv ? 1.48 : 1.38;
  const wr = isSports ? -1.32 : isSuv ? -1.44 : -1.38;
  for (const s of [-1, 1]) {
    // Side rocker skirts & sculpted door crease
    trimGeos.push(tx(new THREE.BoxGeometry(0.11, 0.11, L * 0.52), s * (hW - 0.02), isSuv ? 0.4 : 0.31, 0));
    paintGeos.push(tx(new THREE.BoxGeometry(0.08, 0.22, L * 0.78), s * (hW - 0.02), isSuv ? 0.95 : 0.78, 0));
    // Wheel arch flares
    for (const wz of [wf, wr]) {
      const arch = new THREE.TorusGeometry(isSuv ? 0.46 : 0.41, 0.055, 6, 12, Math.PI);
      trimGeos.push(tx(arch, s * (hW - 0.01), isSuv ? 0.46 : 0.39, wz, 0, Math.PI / 2, 0));
    }
    // Side mirrors (stalk + housing)
    trimGeos.push(tx(new THREE.BoxGeometry(0.14, 0.05, 0.07), s * (hW + 0.04), isSuv ? 1.18 : 0.99, 0.56));
    paintGeos.push(tx(new THREE.BoxGeometry(0.15, 0.1, 0.18), s * (hW + 0.11), isSuv ? 1.2 : 1.01, 0.54));
    // Chrome door handles
    chromeGeos.push(tx(new THREE.BoxGeometry(0.04, 0.035, 0.16), s * (hW + 0.02), isSuv ? 1.02 : 0.85, 0.1));
    if (!isSports) chromeGeos.push(tx(new THREE.BoxGeometry(0.04, 0.035, 0.16), s * (hW + 0.02), isSuv ? 1.02 : 0.85, -0.78));
    // Side aero vents for sports car
    if (isSports) {
      trimGeos.push(tx(new THREE.BoxGeometry(0.06, 0.24, 0.42), s * (hW - 0.01), 0.66, -0.58));
    }
  }

  // Sculpted hood power dome / air intake
  if (isSports) {
    secGeos.push(tx(new THREE.BoxGeometry(0.68, 0.06, 0.92), 0, 0.86, 1.22, 0.14, 0, 0));
    trimGeos.push(tx(new THREE.BoxGeometry(0.54, 0.05, 0.18), 0, 0.89, 1.38));
  } else {
    paintGeos.push(tx(new THREE.BoxGeometry(W * 0.58, 0.06, 1.18), 0, isSuv ? 1.15 : 0.98, 1.38, 0.06, 0, 0));
  }

  // Cabin greenhouse (tapered roof + sloped windshield + pillars)
  const cabTopY = isSports ? 1.24 : isSuv ? 1.82 : 1.46;
  const cabBaseY = isSports ? 0.9 : isSuv ? 1.12 : 0.96;
  const cabF = isSports ? 0.64 : isSuv ? 0.82 : 0.78;
  const cabR = isSports ? -1.06 : isSuv ? -1.82 : -1.16;
  const roofF = isSports ? 0.12 : isSuv ? 0.36 : 0.28;
  const roofR = isSports ? -0.68 : isSuv ? -1.62 : -0.78;

  // Roof shell
  const roofLen = roofF - roofR;
  const roofZ = (roofF + roofR) * 0.5;
  const roofGeo = tx(new THREE.BoxGeometry(W * 0.78, 0.07, roofLen), 0, cabTopY, roofZ);
  if (isPolice) paintGeos.push(roofGeo);
  else if (isSports) secGeos.push(roofGeo);
  else paintGeos.push(roofGeo);

  // Police white/black doors & trunk contrast + roof rails for SUV
  if (isPolice) {
    secGeos.push(tx(new THREE.BoxGeometry(W + 0.02, 0.56, 1.65), 0, 0.68, -0.05));
  }
  if (isSuv) {
    for (const s of [-1, 1]) {
      chromeGeos.push(tx(new THREE.BoxGeometry(0.05, 0.06, roofLen * 0.92), s * (W * 0.35), cabTopY + 0.05, roofZ));
    }
  }

  // A, B, C pillars (angled struts connecting beltline to roof)
  const makePillar = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.045) => {
    const a = new THREE.Vector3(x0, y0, z0);
    const b = new THREE.Vector3(x1, y1, z1);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const g = normalizeGeo(new THREE.BoxGeometry(r * 1.4, len, r * 1.4));
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    return g;
  };
  for (const s of [-1, 1]) {
    trimGeos.push(makePillar(s * (hW * 0.88), cabBaseY, cabF, s * (W * 0.38), cabTopY, roofF, 0.045));
    trimGeos.push(makePillar(s * (hW * 0.88), cabBaseY, (cabF + cabR) * 0.48, s * (W * 0.38), cabTopY, (roofF + roofR) * 0.48, 0.04));
    paintGeos.push(makePillar(s * (hW * 0.86), cabBaseY, cabR, s * (W * 0.38), cabTopY, roofR, 0.06));
  }

  // Sloped windshield, rear glass, and side windows
  const wsLen = Math.hypot(cabF - roofF, cabTopY - cabBaseY);
  const wsAng = Math.atan2(cabF - roofF, cabTopY - cabBaseY);
  glassGeos.push(tx(new THREE.BoxGeometry(W * 0.78, wsLen * 0.96, 0.04), 0, (cabBaseY + cabTopY) * 0.5, (cabF + roofF) * 0.5, -wsAng, 0, 0));
  const rwLen = Math.hypot(roofR - cabR, cabTopY - cabBaseY);
  const rwAng = Math.atan2(roofR - cabR, cabTopY - cabBaseY);
  glassGeos.push(tx(new THREE.BoxGeometry(W * 0.76, rwLen * 0.96, 0.04), 0, (cabBaseY + cabTopY) * 0.5, (cabR + roofR) * 0.5, rwAng, 0, 0));
  for (const s of [-1, 1]) {
    glassGeos.push(tx(new THREE.BoxGeometry(0.04, (cabTopY - cabBaseY) * 0.88, (cabF - cabR) * 0.76), s * (hW * 0.81), (cabBaseY + cabTopY) * 0.5, (cabF + cabR) * 0.5, 0, 0, s * 0.22));
  }

  // Detailed Interior Cabin (2 front seats, headrests, dashboard, steering wheel, center console)
  for (const s of [-0.42, 0.42]) {
    intGeos.push(tx(new THREE.BoxGeometry(0.46, 0.14, 0.48), s, cabBaseY - 0.28, -0.05));
    intGeos.push(tx(new THREE.BoxGeometry(0.44, 0.54, 0.12), s, cabBaseY - 0.02, -0.28, -0.18, 0, 0));
    intGeos.push(tx(new THREE.BoxGeometry(0.22, 0.16, 0.1), s, cabBaseY + 0.28, -0.34));
  }
  // Dashboard + center console + steering wheel
  intGeos.push(tx(new THREE.BoxGeometry(W * 0.76, 0.22, 0.38), 0, cabBaseY - 0.08, cabF - 0.14));
  intGeos.push(tx(new THREE.BoxGeometry(0.24, 0.26, 0.95), 0, cabBaseY - 0.24, 0.08));
  trimGeos.push(tx(new THREE.TorusGeometry(0.16, 0.022, 6, 14), -0.42, cabBaseY + 0.02, cabF - 0.36, 0.35, 0, 0));

  // Front fascia: sculpted grille, chrome surround, front splitter, recessed dual headlamps
  trimGeos.push(tx(new THREE.BoxGeometry(W * 0.56, isSuv ? 0.34 : 0.22, 0.08), 0, isSuv ? 0.76 : 0.52, hL + 0.01));
  chromeGeos.push(tx(new THREE.BoxGeometry(W * 0.58, 0.035, 0.09), 0, isSuv ? 0.92 : 0.63, hL + 0.015));
  chromeGeos.push(tx(new THREE.BoxGeometry(W * 0.58, 0.035, 0.09), 0, isSuv ? 0.6 : 0.41, hL + 0.015));
  trimGeos.push(tx(new THREE.BoxGeometry(W * 0.94, 0.08, 0.26), 0, isSuv ? 0.38 : 0.28, hL - 0.02));
  for (const s of [-1, 1]) {
    headGeos.push(tx(new THREE.BoxGeometry(0.36, isSuv ? 0.15 : 0.11, 0.08), s * (hW - 0.28), isSuv ? 0.86 : 0.64, hL - 0.02, 0, s * -0.14, 0));
    // Rear tail lights
    tailGeos.push(tx(new THREE.BoxGeometry(isSports ? 0.44 : 0.36, 0.11, 0.08), s * (hW - 0.28), isSuv ? 0.96 : 0.76, -hL + 0.01, 0, s * 0.1, 0));
  }
  if (isSports) {
    // Full-width LED tailbar + carbon rear wing + quad chrome exhausts + rear diffuser
    tailGeos.push(tx(new THREE.BoxGeometry(W * 0.84, 0.045, 0.06), 0, 0.78, -hL - 0.01));
    secGeos.push(tx(new THREE.BoxGeometry(W * 0.9, 0.055, 0.28), 0, 1.12, -hL + 0.18, -0.12, 0, 0));
    for (const s of [-0.55, 0.55]) trimGeos.push(tx(new THREE.BoxGeometry(0.06, 0.22, 0.18), s, 0.98, -hL + 0.2));
    for (const ex of [-0.54, -0.4, 0.4, 0.54]) chromeGeos.push(tx(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), ex, 0.34, -hL - 0.02, Math.PI / 2, 0, 0));
  } else {
    for (const ex of [-0.52, 0.52]) chromeGeos.push(tx(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), ex, isSuv ? 0.42 : 0.35, -hL - 0.02, Math.PI / 2, 0, 0));
  }
  // Rear diffuser + bumper trim
  trimGeos.push(tx(new THREE.BoxGeometry(W * 0.86, 0.16, 0.14), 0, isSuv ? 0.42 : 0.34, -hL + 0.02));

  // Police interceptor push-bar, lightbar, and whip antennas
  if (isPolice) {
    trimGeos.push(tx(new THREE.BoxGeometry(1.16, 0.08, 0.09), 0, 0.76, hL + 0.14));
    trimGeos.push(tx(new THREE.BoxGeometry(1.16, 0.08, 0.09), 0, 0.48, hL + 0.14));
    for (const s of [-0.42, 0.42]) trimGeos.push(tx(new THREE.BoxGeometry(0.08, 0.54, 0.16), s, 0.62, hL + 0.1));
    // Roof LED lightbar
    trimGeos.push(tx(new THREE.BoxGeometry(1.24, 0.07, 0.26), 0, cabTopY + 0.06, roofZ + 0.12));
    sirenR.push(tx(new THREE.BoxGeometry(0.5, 0.11, 0.22), -0.34, cabTopY + 0.13, roofZ + 0.12));
    sirenB.push(tx(new THREE.BoxGeometry(0.5, 0.11, 0.22), 0.34, cabTopY + 0.13, roofZ + 0.12));
    chromeGeos.push(tx(new THREE.CylinderGeometry(0.012, 0.016, 0.72, 6), 0.52, 1.32, -hL + 0.42));
  }

  const prims: PrimitiveData[] = [];
  if (paintGeos.length) prims.push({ geo: mergeSimple(paintGeos), materialIndex: 0 });
  if (secGeos.length) prims.push({ geo: mergeSimple(secGeos), materialIndex: 1 });
  if (glassGeos.length) prims.push({ geo: mergeSimple(glassGeos), materialIndex: 2 });
  if (chromeGeos.length) prims.push({ geo: mergeSimple(chromeGeos), materialIndex: 3 });
  if (trimGeos.length) prims.push({ geo: mergeSimple(trimGeos), materialIndex: 4 });
  if (intGeos.length) prims.push({ geo: mergeSimple(intGeos), materialIndex: 5 });
  if (headGeos.length) prims.push({ geo: mergeSimple(headGeos), materialIndex: 6 });
  if (tailGeos.length) prims.push({ geo: mergeSimple(tailGeos), materialIndex: 7 });
  if (sirenR.length) prims.push({ geo: mergeSimple(sirenR), materialIndex: 8 });
  if (sirenB.length) prims.push({ geo: mergeSimple(sirenB), materialIndex: 9 });

  return encodeGLB([{ name: `car_${kind}`, primitives: prims }], CAR_MATS);
}

// ========================================================================= BUILDING LANDMARK MODELS
const BLDG_MATS: MatSpec[] = [
  { name: 'stucco_cream', baseColorFactor: hexToRgba(0xf5e8d4), metallicFactor: 0.04, roughnessFactor: 0.78 },
  { name: 'accent_coral', baseColorFactor: hexToRgba(0xff7d6b), metallicFactor: 0.08, roughnessFactor: 0.64 },
  { name: 'glass_curtain', baseColorFactor: hexToRgba(0x4b7f9e), metallicFactor: 0.72, roughnessFactor: 0.12 },
  { name: 'steel_dark', baseColorFactor: hexToRgba(0x28303b), metallicFactor: 0.78, roughnessFactor: 0.28 },
  { name: 'neon_pink', baseColorFactor: hexToRgba(0xff4db8), metallicFactor: 0.05, roughnessFactor: 0.2, emissiveFactor: [0.95, 0.2, 0.65] },
  { name: 'neon_cyan', baseColorFactor: hexToRgba(0x22e6f5), metallicFactor: 0.05, roughnessFactor: 0.2, emissiveFactor: [0.1, 0.85, 0.95] },
  { name: 'terracotta', baseColorFactor: hexToRgba(0xc45a3a), metallicFactor: 0.05, roughnessFactor: 0.82 },
  { name: 'gold_brass', baseColorFactor: hexToRgba(0xd9a84a), metallicFactor: 0.86, roughnessFactor: 0.22 },
  { name: 'concrete', baseColorFactor: hexToRgba(0x889098), metallicFactor: 0.05, roughnessFactor: 0.88 },
];

function buildArtDecoGlb(): Buffer {
  const stucco: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const neonP: THREE.BufferGeometry[] = [];
  const neonC: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];

  // Main stepped Art Deco hotel massing (width 20, depth 16, height 28)
  stucco.push(tx(new THREE.BoxGeometry(20, 22, 16), 0, 11, 0));
  // Stepped ziggurat crown
  stucco.push(tx(new THREE.BoxGeometry(14, 4.2, 12), 0, 24.1, 0));
  stucco.push(tx(new THREE.BoxGeometry(8, 3.6, 8), 0, 28, 0));
  // Central vertical fluted tower fin + rooftop spire
  accent.push(tx(new THREE.BoxGeometry(3.2, 31, 2.2), 0, 15.5, 7.6));
  brass.push(tx(new THREE.CylinderGeometry(0.12, 0.4, 7.5, 8), 0, 33.5, 0));
  // Fluted vertical pilasters across front & back
  for (const x of [-8.8, -5.8, -2.8, 2.8, 5.8, 8.8]) {
    stucco.push(tx(new THREE.BoxGeometry(0.7, 22.4, 0.65), x, 11.2, 8.1));
    stucco.push(tx(new THREE.BoxGeometry(0.7, 22.4, 0.65), x, 11.2, -8.1));
  }
  // Horizontal Art Deco eyebrow ledges every floor + recessed glazed windows
  for (let f = 1; f <= 5; f++) {
    const y = f * 3.8 + 0.8;
    accent.push(tx(new THREE.BoxGeometry(20.9, 0.34, 16.9), 0, y + 1.25, 0));
    glass.push(tx(new THREE.BoxGeometry(17.4, 1.9, 16.25), 0, y, 0));
  }
  // Curved marquee entrance canopy & brass lobby doors
  stucco.push(tx(new THREE.BoxGeometry(11.5, 0.55, 3.6), 0, 4.1, 9.6));
  neonP.push(tx(new THREE.BoxGeometry(11.7, 0.16, 0.16), 0, 4.35, 11.4));
  neonC.push(tx(new THREE.BoxGeometry(11.7, 0.16, 0.16), 0, 3.9, 11.4));
  neonP.push(tx(new THREE.BoxGeometry(0.24, 24, 0.24), -1.7, 16, 8.75));
  neonP.push(tx(new THREE.BoxGeometry(0.24, 24, 0.24), 1.7, 16, 8.75));
  neonC.push(tx(new THREE.BoxGeometry(14.3, 0.2, 12.3), 0, 26.1, 0));
  // Lobby brass revolving door & columns
  for (const x of [-4.6, 4.6]) brass.push(tx(new THREE.CylinderGeometry(0.32, 0.36, 4.0, 10), x, 2.0, 10.8));
  glass.push(tx(new THREE.BoxGeometry(7.2, 3.6, 0.4), 0, 1.8, 8.1));
  brass.push(tx(new THREE.CylinderGeometry(1.3, 1.3, 3.2, 12), 0, 1.6, 8.4));
  // Rooftop HVAC units
  steel.push(tx(new THREE.BoxGeometry(3.2, 1.6, 2.4), -5.2, 22.8, -3.5));
  steel.push(tx(new THREE.BoxGeometry(2.6, 1.4, 2.6), 5.4, 22.7, -3.2));

  return encodeGLB([{
    name: 'building_artdeco',
    primitives: [
      { geo: mergeSimple(stucco), materialIndex: 0 },
      { geo: mergeSimple(accent), materialIndex: 1 },
      { geo: mergeSimple(glass), materialIndex: 2 },
      { geo: mergeSimple(steel), materialIndex: 3 },
      { geo: mergeSimple(neonP), materialIndex: 4 },
      { geo: mergeSimple(neonC), materialIndex: 5 },
      { geo: mergeSimple(brass), materialIndex: 7 },
    ],
  }], BLDG_MATS);
}

function buildTowerGlb(): Buffer {
  const glass: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const concrete: THREE.BufferGeometry[] = [];
  const neonC: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];

  // Podium plaza base
  concrete.push(tx(new THREE.BoxGeometry(24, 7, 24), 0, 3.5, 0));
  glass.push(tx(new THREE.BoxGeometry(24.3, 5.2, 20), 0, 3.0, 0));
  glass.push(tx(new THREE.BoxGeometry(20, 5.2, 24.3), 0, 3.0, 0));

  // Beveled chamfered octagonal skyscraper shaft (height 68m)
  glass.push(tx(new THREE.CylinderGeometry(11.6, 12.6, 60, 8), 0, 37, 0, 0, Math.PI / 8, 0));
  // Horizontal structural steel spandrel rings & vertical corner mullions
  for (let y = 10; y <= 66; y += 4.2) {
    steel.push(tx(new THREE.CylinderGeometry(12.2 - (y - 10) * 0.016, 12.2 - (y - 10) * 0.016, 0.42, 8), 0, y, 0, 0, Math.PI / 8, 0));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    steel.push(tx(new THREE.BoxGeometry(0.55, 61, 0.55), Math.cos(a) * 11.7, 37.5, Math.sin(a) * 11.7, 0, -a, 0));
  }
  // Architectural crown fins + glowing cyan sky-line halo
  steel.push(tx(new THREE.BoxGeometry(18, 8, 2.2), 0, 71, 0));
  steel.push(tx(new THREE.BoxGeometry(2.2, 8, 18), 0, 71, 0));
  neonC.push(tx(new THREE.CylinderGeometry(11.2, 11.2, 0.4, 8), 0, 67.2, 0, 0, Math.PI / 8, 0));
  // Rooftop helipad ring + twin spires
  concrete.push(tx(new THREE.CylinderGeometry(8.2, 8.5, 0.6, 16), 0, 67.3, 0));
  brass.push(tx(new THREE.TorusGeometry(6.2, 0.25, 6, 20), 0, 67.7, 0, Math.PI / 2, 0, 0));
  steel.push(tx(new THREE.CylinderGeometry(0.14, 0.45, 16, 8), -4.5, 76, 0));
  steel.push(tx(new THREE.CylinderGeometry(0.14, 0.45, 13, 8), 4.5, 74.5, 0));

  return encodeGLB([{
    name: 'building_tower',
    primitives: [
      { geo: mergeSimple(glass), materialIndex: 2 },
      { geo: mergeSimple(steel), materialIndex: 3 },
      { geo: mergeSimple(neonC), materialIndex: 5 },
      { geo: mergeSimple(brass), materialIndex: 7 },
      { geo: mergeSimple(concrete), materialIndex: 8 },
    ],
  }], BLDG_MATS);
}

function buildHavanaGlb(): Buffer {
  const stucco: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const terra: THREE.BufferGeometry[] = [];

  // Warm Little Havana 3-story colonnade building (18 x 14 x 13.5)
  accent.push(tx(new THREE.BoxGeometry(18, 12.6, 14), 0, 6.3, 0));
  // Ground-floor arched colonnade porch
  for (const x of [-7.8, -3.9, 0, 3.9, 7.8]) {
    stucco.push(tx(new THREE.BoxGeometry(0.75, 4.2, 0.75), x, 2.1, 8.6));
  }
  stucco.push(tx(new THREE.BoxGeometry(18.2, 0.65, 2.6), 0, 4.3, 7.8));
  // Wrought-iron balconies & French doors on floors 2 & 3
  for (const y of [4.6, 8.6]) {
    stucco.push(tx(new THREE.BoxGeometry(17.6, 0.28, 1.5), 0, y, 7.7));
    steel.push(tx(new THREE.BoxGeometry(17.4, 0.08, 0.08), 0, y + 1.05, 8.4));
    for (let x = -8.4; x <= 8.4; x += 0.9) {
      steel.push(tx(new THREE.BoxGeometry(0.06, 1.0, 0.06), x, y + 0.55, 8.4));
    }
    for (const wx of [-6, -2, 2, 6]) {
      glass.push(tx(new THREE.BoxGeometry(1.7, 2.4, 0.25), wx, y + 1.4, 7.05));
    }
  }
  // Terracotta sloped Spanish tile cornice roof
  terra.push(tx(new THREE.BoxGeometry(19.2, 0.8, 15.2), 0, 12.9, 0));
  terra.push(tx(new THREE.ConeGeometry(13.2, 2.8, 4), 0, 14.7, 0, 0, Math.PI / 4, 0));
  // Striped café awning over front sidewalk
  terra.push(tx(new THREE.BoxGeometry(14.5, 0.16, 2.4), 0, 3.6, 8.9, 0.25, 0, 0));

  return encodeGLB([{
    name: 'building_havana',
    primitives: [
      { geo: mergeSimple(stucco), materialIndex: 0 },
      { geo: mergeSimple(accent), materialIndex: 1 },
      { geo: mergeSimple(glass), materialIndex: 2 },
      { geo: mergeSimple(steel), materialIndex: 3 },
      { geo: mergeSimple(terra), materialIndex: 6 },
    ],
  }], BLDG_MATS);
}

function buildWynwoodGlb(): Buffer {
  const concrete: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const neonP: THREE.BufferGeometry[] = [];
  const neonC: THREE.BufferGeometry[] = [];

  // Industrial mural gallery hall (22 x 16 x 9)
  concrete.push(tx(new THREE.BoxGeometry(22, 8.6, 16), 0, 4.3, 0));
  // Sawtooth skylight roof bays
  for (let i = -2; i <= 2; i++) {
    const x = i * 4.2;
    steel.push(tx(new THREE.BoxGeometry(3.8, 1.8, 15.6), x, 9.5, 0, 0, 0, 0.38));
    glass.push(tx(new THREE.BoxGeometry(0.18, 2.1, 15.2), x + 1.8, 9.6, 0));
  }
  // Exposed exterior steel I-beam ribs
  for (const x of [-10.8, -5.4, 0, 5.4, 10.8]) {
    steel.push(tx(new THREE.BoxGeometry(0.45, 9.0, 0.45), x, 4.5, 8.15));
  }
  // Bold geometric mural relief blocks on facade
  accent.push(tx(new THREE.BoxGeometry(5.2, 4.6, 0.28), -6.5, 5.2, 8.08));
  neonC.push(tx(new THREE.BoxGeometry(4.4, 2.8, 0.34), -4.2, 3.8, 8.14));
  neonP.push(tx(new THREE.BoxGeometry(5.6, 3.4, 0.32), 6.2, 5.6, 8.12));
  // Cantilevered glass studio entrance + roll-up gallery door
  steel.push(tx(new THREE.BoxGeometry(7.2, 0.35, 3.0), 0, 4.4, 9.4));
  glass.push(tx(new THREE.BoxGeometry(6.2, 4.0, 0.3), 0, 2.0, 8.12));

  return encodeGLB([{
    name: 'building_wynwood',
    primitives: [
      { geo: mergeSimple(accent), materialIndex: 1 },
      { geo: mergeSimple(glass), materialIndex: 2 },
      { geo: mergeSimple(steel), materialIndex: 3 },
      { geo: mergeSimple(neonP), materialIndex: 4 },
      { geo: mergeSimple(neonC), materialIndex: 5 },
      { geo: mergeSimple(concrete), materialIndex: 8 },
    ],
  }], BLDG_MATS);
}

// ========================================================================= HUMAN ANATOMICAL PARTS GLB
const HUMAN_MATS: MatSpec[] = [
  { name: 'skin', baseColorFactor: hexToRgba(0xd9a07c), metallicFactor: 0.02, roughnessFactor: 0.62 },
  { name: 'shirt', baseColorFactor: hexToRgba(0x2e4a7d), metallicFactor: 0.04, roughnessFactor: 0.78 },
  { name: 'pants', baseColorFactor: hexToRgba(0x262e3d), metallicFactor: 0.04, roughnessFactor: 0.84 },
  { name: 'shoe', baseColorFactor: hexToRgba(0x202226), metallicFactor: 0.08, roughnessFactor: 0.52 },
  { name: 'sole', baseColorFactor: hexToRgba(0xebeef2), metallicFactor: 0.02, roughnessFactor: 0.72 },
  { name: 'accent', baseColorFactor: hexToRgba(0x16181d), metallicFactor: 0.45, roughnessFactor: 0.35 },
];

function buildHumanBaseGlb(): Buffer {
  // Sculpted anatomical head (cranium + jawline + nose bridge + ears + brow ridge)
  const headGeos: THREE.BufferGeometry[] = [
    tx(new THREE.SphereGeometry(0.118, 16, 12), 0, 0.135, -0.005, 0, 0, 0, 0.94, 1.12, 1.02), // cranium
    tx(new THREE.BoxGeometry(0.145, 0.095, 0.14), 0, 0.068, 0.015), // jaw
    tx(new THREE.ConeGeometry(0.024, 0.056, 6), 0, 0.11, 0.118, Math.PI * 0.42, 0, 0), // nose
    tx(new THREE.BoxGeometry(0.16, 0.024, 0.04), 0, 0.158, 0.096), // brow
    tx(new THREE.SphereGeometry(0.026, 8, 6), -0.112, 0.115, -0.005, 0, 0, 0, 0.5, 1.25, 0.85), // ear L
    tx(new THREE.SphereGeometry(0.026, 8, 6), 0.112, 0.115, -0.005, 0, 0, 0, 0.5, 1.25, 0.85),  // ear R
    tx(new THREE.CylinderGeometry(0.052, 0.06, 0.08, 10), 0, 0.0, 0), // neck
  ];

  // Sculpted athletic torso (sleek contoured chest, natural shoulders, collar, neck & belt)
  const torsoShirt: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.156, 0.128, 0.45, 14), 0, 0.27, 0, 0, 0, 0, 1.15, 1.0, 0.68), // contoured ribcage/chest
    tx(new THREE.SphereGeometry(0.072, 10, 8), -0.174, 0.468, 0, 0, 0, 0, 1.05, 0.78, 0.85), // seamless shoulder bridge L
    tx(new THREE.SphereGeometry(0.072, 10, 8), 0.174, 0.468, 0, 0, 0, 0, 1.05, 0.78, 0.85),  // seamless shoulder bridge R
    tx(new THREE.CylinderGeometry(0.062, 0.078, 0.06, 12), 0, 0.51, 0.005), // collar
    tx(new THREE.CylinderGeometry(0.048, 0.054, 0.08, 10), 0, 0.555, 0), // neck transition
    tx(new THREE.BoxGeometry(0.036, 0.39, 0.018), -0.044, 0.27, 0.098, 0, 0, 0.05), // left lapel
    tx(new THREE.BoxGeometry(0.036, 0.39, 0.018), 0.044, 0.27, 0.098, 0, 0, -0.05), // right lapel
  ];
  const torsoAccent: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.134, 0.136, 0.044, 14), 0, 0.045, 0, 0, 0, 0, 1.14, 1.0, 0.69), // leather belt
    tx(new THREE.BoxGeometry(0.052, 0.048, 0.022), 0, 0.045, 0.094), // belt buckle
  ];

  // Sculpted pelvis/hips
  const pelvisPants: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.136, 0.124, 0.15, 14), 0, -0.035, 0, 0, 0, 0, 1.14, 1.0, 0.7),
  ];

  // Sculpted upper arm (sleeve/bicep) + smooth deltoid cap
  const upperArmShirt: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.053, 0.042, 0.28, 12), 0, -0.145, 0),
    tx(new THREE.SphereGeometry(0.056, 10, 8), 0, 0.0, 0),
  ];

  // Sculpted forearm + elbow joint
  const foreArmSkin: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.041, 0.031, 0.26, 12), 0, -0.13, 0),
    tx(new THREE.SphereGeometry(0.04, 8, 6), 0, 0, 0),
  ];

  // Articulated palm + thumb + fingers
  const handSkin: THREE.BufferGeometry[] = [
    tx(new THREE.BoxGeometry(0.048, 0.068, 0.026), 0, -0.038, 0),
    tx(new THREE.BoxGeometry(0.044, 0.048, 0.02), 0, -0.09, 0.008, 0.18, 0, 0),
    tx(new THREE.BoxGeometry(0.018, 0.038, 0.018), 0.03, -0.042, 0.018, 0, 0, -0.42),
  ];

  // Sculpted thigh + knee
  const thighPants: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.072, 0.056, 0.41, 12), 0, -0.205, 0),
    tx(new THREE.SphereGeometry(0.056, 8, 6), 0, -0.41, 0.008),
  ];

  // Sculpted shin/calf
  const shinPants: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.056, 0.041, 0.39, 12), 0, -0.195, 0),
  ];

  // Sleek athletic sneaker (upper + contoured toe cap + crisp rubber sole)
  const shoeUpper: THREE.BufferGeometry[] = [
    tx(new THREE.BoxGeometry(0.088, 0.068, 0.195), 0, -0.022, 0.038),
    tx(new THREE.SphereGeometry(0.046, 10, 8), 0, -0.028, 0.125, 0, 0, 0, 0.92, 0.68, 1.05),
  ];
  const shoeSole: THREE.BufferGeometry[] = [
    tx(new THREE.BoxGeometry(0.094, 0.026, 0.228), 0, -0.062, 0.046),
  ];

  return encodeGLB([
    { name: 'HeadMesh', primitives: [{ geo: mergeSimple(headGeos), materialIndex: 0 }] },
    {
      name: 'TorsoMesh',
      primitives: [
        { geo: mergeSimple(torsoShirt), materialIndex: 1 },
        { geo: mergeSimple(torsoAccent), materialIndex: 5 },
      ],
    },
    { name: 'PelvisMesh', primitives: [{ geo: mergeSimple(pelvisPants), materialIndex: 2 }] },
    { name: 'UpperArmMesh', primitives: [{ geo: mergeSimple(upperArmShirt), materialIndex: 1 }] },
    { name: 'ForeArmMesh', primitives: [{ geo: mergeSimple(foreArmSkin), materialIndex: 0 }] },
    { name: 'HandMesh', primitives: [{ geo: mergeSimple(handSkin), materialIndex: 0 }] },
    { name: 'ThighMesh', primitives: [{ geo: mergeSimple(thighPants), materialIndex: 2 }] },
    { name: 'ShinMesh', primitives: [{ geo: mergeSimple(shinPants), materialIndex: 2 }] },
    {
      name: 'ShoeMesh',
      primitives: [
        { geo: mergeSimple(shoeUpper), materialIndex: 3 },
        { geo: mergeSimple(shoeSole), materialIndex: 4 },
      ],
    },
  ], HUMAN_MATS);
}

// ========================================================================= COMPANION GTA-6 WORLD .GLB PACK
const PROP_PACK_MATS: MatSpec[] = [
  { name: 'rubber', baseColorFactor: hexToRgba(0x16181c), metallicFactor: 0.08, roughnessFactor: 0.78 },
  { name: 'alloy', baseColorFactor: hexToRgba(0xd4dce6), metallicFactor: 0.92, roughnessFactor: 0.16 },
  { name: 'caliper_red', baseColorFactor: hexToRgba(0xd92626), metallicFactor: 0.55, roughnessFactor: 0.24 },
  { name: 'wood', baseColorFactor: hexToRgba(0x9d6d3b), metallicFactor: 0.04, roughnessFactor: 0.84 },
  { name: 'steel', baseColorFactor: hexToRgba(0x3a4048), metallicFactor: 0.78, roughnessFactor: 0.34 },
  { name: 'drum_blue', baseColorFactor: hexToRgba(0x286299), metallicFactor: 0.48, roughnessFactor: 0.42 },
  { name: 'bin_green', baseColorFactor: hexToRgba(0x2f5e44), metallicFactor: 0.32, roughnessFactor: 0.56 },
  { name: 'bark', baseColorFactor: hexToRgba(0x6e533b), metallicFactor: 0.02, roughnessFactor: 0.92 },
  { name: 'frond', baseColorFactor: hexToRgba(0x2d8a3e), metallicFactor: 0.04, roughnessFactor: 0.62, doubleSided: true },
  { name: 'lamp_emit', baseColorFactor: hexToRgba(0xfff4d4), metallicFactor: 0.1, roughnessFactor: 0.12, emissiveFactor: [1.0, 0.88, 0.6] },
];

function buildCarWheelGlb(): Buffer {
  // Normalized unit wheel: radius 0.35m, width 0.26m, centered on (0,0,0), rolling axis X
  const tire: THREE.BufferGeometry[] = [
    tx(new THREE.TorusGeometry(0.285, 0.072, 12, 24), 0, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1.45),
    tx(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 24), 0, 0, 0, 0, 0, Math.PI / 2),
  ];
  const alloy: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.225, 0.225, 0.21, 22), 0, 0, 0, 0, 0, Math.PI / 2),
    tx(new THREE.CylinderGeometry(0.055, 0.055, 0.255, 12), 0, 0, 0, 0, 0, Math.PI / 2),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    for (const split of [-0.1, 0.1]) {
      const ang = a + split;
      const y = Math.cos(ang) * 0.12;
      const z = Math.sin(ang) * 0.12;
      alloy.push(tx(new THREE.BoxGeometry(0.045, 0.21, 0.024), 0.095, y, z, -ang, 0, 0));
    }
  }
  const disc = [tx(new THREE.CylinderGeometry(0.165, 0.165, 0.04, 18), 0.04, 0, 0, 0, 0, Math.PI / 2)];
  const cal = [tx(new THREE.BoxGeometry(0.06, 0.11, 0.065), 0.045, 0.05, 0.13, 0.35, 0, 0)];
  return encodeGLB([{
    name: 'car_wheel',
    primitives: [
      { geo: mergeSimple(tire), materialIndex: 0 },
      { geo: mergeSimple(alloy), materialIndex: 1 },
      { geo: mergeSimple(disc), materialIndex: 4 },
      { geo: mergeSimple(cal), materialIndex: 2 },
    ],
  }], PROP_PACK_MATS);
}

function buildCrateGlb(): Buffer {
  const wood: THREE.BufferGeometry[] = [tx(new THREE.BoxGeometry(1.02, 1.02, 1.02), 0, 0.55, 0)];
  const steel: THREE.BufferGeometry[] = [];
  // Corner framing planks & steel straps
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      wood.push(tx(new THREE.BoxGeometry(0.12, 1.1, 0.12), sx * 0.49, 0.55, sz * 0.49));
      steel.push(tx(new THREE.BoxGeometry(0.14, 0.14, 0.14), sx * 0.5, 0.07, sz * 0.5));
      steel.push(tx(new THREE.BoxGeometry(0.14, 0.14, 0.14), sx * 0.5, 1.03, sz * 0.5));
    }
    wood.push(tx(new THREE.BoxGeometry(0.08, 1.28, 0.04), 0, 0.55, sx * 0.53, 0, 0, sx * 0.78));
    wood.push(tx(new THREE.BoxGeometry(0.04, 1.28, 0.08), sx * 0.53, 0.55, 0, sx * 0.78, 0, 0));
  }
  return encodeGLB([{
    name: 'prop_crate',
    primitives: [
      { geo: mergeSimple(wood), materialIndex: 3 },
      { geo: mergeSimple(steel), materialIndex: 4 },
    ],
  }], PROP_PACK_MATS);
}

function buildBarrelGlb(): Buffer {
  const body: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.355, 0.355, 0.98, 18), 0, 0.5, 0),
  ];
  const rims: THREE.BufferGeometry[] = [];
  for (const ry of [0.025, 0.33, 0.67, 0.975]) {
    rims.push(tx(new THREE.TorusGeometry(0.358, 0.022, 8, 20), 0, ry, 0, Math.PI / 2, 0, 0));
  }
  rims.push(tx(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 10), 0.18, 0.995, 0));
  rims.push(tx(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), -0.16, 0.995, 0.08));
  return encodeGLB([{
    name: 'prop_barrel',
    primitives: [
      { geo: mergeSimple(body), materialIndex: 5 },
      { geo: mergeSimple(rims), materialIndex: 4 },
    ],
  }], PROP_PACK_MATS);
}

function buildBinGlb(): Buffer {
  const green: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.33, 0.27, 0.76, 16), 0, 0.39, 0),
    tx(new THREE.SphereGeometry(0.325, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.77, 0, 0, 0, 0, 1, 0.52, 1),
  ];
  const steel: THREE.BufferGeometry[] = [
    tx(new THREE.TorusGeometry(0.335, 0.02, 8, 18), 0, 0.76, 0, Math.PI / 2, 0, 0),
    tx(new THREE.BoxGeometry(0.16, 0.09, 0.05), 0, 0.94, 0),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    steel.push(tx(new THREE.BoxGeometry(0.03, 0.56, 0.03), Math.cos(a) * 0.3, 0.42, Math.sin(a) * 0.3, 0, -a, 0));
  }
  return encodeGLB([{
    name: 'prop_bin',
    primitives: [
      { geo: mergeSimple(green), materialIndex: 6 },
      { geo: mergeSimple(steel), materialIndex: 4 },
    ],
  }], PROP_PACK_MATS);
}

function buildPalmGlb(): Buffer {
  const trunk: THREE.BufferGeometry[] = [];
  const segs = 9;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const x = Math.sin(t * 1.4) * 0.42;
    const y = i * 0.92 + 0.46;
    const rTop = 0.28 - t * 0.11;
    const rBot = 0.31 - t * 0.11;
    trunk.push(tx(new THREE.CylinderGeometry(rTop, rBot, 0.98, 10), x, y, 0, 0, 0, -Math.cos(t * 1.4) * 0.07));
  }
  const fronds: THREE.BufferGeometry[] = [];
  const crownX = Math.sin(1.4) * 0.42;
  const crownY = segs * 0.92;
  for (let i = 0; i < 11; i++) {
    const yaw = (i / 11) * Math.PI * 2 + (i % 2) * 0.18;
    const pitch = (i % 3 === 0 ? 0.32 : -0.18);
    for (let s = 0; s < 4; s++) {
      const dist = 0.7 + s * 0.72;
      const drop = s * s * 0.14;
      const w = (1.15 - s * 0.18);
      const frondSeg = tx(new THREE.BoxGeometry(w, 0.05, 0.82), 0, -drop + Math.sin(pitch) * dist * 0.4, dist, -0.22 - s * 0.15, 0, 0);
      fronds.push(tx(frondSeg, crownX, crownY, 0, 0, yaw, 0));
    }
  }
  return encodeGLB([{
    name: 'prop_palm',
    primitives: [
      { geo: mergeSimple(trunk), materialIndex: 7 },
      { geo: mergeSimple(fronds), materialIndex: 8 },
    ],
  }], PROP_PACK_MATS);
}

function buildLampGlb(): Buffer {
  const pole: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.24, 0.3, 0.75, 12), 0, 0.375, 0),
    tx(new THREE.CylinderGeometry(0.11, 0.18, 5.4, 12), 0, 3.1, 0),
    tx(new THREE.BoxGeometry(2.2, 0.1, 0.1), 0, 5.75, 0),
  ];
  const emit: THREE.BufferGeometry[] = [
    tx(new THREE.SphereGeometry(0.22, 10, 8), -1.05, 5.65, 0, 0, 0, 0, 1.2, 0.7, 1.2),
    tx(new THREE.SphereGeometry(0.22, 10, 8), 1.05, 5.65, 0, 0, 0, 0, 1.2, 0.7, 1.2),
  ];
  return encodeGLB([{
    name: 'prop_lamp',
    primitives: [
      { geo: mergeSimple(pole), materialIndex: 4 },
      { geo: mergeSimple(emit), materialIndex: 9 },
    ],
  }], PROP_PACK_MATS);
}

function buildAircraftGlb(isJet: boolean): Buffer {
  const body: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  if (isJet) {
    const fy = 1.48;
    body.push(tx(new THREE.CylinderGeometry(0.56, 0.74, 4.8, 16), 0, fy, 1.1, Math.PI / 2, 0, 0));
    body.push(tx(new THREE.CylinderGeometry(0.74, 0.52, 4.6, 16), 0, fy, -3.3, Math.PI / 2, 0, 0));
    trim.push(tx(new THREE.ConeGeometry(0.56, 2.5, 16), 0, fy - 0.04, 4.75, Math.PI / 2, 0, 0));
    glass.push(tx(new THREE.SphereGeometry(0.46, 14, 10), 0, fy + 0.42, 2.0, 0, 0, 0, 0.92, 0.78, 3.2));
    for (const s of [-1, 1]) {
      body.push(tx(new THREE.BoxGeometry(0.5, 0.56, 3.8), s * 0.74, fy - 0.04, -0.4));
      body.push(tx(new THREE.BoxGeometry(4.5, 0.13, 2.2), s * 2.6, fy - 0.1, -1.3, 0, s * 0.34, 0));
      body.push(tx(new THREE.BoxGeometry(1.7, 0.1, 1.1), s * 1.15, fy - 0.05, -4.4, 0, s * 0.25, 0));
      body.push(tx(new THREE.BoxGeometry(0.11, 1.65, 1.45), s * 0.65, fy + 0.88, -4.2, -0.25, 0, s * -0.2));
      trim.push(tx(new THREE.CylinderGeometry(0.28, 0.34, 0.55, 12), s * 0.34, fy, -5.75, Math.PI / 2, 0, 0));
    }
    trim.push(tx(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), 0, 0.6, 3.2));
    trim.push(tx(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), -1.1, 0.6, -1.0));
    trim.push(tx(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), 1.1, 0.6, -1.0));
  } else {
    const fy = 1.38;
    body.push(tx(new THREE.CylinderGeometry(0.62, 0.42, 4.2, 14), 0, fy, -0.9, Math.PI / 2, 0, 0));
    body.push(tx(new THREE.BoxGeometry(1.16, 1.08, 2.8), 0, fy + 0.06, 1.15));
    trim.push(tx(new THREE.CylinderGeometry(0.46, 0.6, 1.15, 14), 0, fy, 3.0, Math.PI / 2, 0, 0));
    glass.push(tx(new THREE.BoxGeometry(1.1, 0.56, 1.4), 0, fy + 0.42, 1.45, -0.22, 0, 0));
    body.push(tx(new THREE.BoxGeometry(11.4, 0.16, 1.68), 0, fy + 0.72, 0.85));
    body.push(tx(new THREE.BoxGeometry(3.7, 0.1, 0.9), 0, fy + 0.18, -3.55));
    body.push(tx(new THREE.BoxGeometry(0.12, 1.35, 1.1), 0, fy + 0.78, -3.45, -0.22, 0, 0));
    for (const s of [-1, 1]) {
      trim.push(tx(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), s * 1.1, 0.65, 1.3, 0, 0, s * 0.25));
      trim.push(tx(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), s * 1.25, 0.32, 1.3, 0, 0, Math.PI / 2));
    }
  }
  return encodeGLB([{
    name: isJet ? 'plane_jet' : 'plane_prop',
    primitives: [
      { geo: mergeSimple(body), materialIndex: 0 },
      { geo: mergeSimple(trim), materialIndex: 4 },
      { geo: mergeSimple(glass), materialIndex: 2 },
    ],
  }], CAR_MATS);
}

function buildWeaponPackGlb(): Buffer {
  const gunMats: MatSpec[] = [
    { name: 'gunmetal', baseColorFactor: hexToRgba(0x282c32), metallicFactor: 0.85, roughnessFactor: 0.32 },
    { name: 'grip_wood', baseColorFactor: hexToRgba(0x5e3b24), metallicFactor: 0.05, roughnessFactor: 0.74 },
    { name: 'polymer', baseColorFactor: hexToRgba(0x16181c), metallicFactor: 0.18, roughnessFactor: 0.56 },
    { name: 'brass', baseColorFactor: hexToRgba(0xd4a842), metallicFactor: 0.9, roughnessFactor: 0.22 },
  ];
  const pistolMetal = [
    tx(new THREE.BoxGeometry(0.055, 0.068, 0.26), 0, 0.04, 0.03),
    tx(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8), 0, 0.045, 0.18, Math.PI / 2, 0, 0),
  ];
  const pistolGrip = [tx(new THREE.BoxGeometry(0.046, 0.13, 0.065), 0, -0.045, -0.06, -0.22, 0, 0)];

  const smgMetal = [
    tx(new THREE.BoxGeometry(0.068, 0.095, 0.36), 0, 0.03, 0.02),
    tx(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 10), 0, 0.04, 0.28, Math.PI / 2, 0, 0),
  ];
  const smgPoly = [
    tx(new THREE.BoxGeometry(0.048, 0.17, 0.052), 0, -0.09, 0.08, 0.12, 0, 0),
    tx(new THREE.BoxGeometry(0.048, 0.13, 0.06), 0, -0.05, -0.1, -0.2, 0, 0),
  ];

  const rifleMetal = [
    tx(new THREE.BoxGeometry(0.072, 0.1, 0.54), 0, 0.04, 0.05),
    tx(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 10), 0, 0.052, 0.5, Math.PI / 2, 0, 0),
    tx(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 10), 0, 0.125, 0.02, Math.PI / 2, 0, 0),
  ];
  const rifleWood = [
    tx(new THREE.BoxGeometry(0.062, 0.11, 0.28), 0, 0.01, -0.34),
    tx(new THREE.BoxGeometry(0.052, 0.18, 0.068), 0, -0.08, 0.12, 0.18, 0, 0),
  ];

  const rpgMetal = [
    tx(new THREE.CylinderGeometry(0.058, 0.058, 1.05, 14), 0, 0.04, 0, Math.PI / 2, 0, 0),
    tx(new THREE.ConeGeometry(0.09, 0.24, 12), 0, 0.04, 0.6, Math.PI / 2, 0, 0),
  ];
  const rpgWood = [
    tx(new THREE.CylinderGeometry(0.068, 0.068, 0.34, 12), 0, 0.04, 0.15, Math.PI / 2, 0, 0),
    tx(new THREE.BoxGeometry(0.05, 0.14, 0.06), 0, -0.06, 0.12),
  ];

  return encodeGLB([
    { name: 'weapon_pistol', primitives: [{ geo: mergeSimple(pistolMetal), materialIndex: 0 }, { geo: mergeSimple(pistolGrip), materialIndex: 2 }] },
    { name: 'weapon_smg', primitives: [{ geo: mergeSimple(smgMetal), materialIndex: 0 }, { geo: mergeSimple(smgPoly), materialIndex: 2 }] },
    { name: 'weapon_rifle', primitives: [{ geo: mergeSimple(rifleMetal), materialIndex: 0 }, { geo: mergeSimple(rifleWood), materialIndex: 1 }] },
    { name: 'weapon_rpg', primitives: [{ geo: mergeSimple(rpgMetal), materialIndex: 0 }, { geo: mergeSimple(rpgWood), materialIndex: 1 }] },
  ], gunMats);
}

// ========================================================================= WRITE ALL .GLB FILES
const outDir = path.resolve(process.cwd(), 'public/models');
fs.mkdirSync(outDir, { recursive: true });

const files: [string, Buffer][] = [
  ['car_sports.glb', buildCarGlb('sports')],
  ['car_sedan.glb', buildCarGlb('sedan')],
  ['car_suv.glb', buildCarGlb('suv')],
  ['car_police.glb', buildCarGlb('police')],
  ['car_wheel.glb', buildCarWheelGlb()],
  ['building_artdeco.glb', buildArtDecoGlb()],
  ['building_tower.glb', buildTowerGlb()],
  ['building_havana.glb', buildHavanaGlb()],
  ['building_wynwood.glb', buildWynwoodGlb()],
  ['human_base.glb', buildHumanBaseGlb()],
  ['prop_crate.glb', buildCrateGlb()],
  ['prop_barrel.glb', buildBarrelGlb()],
  ['prop_bin.glb', buildBinGlb()],
  ['prop_palm.glb', buildPalmGlb()],
  ['prop_lamp.glb', buildLampGlb()],
  ['plane_jet.glb', buildAircraftGlb(true)],
  ['plane_prop.glb', buildAircraftGlb(false)],
  ['weapon_pack.glb', buildWeaponPackGlb()],
];

for (const [name, buf] of files) {
  const full = path.join(outDir, name);
  fs.writeFileSync(full, buf);
  const magic = buf.subarray(0, 4).toString('ascii');
  const version = buf.readUInt32LE(4);
  console.log(`Generated ${name} (${(buf.length / 1024).toFixed(1)} KB, magic=${magic}, v${version})`);
}
