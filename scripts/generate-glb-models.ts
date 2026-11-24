// Generates handcrafted glTF 2.0 binary (.glb) 3D models into public/models/ for SAN NOVA.
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
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return normalizeGeo(g);
}

function latheProfile(pts: [number, number][], segs = 16): THREE.BufferGeometry {
  const v = pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const g = new THREE.LatheGeometry(v, segs);
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
        componentType: 5126,
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
        mode: 4,
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
    asset: { version: '2.0', generator: 'SanNova-GLB-Handcrafted-v2' },
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
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuffer]);
}

function hexToRgba(hex: number, a = 1): [number, number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b, a];
}

// ========================================================================= HANDCRAFTED CAR MODELS
const CAR_MATS: MatSpec[] = [
  { name: 'paint', baseColorFactor: hexToRgba(0xd92638), metallicFactor: 0.48, roughnessFactor: 0.14 },
  { name: 'paint_secondary', baseColorFactor: hexToRgba(0x161920), metallicFactor: 0.35, roughnessFactor: 0.24 },
  { name: 'glass', baseColorFactor: hexToRgba(0x0f1a24, 0.72), metallicFactor: 0.18, roughnessFactor: 0.05, alphaMode: 'BLEND' },
  { name: 'chrome', baseColorFactor: hexToRgba(0xebf0f6), metallicFactor: 0.94, roughnessFactor: 0.12 },
  { name: 'trim', baseColorFactor: hexToRgba(0x16191e), metallicFactor: 0.18, roughnessFactor: 0.68 },
  { name: 'interior', baseColorFactor: hexToRgba(0x282321), metallicFactor: 0.06, roughnessFactor: 0.84 },
  { name: 'headlight', baseColorFactor: hexToRgba(0xfff9ea), metallicFactor: 0.1, roughnessFactor: 0.08, emissiveFactor: [0.9, 0.86, 0.76] },
  { name: 'taillight', baseColorFactor: hexToRgba(0xe21818), metallicFactor: 0.12, roughnessFactor: 0.1, emissiveFactor: [0.9, 0.07, 0.06] },
  { name: 'siren_red', baseColorFactor: hexToRgba(0xff1e24), metallicFactor: 0.1, roughnessFactor: 0.1, emissiveFactor: [0.96, 0.08, 0.08] },
  { name: 'siren_blue', baseColorFactor: hexToRgba(0x1e6cff), metallicFactor: 0.1, roughnessFactor: 0.1, emissiveFactor: [0.08, 0.36, 0.98] },
  { name: 'carbon', baseColorFactor: hexToRgba(0x1b1f26), metallicFactor: 0.28, roughnessFactor: 0.32 },
  { name: 'caliper_red', baseColorFactor: hexToRgba(0xd62424), metallicFactor: 0.32, roughnessFactor: 0.28 },
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
  const carbonGeos: THREE.BufferGeometry[] = [];

  const isSports = kind === 'sports';
  const isSuv = kind === 'suv';
  const isPolice = kind === 'police';
  const W = isSports ? 2.04 : isSuv ? 2.12 : 1.96;
  const L = isSports ? 4.46 : isSuv ? 4.8 : isPolice ? 4.74 : 4.58;
  const halfL = L / 2;
  const halfW = W / 2;

  const sillY = isSuv ? 0.42 : isSports ? 0.24 : 0.32;
  const beltY = isSuv ? 1.06 : isSports ? 0.84 : 0.92;
  const roofY = isSuv ? 1.76 : isSports ? 1.24 : 1.44;
  const hoodY = isSuv ? 1.04 : isSports ? 0.72 : 0.86;
  const noseY = isSuv ? 0.72 : isSports ? 0.42 : 0.56;

  // 1. Sculpted multi-point lower body silhouette with smooth bevel
  const bodyPts: [number, number][] = isSports
    ? [
        [-halfL + 0.08, sillY + 0.08],
        [-halfL + 0.02, beltY + 0.06],
        [-halfL + 0.48, beltY + 0.1],
        [halfL - 1.32, beltY + 0.02],
        [halfL - 0.55, hoodY + 0.05],
        [halfL - 0.04, noseY + 0.06],
        [halfL, sillY + 0.04],
        [halfL - 0.14, sillY],
        [-halfL + 0.14, sillY],
      ]
    : isSuv
    ? [
        [-halfL + 0.04, sillY + 0.06],
        [-halfL + 0.02, beltY + 0.08],
        [halfL - 1.38, beltY + 0.06],
        [halfL - 0.12, hoodY],
        [halfL, noseY + 0.08],
        [halfL - 0.02, sillY + 0.06],
        [halfL - 0.12, sillY],
        [-halfL + 0.12, sillY],
      ]
    : [
        [-halfL + 0.06, sillY + 0.06],
        [-halfL + 0.02, beltY + 0.04],
        [-halfL + 0.65, beltY + 0.06],
        [halfL - 1.36, beltY + 0.02],
        [halfL - 0.16, hoodY - 0.02],
        [halfL, noseY + 0.04],
        [halfL - 0.04, sillY + 0.04],
        [halfL - 0.12, sillY],
        [-halfL + 0.12, sillY],
      ];
  paintGeos.push(extrudeProfile(bodyPts, W - 0.18, 0.06, 0.06, 3));

  // 2. Sculpted upper fenders & haunches + recessed dark wheel-well arches
  const wheelZ = isSports ? 1.38 : isSuv ? 1.48 : 1.42;
  for (const s of [-1, 1]) {
    // Upper shoulder crease line along flanks
    paintGeos.push(tx(new THREE.BoxGeometry(0.11, 0.16, L * 0.78), s * (halfW - 0.07), beltY - 0.08, 0, 0, 0, s * -0.14));
    // Sculpted flared wheel arches (front & rear)
    for (const wz of [wheelZ, -wheelZ]) {
      const archR = isSuv ? 0.5 : 0.44;
      const archGeo = new THREE.TorusGeometry(archR, 0.062, 8, 16, Math.PI);
      archGeo.rotateY(Math.PI / 2);
      paintGeos.push(tx(archGeo, s * (halfW - 0.05), sillY + 0.16, wz));
      // Inner dark wheelhouse liner
      trimGeos.push(tx(new THREE.CylinderGeometry(archR - 0.02, archR - 0.02, 0.34, 14, 1, false, 0, Math.PI), s * (halfW - 0.24), sillY + 0.15, wz, 0, 0, Math.PI / 2));
    }
    // Carbon/trim side skirts between wheels
    carbonGeos.push(tx(new THREE.BoxGeometry(0.14, 0.1, wheelZ * 1.38), s * (halfW - 0.04), sillY + 0.03, 0));
    // Sculpted side mirror on stalk
    const mirY = beltY + 0.12;
    const mirZ = isSports ? 0.48 : 0.56;
    trimGeos.push(tx(new THREE.BoxGeometry(0.12, 0.04, 0.06), s * (halfW - 0.02), mirY - 0.02, mirZ, 0, 0, s * 0.25));
    paintGeos.push(tx(new THREE.SphereGeometry(0.08, 10, 8), s * (halfW + 0.07), mirY + 0.02, mirZ - 0.01, 0, 0, 0, 1.15, 0.72, 1.35));
    // Flush chrome door handles
    chromeGeos.push(tx(new THREE.BoxGeometry(0.035, 0.035, 0.17), s * (halfW + 0.005), beltY - 0.1, 0.05));
    if (!isSports) {
      chromeGeos.push(tx(new THREE.BoxGeometry(0.035, 0.035, 0.17), s * (halfW + 0.005), beltY - 0.1, -0.78));
    }
  }

  // 3. Hood power dome & subtle cowl vents
  if (isSports) {
    paintGeos.push(tx(new THREE.BoxGeometry(W * 0.46, 0.07, 1.05), 0, hoodY + 0.05, halfL - 0.92, 0.1, 0, 0));
    carbonGeos.push(tx(new THREE.BoxGeometry(W * 0.28, 0.03, 0.24), 0, hoodY + 0.08, halfL - 0.85, 0.1, 0, 0));
  } else {
    paintGeos.push(tx(new THREE.BoxGeometry(W * 0.54, 0.045, 1.1), 0, hoodY + 0.03, halfL - 0.95, 0.05, 0, 0));
  }

  // 4. Pinched-in Greenhouse / Cabin + Glass + Pillars
  const cabFront = isSports ? 0.68 : isSuv ? 0.72 : 0.74;
  const cabRear = isSports ? -1.35 : isSuv ? -halfL + 0.2 : -1.45;
  const cabTopFront = isSports ? 0.02 : isSuv ? 0.2 : 0.14;
  const cabTopRear = isSports ? -0.95 : isSuv ? -halfL + 0.34 : -0.96;
  const cabW = W * (isSuv ? 0.86 : isSports ? 0.8 : 0.82);

  // Dark cabin core glass shell
  const glassPts: [number, number][] = [
    [cabRear, beltY - 0.02],
    [cabTopRear, roofY - 0.04],
    [cabTopFront, roofY - 0.04],
    [cabFront, beltY - 0.02],
  ];
  glassGeos.push(extrudeProfile(glassPts, cabW - 0.12, 0.035, 0.035, 2));

  // Roof cap (painted or black/white police roof)
  const roofTarget = isPolice ? secGeos : paintGeos;
  const roofPts: [number, number][] = [
    [cabTopRear - 0.04, roofY - 0.06],
    [cabTopRear + 0.06, roofY + 0.02],
    [cabTopFront - 0.06, roofY + 0.02],
    [cabTopFront + 0.04, roofY - 0.06],
  ];
  roofTarget.push(extrudeProfile(roofPts, cabW - 0.14, 0.03, 0.03, 2));

  // A, B, C structural roof pillars (so the greenhouse reads as real framed automotive glass)
  const pilTarget = isPolice ? secGeos : paintGeos;
  for (const s of [-1, 1]) {
    const px = s * (cabW / 2 - 0.05);
    // A-pillar
    const aLen = Math.hypot(cabFront - cabTopFront, roofY - beltY);
    const aAng = Math.atan2(cabFront - cabTopFront, roofY - beltY);
    pilTarget.push(tx(new THREE.BoxGeometry(0.08, aLen, 0.09), px, (beltY + roofY) * 0.5, (cabFront + cabTopFront) * 0.5, aAng, 0, s * 0.12));
    // B-pillar
    trimGeos.push(tx(new THREE.BoxGeometry(0.06, roofY - beltY, 0.12), px - s * 0.01, (beltY + roofY) * 0.5, -0.22, 0, 0, s * 0.1));
    // C-pillar
    const cLen = Math.hypot(cabTopRear - cabRear, roofY - beltY);
    const cAng = -Math.atan2(cabTopRear - cabRear, roofY - beltY);
    pilTarget.push(tx(new THREE.BoxGeometry(0.09, cLen, 0.18), px, (beltY + roofY) * 0.5, (cabRear + cabTopRear) * 0.5, cAng, 0, s * 0.12));
  }

  // 5. Interior Seats + Dashboard + Steering Wheel visible behind glass
  intGeos.push(tx(new THREE.BoxGeometry(cabW * 0.82, 0.24, 0.44), 0, beltY - 0.06, cabFront - 0.34));
  trimGeos.push(tx(new THREE.TorusGeometry(0.16, 0.024, 8, 16), -cabW * 0.22, beltY + 0.04, cabFront - 0.56, 0.42, 0, 0));
  for (const s of [-1, 1]) {
    intGeos.push(tx(new THREE.BoxGeometry(0.42, 0.54, 0.14), s * cabW * 0.22, beltY + 0.06, -0.22, -0.2, 0, 0));
    intGeos.push(tx(new THREE.BoxGeometry(0.22, 0.16, 0.1), s * cabW * 0.22, beltY + 0.38, -0.28, -0.1, 0, 0));
  }

  // 6. Front Fascia: Chin Splitter, Honeycomb Grille, Chrome Slats, Projector Headlights + LED DRLs
  carbonGeos.push(tx(new THREE.BoxGeometry(W * 0.94, 0.075, 0.28), 0, sillY + 0.02, halfL - 0.04));
  trimGeos.push(tx(new THREE.BoxGeometry(W * 0.54, 0.24, 0.1), 0, noseY - 0.02, halfL + 0.01));
  for (let i = -1; i <= 1; i++) {
    chromeGeos.push(tx(new THREE.BoxGeometry(W * 0.52, 0.022, 0.04), 0, noseY - 0.02 + i * 0.065, halfL + 0.055));
  }
  // Chrome badge center emblem
  chromeGeos.push(tx(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12), 0, noseY + 0.04, halfL + 0.055, Math.PI / 2, 0, 0));
  // Lower side brake air intakes
  for (const s of [-1, 1]) {
    trimGeos.push(tx(new THREE.BoxGeometry(0.38, 0.16, 0.09), s * (halfW - 0.32), sillY + 0.15, halfL - 0.01));
    // Sculpted projector headlight clusters + eyebrow DRL
    trimGeos.push(tx(new THREE.BoxGeometry(0.42, 0.15, 0.14), s * (halfW - 0.32), noseY + 0.11, halfL - 0.05, 0, s * -0.14, 0));
    headGeos.push(tx(new THREE.BoxGeometry(0.36, 0.08, 0.06), s * (halfW - 0.32), noseY + 0.12, halfL + 0.015, 0, s * -0.14, 0));
    headGeos.push(tx(new THREE.BoxGeometry(0.38, 0.024, 0.05), s * (halfW - 0.32), noseY + 0.17, halfL + 0.01, 0, s * -0.14, 0));
  }

  // 7. Rear Fascia: Diffuser Fins, Twin/Quad Exhausts, LED Taillight Bar, License Plate Recess
  carbonGeos.push(tx(new THREE.BoxGeometry(W * 0.9, 0.18, 0.16), 0, sillY + 0.09, -halfL - 0.01));
  for (let i = -2; i <= 2; i++) {
    carbonGeos.push(tx(new THREE.BoxGeometry(0.035, 0.15, 0.14), i * 0.22, sillY + 0.08, -halfL - 0.07));
  }
  const exOffsets = isSports ? [-0.62, -0.46, 0.46, 0.62] : [-0.58, 0.58];
  for (const ex of exOffsets) {
    chromeGeos.push(tx(new THREE.CylinderGeometry(0.052, 0.052, 0.18, 12), ex, sillY + 0.07, -halfL - 0.06, Math.PI / 2, 0, 0));
  }
  // Rear LED taillights + full-width light blade on sports/sedan
  for (const s of [-1, 1]) {
    tailGeos.push(tx(new THREE.BoxGeometry(0.46, 0.13, 0.08), s * (halfW - 0.34), beltY - 0.1, -halfL - 0.02));
  }
  if (isSports) {
    tailGeos.push(tx(new THREE.BoxGeometry(W * 0.72, 0.042, 0.06), 0, beltY - 0.1, -halfL - 0.025));
    // GT Carbon Rear Wing Spoiler with swan-neck pylons
    carbonGeos.push(tx(new THREE.BoxGeometry(W * 0.92, 0.048, 0.28), 0, beltY + 0.28, -halfL + 0.16, 0.12, 0, 0));
    for (const s of [-1, 1]) {
      carbonGeos.push(tx(new THREE.BoxGeometry(0.05, 0.26, 0.16), s * 0.46, beltY + 0.14, -halfL + 0.2));
      carbonGeos.push(tx(new THREE.BoxGeometry(0.035, 0.14, 0.32), s * (W * 0.46), beltY + 0.27, -halfL + 0.16));
    }
  } else if (isSuv) {
    // Roof luggage rails + rear roof lip + rear step bumper
    for (const s of [-1, 1]) {
      chromeGeos.push(tx(new THREE.BoxGeometry(0.055, 0.06, 2.2), s * (cabW * 0.42), roofY + 0.06, -0.58));
      trimGeos.push(tx(new THREE.BoxGeometry(0.07, 0.08, 0.16), s * (cabW * 0.42), roofY + 0.02, 0.22));
      trimGeos.push(tx(new THREE.BoxGeometry(0.07, 0.08, 0.16), s * (cabW * 0.42), roofY + 0.02, -1.42));
    }
    trimGeos.push(tx(new THREE.BoxGeometry(W * 0.88, 0.08, 0.22), 0, sillY + 0.04, -halfL - 0.06));
  } else if (isPolice) {
    // Two-tone black/white doors + heavy front push-bar bullbar + LED lightbar + trunk antenna
    secGeos.push(tx(new THREE.BoxGeometry(W + 0.02, 0.52, 1.56), 0, (sillY + beltY) * 0.5 + 0.02, -0.08));
    // Front steel push bumper
    trimGeos.push(tx(new THREE.BoxGeometry(0.92, 0.08, 0.1), 0, noseY + 0.08, halfL + 0.16));
    trimGeos.push(tx(new THREE.BoxGeometry(0.92, 0.08, 0.1), 0, sillY + 0.14, halfL + 0.16));
    for (const s of [-1, 1]) {
      trimGeos.push(tx(new THREE.BoxGeometry(0.08, 0.48, 0.14), s * 0.38, noseY - 0.04, halfL + 0.14));
      // A-pillar police spotlight
      trimGeos.push(tx(new THREE.CylinderGeometry(0.065, 0.075, 0.12, 10), s * (halfW - 0.04), beltY + 0.18, 0.66, Math.PI / 2, 0, 0));
    }
    // Roof aero LED lightbar
    trimGeos.push(tx(new THREE.BoxGeometry(1.24, 0.06, 0.24), 0, roofY + 0.05, -0.18));
    sirenR.push(tx(new THREE.BoxGeometry(0.5, 0.09, 0.22), -0.32, roofY + 0.1, -0.18));
    sirenB.push(tx(new THREE.BoxGeometry(0.5, 0.09, 0.22), 0.32, roofY + 0.1, -0.18));
    chromeGeos.push(tx(new THREE.BoxGeometry(0.16, 0.09, 0.22), 0, roofY + 0.1, -0.18));
    // Rear trunk whip antenna
    trimGeos.push(tx(new THREE.CylinderGeometry(0.008, 0.012, 0.85, 6), 0.48, beltY + 0.42, -halfL + 0.35));
  }

  // Dark underbody floor pan so car never looks hollow from low angles
  trimGeos.push(tx(new THREE.BoxGeometry(W * 0.86, 0.09, L * 0.9), 0, sillY + 0.02, 0));

  const primitives: PrimitiveData[] = [
    { geo: mergeSimple(paintGeos), materialIndex: 0 },
    { geo: mergeSimple(glassGeos), materialIndex: 2 },
    { geo: mergeSimple(chromeGeos), materialIndex: 3 },
    { geo: mergeSimple(trimGeos), materialIndex: 4 },
    { geo: mergeSimple(intGeos), materialIndex: 5 },
    { geo: mergeSimple(headGeos), materialIndex: 6 },
    { geo: mergeSimple(tailGeos), materialIndex: 7 },
    { geo: mergeSimple(carbonGeos), materialIndex: 10 },
  ];
  if (secGeos.length) primitives.push({ geo: mergeSimple(secGeos), materialIndex: 1 });
  if (sirenR.length) primitives.push({ geo: mergeSimple(sirenR), materialIndex: 8 });
  if (sirenB.length) primitives.push({ geo: mergeSimple(sirenB), materialIndex: 9 });

  return encodeGLB([{ name: `car_${kind}`, primitives }], CAR_MATS);
}

// ========================================================================= HANDCRAFTED CAR WHEEL (Tire + Y-Spoke Alloy + Brake Rotor + Red Caliper)
function buildCarWheelGlb(): Buffer {
  const tireGeos: THREE.BufferGeometry[] = [];
  const alloyGeos: THREE.BufferGeometry[] = [];
  const rotorGeos: THREE.BufferGeometry[] = [];
  const caliperGeos: THREE.BufferGeometry[] = [];

  // Lathe-sculpted rounded tire profile (unit radius = 0.36, width = 0.26)
  const tireLathe = latheProfile([
    [0.24, -0.13], [0.32, -0.135], [0.356, -0.115], [0.365, -0.07],
    [0.365, 0.07], [0.356, 0.115], [0.32, 0.135], [0.24, 0.13], [0.23, 0.1], [0.23, -0.1],
  ], 24);
  tireGeos.push(tx(tireLathe, 0, 0, 0, 0, 0, Math.PI / 2));

  // Subtle tread shoulder blocks around circumference
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    tireGeos.push(tx(new THREE.BoxGeometry(0.24, 0.022, 0.05), 0, Math.sin(a) * 0.362, Math.cos(a) * 0.362, a, 0, 0));
  }

  // Deep-dish alloy barrel & lip
  const rimRing = new THREE.TorusGeometry(0.242, 0.02, 10, 22);
  rimRing.rotateY(Math.PI / 2);
  alloyGeos.push(tx(rimRing, 0.115, 0, 0));
  alloyGeos.push(tx(rimRing, -0.115, 0, 0));
  alloyGeos.push(tx(new THREE.CylinderGeometry(0.235, 0.235, 0.22, 20, 1, true), 0, 0, 0, 0, 0, Math.PI / 2));

  // Center hub + 5 lug nuts + 5 split Y-spokes
  alloyGeos.push(tx(new THREE.CylinderGeometry(0.068, 0.074, 0.14, 14), 0.04, 0, 0, 0, 0, Math.PI / 2));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    // Split Y-spoke pair
    for (const spread of [-0.14, 0.14]) {
      const sa = a + spread;
      const midR = 0.145;
      alloyGeos.push(
        tx(
          new THREE.BoxGeometry(0.028, 0.18, 0.024),
          0.088,
          Math.sin(sa) * midR,
          Math.cos(sa) * midR,
          -sa + Math.PI / 2,
          0,
          0,
        ),
      );
    }
    // Lug nut
    alloyGeos.push(tx(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 6), 0.105, Math.sin(a) * 0.042, Math.cos(a) * 0.042, 0, 0, Math.PI / 2));
  }

  // Metallic brake rotor disc + red performance brake caliper
  rotorGeos.push(tx(new THREE.CylinderGeometry(0.185, 0.185, 0.022, 18), -0.02, 0, 0, 0, 0, Math.PI / 2));
  caliperGeos.push(tx(new THREE.BoxGeometry(0.068, 0.13, 0.075), -0.01, 0.11, 0.13, -0.65, 0, 0));

  const wheelMats: MatSpec[] = [
    { name: 'tire', baseColorFactor: hexToRgba(0x14161a), metallicFactor: 0.04, roughnessFactor: 0.86 },
    { name: 'alloy', baseColorFactor: hexToRgba(0xdbe2ea), metallicFactor: 0.9, roughnessFactor: 0.18 },
    { name: 'rotor', baseColorFactor: hexToRgba(0x88929e), metallicFactor: 0.86, roughnessFactor: 0.36 },
    { name: 'caliper', baseColorFactor: hexToRgba(0xd91f26), metallicFactor: 0.35, roughnessFactor: 0.25 },
  ];

  return encodeGLB([{
    name: 'car_wheel',
    primitives: [
      { geo: mergeSimple(tireGeos), materialIndex: 0 },
      { geo: mergeSimple(alloyGeos), materialIndex: 1 },
      { geo: mergeSimple(rotorGeos), materialIndex: 2 },
      { geo: mergeSimple(caliperGeos), materialIndex: 3 },
    ],
  }], wheelMats);
}

// ========================================================================= HANDCRAFTED BUILDINGS (With Grounding Plinths)
const BLDG_MATS: MatSpec[] = [
  { name: 'facade', baseColorFactor: hexToRgba(0xf4ebe1), metallicFactor: 0.06, roughnessFactor: 0.72 },
  { name: 'trim', baseColorFactor: hexToRgba(0xd8cfc4), metallicFactor: 0.12, roughnessFactor: 0.56 },
  { name: 'glass', baseColorFactor: hexToRgba(0x2a4f6e, 0.92), metallicFactor: 0.65, roughnessFactor: 0.08 },
  { name: 'accent', baseColorFactor: hexToRgba(0x2ec4b6), metallicFactor: 0.22, roughnessFactor: 0.36 },
  { name: 'neon', baseColorFactor: hexToRgba(0xff4d94), metallicFactor: 0.1, roughnessFactor: 0.2, emissiveFactor: [0.92, 0.24, 0.52] },
  { name: 'dark_metal', baseColorFactor: hexToRgba(0x22262e), metallicFactor: 0.78, roughnessFactor: 0.34 },
];

function buildArtDecoGlb(): Buffer {
  const facade: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const neon: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  // Grounding stone plinth extending -0.35m below grade so it never floats
  trim.push(tx(new THREE.BoxGeometry(1.04, 0.16, 1.04), 0, 0.03, 0));
  // Main stepped Art Deco shell (normalized 1x1x1 box scaled by building W, H, D)
  facade.push(tx(new THREE.BoxGeometry(0.96, 0.86, 0.96), 0, 0.45, 0));
  // Stepped ziggurat crown & vertical fins
  facade.push(tx(new THREE.BoxGeometry(0.74, 0.11, 0.74), 0, 0.92, 0));
  trim.push(tx(new THREE.BoxGeometry(0.46, 0.07, 0.46), 0, 0.985, 0));
  // Horizontal Art Deco eyebrow sunshades on every floor
  for (let i = 1; i <= 4; i++) {
    const y = 0.16 + i * 0.165;
    trim.push(tx(new THREE.BoxGeometry(1.01, 0.022, 1.01), 0, y, 0));
    glass.push(tx(new THREE.BoxGeometry(0.975, 0.072, 0.82), 0, y - 0.05, 0));
    glass.push(tx(new THREE.BoxGeometry(0.82, 0.072, 0.975), 0, y - 0.05, 0));
  }
  // Vertical central ribbed pilasters on all 4 facades
  for (const s of [-1, 1]) {
    trim.push(tx(new THREE.BoxGeometry(0.11, 0.88, 0.06), 0, 0.48, s * 0.49));
    trim.push(tx(new THREE.BoxGeometry(0.06, 0.88, 0.11), s * 0.49, 0.48, 0));
    accent.push(tx(new THREE.BoxGeometry(0.04, 0.76, 0.075), 0, 0.5, s * 0.5));
  }
  // Ground-floor pastel storefront canopy & neon crown strip
  accent.push(tx(new THREE.BoxGeometry(1.03, 0.035, 1.03), 0, 0.16, 0));
  neon.push(tx(new THREE.BoxGeometry(0.78, 0.022, 0.78), 0, 0.9, 0));
  metal.push(tx(new THREE.BoxGeometry(0.24, 0.11, 0.04), 0, 0.08, 0.495));

  return encodeGLB([{
    name: 'building_artdeco',
    primitives: [
      { geo: mergeSimple(facade), materialIndex: 0 },
      { geo: mergeSimple(trim), materialIndex: 1 },
      { geo: mergeSimple(glass), materialIndex: 2 },
      { geo: mergeSimple(accent), materialIndex: 3 },
      { geo: mergeSimple(neon), materialIndex: 4 },
      { geo: mergeSimple(metal), materialIndex: 5 },
    ],
  }], BLDG_MATS);
}

function buildTowerGlb(): Buffer {
  const facade: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const neon: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  // Deep granite podium base
  trim.push(tx(new THREE.BoxGeometry(1.02, 0.16, 1.02), 0, 0.04, 0));
  // Glass curtain-wall shaft
  glass.push(tx(new THREE.BoxGeometry(0.94, 0.82, 0.94), 0, 0.52, 0));
  // Architectural exoskeleton corner columns + spandrel floor bands
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      facade.push(tx(new THREE.BoxGeometry(0.11, 0.9, 0.11), sx * 0.455, 0.48, sz * 0.455));
    }
  }
  for (let i = 0; i < 6; i++) {
    const y = 0.16 + i * 0.135;
    metal.push(tx(new THREE.BoxGeometry(0.965, 0.024, 0.965), 0, y, 0));
  }
  for (const x of [-0.22, 0, 0.22]) {
    metal.push(tx(new THREE.BoxGeometry(0.02, 0.82, 0.96), x, 0.52, 0));
    metal.push(tx(new THREE.BoxGeometry(0.96, 0.82, 0.02), 0, 0.52, x));
  }
  // Mechanical penthouse + glowing spire crown
  facade.push(tx(new THREE.BoxGeometry(0.62, 0.09, 0.62), 0, 0.96, 0));
  neon.push(tx(new THREE.BoxGeometry(0.96, 0.018, 0.96), 0, 0.925, 0));
  accent.push(tx(new THREE.CylinderGeometry(0.012, 0.028, 0.16, 8), 0, 1.06, 0));

  return encodeGLB([{
    name: 'building_tower',
    primitives: [
      { geo: mergeSimple(facade), materialIndex: 0 },
      { geo: mergeSimple(trim), materialIndex: 1 },
      { geo: mergeSimple(glass), materialIndex: 2 },
      { geo: mergeSimple(accent), materialIndex: 3 },
      { geo: mergeSimple(neon), materialIndex: 4 },
      { geo: mergeSimple(metal), materialIndex: 5 },
    ],
  }], BLDG_MATS);
}

function buildHavanaGlb(): Buffer {
  const facade: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  // Stucco grounding base & main colonial block
  trim.push(tx(new THREE.BoxGeometry(1.02, 0.14, 1.02), 0, 0.03, 0));
  facade.push(tx(new THREE.BoxGeometry(0.96, 0.84, 0.96), 0, 0.46, 0));
  // Sloped terracotta-tile cornice roof & parapet overhang
  accent.push(tx(new THREE.BoxGeometry(1.04, 0.075, 1.04), 0, 0.91, 0));
  accent.push(tx(new THREE.BoxGeometry(0.86, 0.07, 0.86), 0, 0.97, 0));
  // Wrought-iron Juliette balconies + arched shuttered windows
  for (let f = 0; f < 3; f++) {
    const y = 0.25 + f * 0.22;
    for (const bx of [-0.26, 0, 0.26]) {
      glass.push(tx(new THREE.BoxGeometry(0.14, 0.14, 0.98), bx, y + 0.03, 0));
      glass.push(tx(new THREE.BoxGeometry(0.98, 0.14, 0.14), 0, y + 0.03, bx));
      trim.push(tx(new THREE.BoxGeometry(0.18, 0.025, 1.04), bx, y - 0.045, 0));
      metal.push(tx(new THREE.BoxGeometry(0.18, 0.055, 0.02), bx, y - 0.01, 0.525));
      metal.push(tx(new THREE.BoxGeometry(0.18, 0.055, 0.02), bx, y - 0.01, -0.525));
    }
  }

  return encodeGLB([{
    name: 'building_havana',
    primitives: [
      { geo: mergeSimple(facade), materialIndex: 0 },
      { geo: mergeSimple(trim), materialIndex: 1 },
      { geo: mergeSimple(glass), materialIndex: 2 },
      { geo: mergeSimple(accent), materialIndex: 3 },
      { geo: mergeSimple(metal), materialIndex: 5 },
    ],
  }], BLDG_MATS);
}

function buildWynwoodGlb(): Buffer {
  const facade: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  const neon: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  // Concrete warehouse plinth + brick/stucco loft body
  trim.push(tx(new THREE.BoxGeometry(1.03, 0.14, 1.03), 0, 0.03, 0));
  facade.push(tx(new THREE.BoxGeometry(0.96, 0.78, 0.96), 0, 0.44, 0));
  // Industrial sawtooth skylight roof bays
  for (const sx of [-0.28, 0.06, 0.36]) {
    trim.push(tx(new THREE.BoxGeometry(0.24, 0.11, 0.92), sx, 0.88, 0, 0, 0, -0.32));
    glass.push(tx(new THREE.BoxGeometry(0.06, 0.1, 0.88), sx - 0.11, 0.88, 0));
  }
  // Steel structural pilasters & industrial mullioned loft windows
  for (const x of [-0.46, -0.15, 0.15, 0.46]) {
    metal.push(tx(new THREE.BoxGeometry(0.045, 0.82, 0.99), x, 0.45, 0));
  }
  glass.push(tx(new THREE.BoxGeometry(0.84, 0.18, 0.975), 0, 0.62, 0));
  glass.push(tx(new THREE.BoxGeometry(0.975, 0.18, 0.84), 0, 0.62, 0));
  // Gallery mural accent band + loading bay canopy + rooftop neon art sign
  accent.push(tx(new THREE.BoxGeometry(0.985, 0.18, 0.985), 0, 0.32, 0));
  metal.push(tx(new THREE.BoxGeometry(0.55, 0.03, 0.18), 0, 0.19, 0.54));
  neon.push(tx(new THREE.BoxGeometry(0.52, 0.035, 0.04), 0, 0.84, 0.49));

  return encodeGLB([{
    name: 'building_wynwood',
    primitives: [
      { geo: mergeSimple(facade), materialIndex: 0 },
      { geo: mergeSimple(trim), materialIndex: 1 },
      { geo: mergeSimple(glass), materialIndex: 2 },
      { geo: mergeSimple(accent), materialIndex: 3 },
      { geo: mergeSimple(neon), materialIndex: 4 },
      { geo: mergeSimple(metal), materialIndex: 5 },
    ],
  }], BLDG_MATS);
}

// ========================================================================= HANDCRAFTED ANATOMICAL HUMAN PARTS (Zero Cubic Limbs!)
function buildHumanBaseGlb(): Buffer {
  const mats: MatSpec[] = [
    { name: 'primary', baseColorFactor: hexToRgba(0xd8d8d8), metallicFactor: 0.04, roughnessFactor: 0.72 },
    { name: 'secondary', baseColorFactor: hexToRgba(0x262930), metallicFactor: 0.25, roughnessFactor: 0.45 },
  ];

  // 1. TorsoMesh: sculpted anatomical lathe chest + trapezius + waist + belt & buckle
  const torsoMain = latheProfile([
    [0.01, -0.06], [0.132, -0.055], [0.145, 0.01], [0.136, 0.11],
    [0.146, 0.21], [0.172, 0.31], [0.184, 0.39], [0.174, 0.45],
    [0.142, 0.485], [0.088, 0.505], [0.055, 0.515], [0.01, 0.515],
  ], 20);
  // Subtle non-uniform scale (wider X shoulders, trimmer Z chest depth)
  const torsoScaled = tx(torsoMain, 0, 0, 0, 0, 0, 0, 1.06, 1.0, 0.76);
  const chestDetail = [
    torsoScaled,
    // Sculpted deltoid shoulder caps
    tx(new THREE.SphereGeometry(0.066, 12, 10), 0.17, 0.435, 0, 0, 0, 0, 1.0, 0.92, 0.92),
    tx(new THREE.SphereGeometry(0.066, 12, 10), -0.17, 0.435, 0, 0, 0, 0, 1.0, 0.92, 0.92),
    // Subtle collar hem
    tx(new THREE.TorusGeometry(0.068, 0.012, 8, 16), 0, 0.495, 0.004, Math.PI / 2, 0, 0),
  ];
  const torsoBelt = [
    tx(new THREE.CylinderGeometry(0.142, 0.146, 0.045, 20), 0, -0.01, 0, 0, 0, 0, 1.05, 1.0, 0.78),
    tx(new THREE.BoxGeometry(0.054, 0.036, 0.022), 0, -0.01, 0.115),
  ];

  // 2. PelvisMesh: sculpted tapered hip basin
  const pelvis = tx(
    latheProfile([
      [0.01, -0.11], [0.11, -0.1], [0.148, -0.04], [0.152, 0.03], [0.138, 0.075], [0.01, 0.08],
    ], 18),
    0, 0, 0, 0, 0, 0, 1.04, 1.0, 0.78,
  );

  // 3. UpperArmMesh: sculpted deltoid -> bicep -> elbow taper (pivot at shoulder y=0, goes down to -0.30)
  const upperArm = latheProfile([
    [0.01, 0.045], [0.056, 0.025], [0.062, -0.02], [0.056, -0.09],
    [0.058, -0.16], [0.049, -0.24], [0.046, -0.295], [0.01, -0.32],
  ], 14);

  // 4. ForeArmMesh: sculpted brachioradialis -> wrist taper (pivot at elbow y=0, goes down to -0.26)
  const foreArm = latheProfile([
    [0.01, 0.035], [0.045, 0.015], [0.048, -0.045], [0.043, -0.12],
    [0.035, -0.2], [0.031, -0.255], [0.01, -0.27],
  ], 14);

  // 5. HandMesh: sculpted palm + curled finger cluster + thumb (zero blocky mittens)
  const handGeos = [
    tx(new THREE.SphereGeometry(0.035, 10, 10), 0, -0.022, 0.006, 0, 0, 0, 0.92, 1.22, 0.68),
    tx(new THREE.CapsuleGeometry(0.011, 0.038, 4, 8), -0.02, -0.068, 0.014, 0.22, 0, 0),
    tx(new THREE.CapsuleGeometry(0.011, 0.042, 4, 8), -0.006, -0.072, 0.015, 0.24, 0, 0),
    tx(new THREE.CapsuleGeometry(0.011, 0.04, 4, 8), 0.008, -0.07, 0.014, 0.22, 0, 0),
    tx(new THREE.CapsuleGeometry(0.01, 0.032, 4, 8), 0.021, -0.062, 0.012, 0.2, 0, 0),
    tx(new THREE.CapsuleGeometry(0.012, 0.032, 4, 8), -0.03, -0.038, 0.022, 0.35, 0, 0.45),
  ];

  // 6. ThighMesh: anatomical quad/hamstring curve (pivot at hip y=0, goes down to -0.44)
  const thigh = tx(
    latheProfile([
      [0.01, 0.06], [0.088, 0.02], [0.094, -0.06], [0.089, -0.16],
      [0.078, -0.28], [0.066, -0.39], [0.06, -0.44], [0.01, -0.465],
    ], 16),
    0, 0, 0, 0, 0, 0, 0.96, 1.0, 1.05,
  );

  // 7. ShinMesh: sculpted patella -> gastrocnemius calf -> ankle taper (pivot at knee y=0, goes down to -0.41)
  const shin = tx(
    latheProfile([
      [0.01, 0.04], [0.058, 0.01], [0.064, -0.07], [0.068, -0.15],
      [0.056, -0.25], [0.044, -0.34], [0.042, -0.405], [0.01, -0.42],
    ], 16),
    0, 0, -0.004, 0, 0, 0, 0.94, 1.0, 1.06,
  );

  // 8. ShoeMesh: sleek sculpted low-top sneaker + cushioned rubber midsole
  const shoeUpper = [
    tx(new THREE.SphereGeometry(0.052, 12, 10), 0, 0.026, 0.018, 0, 0, 0, 0.95, 0.72, 1.9),
    tx(new THREE.SphereGeometry(0.044, 12, 10), 0, 0.022, 0.092, 0, 0, 0, 0.98, 0.62, 1.1),
    tx(new THREE.CylinderGeometry(0.046, 0.048, 0.042, 12), 0, 0.052, -0.018),
  ];
  const shoeSole = [
    tx(new THREE.CapsuleGeometry(0.046, 0.135, 6, 10), 0, 0.006, 0.036, Math.PI / 2, 0, 0, 1.05, 1.0, 0.36),
  ];

  return encodeGLB([
    { name: 'TorsoMesh', primitives: [{ geo: mergeSimple(chestDetail), materialIndex: 0 }, { geo: mergeSimple(torsoBelt), materialIndex: 1 }] },
    { name: 'PelvisMesh', primitives: [{ geo: pelvis, materialIndex: 0 }] },
    { name: 'UpperArmMesh', primitives: [{ geo: upperArm, materialIndex: 0 }] },
    { name: 'ForeArmMesh', primitives: [{ geo: foreArm, materialIndex: 0 }] },
    { name: 'HandMesh', primitives: [{ geo: mergeSimple(handGeos), materialIndex: 0 }] },
    { name: 'ThighMesh', primitives: [{ geo: thigh, materialIndex: 0 }] },
    { name: 'ShinMesh', primitives: [{ geo: shin, materialIndex: 0 }] },
    { name: 'ShoeMesh', primitives: [{ geo: mergeSimple(shoeUpper), materialIndex: 0 }, { geo: mergeSimple(shoeSole), materialIndex: 1 }] },
  ], mats);
}

// ========================================================================= HANDCRAFTED PROPS
function buildCrateGlb(): Buffer {
  const mats: MatSpec[] = [
    { name: 'wood', baseColorFactor: hexToRgba(0x9a6d3f), metallicFactor: 0.04, roughnessFactor: 0.82 },
    { name: 'iron', baseColorFactor: hexToRgba(0x2b2f36), metallicFactor: 0.78, roughnessFactor: 0.38 },
  ];
  const wood: THREE.BufferGeometry[] = [tx(new THREE.BoxGeometry(0.86, 0.86, 0.86), 0, 0.45, 0)];
  const iron: THREE.BufferGeometry[] = [];
  for (const s of [-0.43, 0.43]) {
    wood.push(tx(new THREE.BoxGeometry(0.92, 0.12, 0.06), 0, 0.08, s));
    wood.push(tx(new THREE.BoxGeometry(0.92, 0.12, 0.06), 0, 0.82, s));
    wood.push(tx(new THREE.BoxGeometry(0.06, 0.12, 0.92), s, 0.08, 0));
    wood.push(tx(new THREE.BoxGeometry(0.06, 0.12, 0.92), s, 0.82, 0));
    wood.push(tx(new THREE.BoxGeometry(0.09, 0.88, 0.05), 0, 0.45, s * 1.03, 0, 0, 0.78));
    wood.push(tx(new THREE.BoxGeometry(0.05, 0.88, 0.09), s * 1.03, 0.45, 0, 0.78, 0, 0));
  }
  for (const sx of [-0.44, 0.44]) {
    for (const sz of [-0.44, 0.44]) {
      iron.push(tx(new THREE.BoxGeometry(0.08, 0.92, 0.08), sx, 0.45, sz));
    }
  }
  return encodeGLB([{ name: 'prop_crate', primitives: [{ geo: mergeSimple(wood), materialIndex: 0 }, { geo: mergeSimple(iron), materialIndex: 1 }] }], mats);
}

function buildBarrelGlb(): Buffer {
  const mats: MatSpec[] = [
    { name: 'steel', baseColorFactor: hexToRgba(0xc43628), metallicFactor: 0.56, roughnessFactor: 0.34 },
    { name: 'band', baseColorFactor: hexToRgba(0xe6ecf2), metallicFactor: 0.75, roughnessFactor: 0.28 },
  ];
  const body = latheProfile([
    [0.01, 0], [0.33, 0], [0.34, 0.04], [0.33, 0.08], [0.33, 0.31],
    [0.352, 0.34], [0.33, 0.37], [0.33, 0.65], [0.352, 0.68], [0.33, 0.71],
    [0.33, 0.94], [0.345, 0.98], [0.31, 0.99], [0.31, 0.96], [0.01, 0.96],
  ], 20);
  const band = [
    tx(new THREE.CylinderGeometry(0.338, 0.338, 0.22, 20, 1, true), 0, 0.51, 0),
    tx(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 10), 0.14, 0.97, 0.04),
    tx(new THREE.CylinderGeometry(0.024, 0.024, 0.035, 10), -0.14, 0.97, -0.04),
  ];
  return encodeGLB([{ name: 'prop_barrel', primitives: [{ geo: body, materialIndex: 0 }, { geo: mergeSimple(band), materialIndex: 1 }] }], mats);
}

function buildBinGlb(): Buffer {
  const mats: MatSpec[] = [
    { name: 'bin_body', baseColorFactor: hexToRgba(0x284e42), metallicFactor: 0.45, roughnessFactor: 0.42 },
    { name: 'bin_trim', baseColorFactor: hexToRgba(0x1b1e22), metallicFactor: 0.68, roughnessFactor: 0.36 },
  ];
  const body: THREE.BufferGeometry[] = [
    tx(new THREE.CylinderGeometry(0.32, 0.26, 0.88, 16), 0, 0.44, 0),
    tx(new THREE.SphereGeometry(0.32, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), 0, 0.88, 0),
  ];
  const trim: THREE.BufferGeometry[] = [
    tx(new THREE.TorusGeometry(0.322, 0.024, 8, 18), 0, 0.88, 0, Math.PI / 2, 0, 0),
    tx(new THREE.CylinderGeometry(0.29, 0.31, 0.07, 16), 0, 0.035, 0),
    tx(new THREE.BoxGeometry(0.28, 0.14, 0.08), 0, 0.97, 0.26),
  ];
  return encodeGLB([{ name: 'prop_bin', primitives: [{ geo: mergeSimple(body), materialIndex: 0 }, { geo: mergeSimple(trim), materialIndex: 1 }] }], mats);
}

function buildPalmGlb(): Buffer {
  const mats: MatSpec[] = [
    { name: 'bark', baseColorFactor: hexToRgba(0x7c6148), metallicFactor: 0.02, roughnessFactor: 0.9 },
    { name: 'frond', baseColorFactor: hexToRgba(0x2f7d3a), metallicFactor: 0.04, roughnessFactor: 0.64, doubleSided: true },
    { name: 'coconut', baseColorFactor: hexToRgba(0x52371e), metallicFactor: 0.05, roughnessFactor: 0.78 },
  ];
  const bark: THREE.BufferGeometry[] = [];
  const fronds: THREE.BufferGeometry[] = [];
  const nuts: THREE.BufferGeometry[] = [];

  // Gently curving segmented trunk with organic flared root base extending -0.25m below ground
  let cx = 0, cz = 0;
  const segs = 9;
  const totalH = 9.2;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const y0 = -0.25 + t0 * (totalH + 0.25);
    const y1 = -0.25 + t1 * (totalH + 0.25);
    const h = y1 - y0;
    const bendX = Math.sin(t1 * 1.4) * 0.45;
    const bendZ = Math.cos(t1 * 0.9) * 0.18 - 0.18;
    const rBot = i === 0 ? 0.36 : 0.25 - t0 * 0.1;
    const rTop = 0.24 - t1 * 0.1;
    bark.push(tx(new THREE.CylinderGeometry(rTop, rBot, h + 0.08, 10), (cx + bendX) * 0.5, (y0 + y1) * 0.5, (cz + bendZ) * 0.5, (bendZ - cz) * 0.25, 0, -(bendX - cx) * 0.25));
    cx = bendX;
    cz = bendZ;
  }
  // Coconuts tucked tightly beneath crownshaft
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    nuts.push(tx(new THREE.SphereGeometry(0.14, 8, 8), cx + Math.cos(a) * 0.22, totalH - 0.22, cz + Math.sin(a) * 0.22));
  }
  // 11 gracefully arched multi-segment palm fronds
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + (i % 2) * 0.18;
    const elev = i % 2 === 0 ? 0.36 : 0.12;
    const dirX = Math.cos(a), dirZ = Math.sin(a);
    let px = cx, py = totalH, pz = cz;
    for (let s = 0; s < 4; s++) {
      const segLen = 0.85 - s * 0.08;
      const pitch = elev - s * 0.34;
      const nx = px + dirX * Math.cos(pitch) * segLen;
      const ny = py + Math.sin(pitch) * segLen;
      const nz = pz + dirZ * Math.cos(pitch) * segLen;
      const w = 0.56 - s * 0.11;
      fronds.push(tx(new THREE.BoxGeometry(segLen, 0.045, w), (px + nx) * 0.5, (py + ny) * 0.5, (pz + nz) * 0.5, 0, -a, pitch));
      px = nx; py = ny; pz = nz;
    }
  }
  return encodeGLB([{
    name: 'prop_palm',
    primitives: [
      { geo: mergeSimple(bark), materialIndex: 0 },
      { geo: mergeSimple(fronds), materialIndex: 1 },
      { geo: mergeSimple(nuts), materialIndex: 2 },
    ],
  }], mats);
}

function buildLampGlb(): Buffer {
  const mats: MatSpec[] = [
    { name: 'iron', baseColorFactor: hexToRgba(0x222830), metallicFactor: 0.78, roughnessFactor: 0.34 },
    { name: 'bulb', baseColorFactor: hexToRgba(0xfff4d4), metallicFactor: 0.05, roughnessFactor: 0.15, emissiveFactor: [1.0, 0.9, 0.65] },
  ];
  const iron: THREE.BufferGeometry[] = [
    // Fluted coastal base plinth extending -0.2m below sidewalk
    tx(latheProfile([[0.01, -0.2], [0.24, -0.2], [0.24, 0.18], [0.18, 0.45], [0.14, 0.9], [0.09, 1.05], [0.065, 6.2], [0.01, 6.25]], 12), 0, 0, 0),
    // Curved luminaire arm + cobra-head hood
    tx(new THREE.CylinderGeometry(0.045, 0.055, 1.35, 8), 0, 6.32, 0.62, 1.35, 0, 0),
    tx(new THREE.SphereGeometry(0.24, 12, 8), 0, 6.46, 1.32, 0, 0, 0, 0.82, 0.38, 1.65),
  ];
  const bulb: THREE.BufferGeometry[] = [
    tx(new THREE.BoxGeometry(0.26, 0.04, 0.5), 0, 6.36, 1.34),
  ];
  return encodeGLB([{ name: 'prop_lamp', primitives: [{ geo: mergeSimple(iron), materialIndex: 0 }, { geo: mergeSimple(bulb), materialIndex: 1 }] }], mats);
}

// ========================================================================= HANDCRAFTED AIRCRAFT
function buildAircraftGlb(isJet: boolean): Buffer {
  const body: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];

  if (isJet) {
    const fy = 1.65;
    // Sleek lathe-sculpted fuselage from pointed radome to tailcone
    const fuse = latheProfile([
      [0.01, 5.4], [0.32, 4.8], [0.74, 3.6], [0.92, 1.8],
      [0.92, -2.6], [0.68, -4.4], [0.26, -5.6], [0.01, -5.9],
    ], 18);
    body.push(tx(fuse, 0, fy, 0, Math.PI / 2, 0, 0));
    glass.push(tx(new THREE.SphereGeometry(0.78, 14, 10), 0, fy + 0.34, 3.45, 0, 0, 0, 0.88, 0.62, 1.45));
    // Swept main wings with upturned winglets
    for (const s of [-1, 1]) {
      body.push(tx(new THREE.BoxGeometry(6.4, 0.16, 2.2), s * 3.4, fy - 0.14, -0.35, 0, s * -0.38, s * 0.04));
      body.push(tx(new THREE.BoxGeometry(0.14, 0.92, 0.78), s * 6.45, fy + 0.38, -1.55, 0.25, 0, s * -0.22));
      // Underwing turbofan engine pods + intake rings
      trim.push(tx(new THREE.CylinderGeometry(0.42, 0.36, 1.85, 16), s * 2.3, fy - 0.62, 0.15, Math.PI / 2, 0, 0));
      body.push(tx(new THREE.TorusGeometry(0.42, 0.055, 8, 16), s * 2.3, fy - 0.62, 1.06));
      // Main landing gear struts & dual wheels
      trim.push(tx(new THREE.CylinderGeometry(0.06, 0.06, 1.25, 8), s * 1.4, 0.92, -0.4));
      trim.push(tx(new THREE.CylinderGeometry(0.32, 0.32, 0.26, 14), s * 1.4, 0.32, -0.4, 0, 0, Math.PI / 2));
    }
    // Nose gear + swept T-tail
    trim.push(tx(new THREE.CylinderGeometry(0.055, 0.055, 1.15, 8), 0, 0.88, 3.4));
    trim.push(tx(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12), 0, 0.24, 3.4, 0, 0, Math.PI / 2));
    body.push(tx(new THREE.BoxGeometry(0.18, 2.45, 1.65), 0, fy + 1.42, -4.45, -0.34, 0, 0));
    body.push(tx(new THREE.BoxGeometry(4.6, 0.12, 1.1), 0, fy + 2.48, -4.95));
  } else {
    const fy = 1.18;
    const fuse = latheProfile([
      [0.01, 3.55], [0.42, 3.25], [0.64, 2.2], [0.66, 0.4],
      [0.52, -1.6], [0.24, -3.7], [0.01, -4.05],
    ], 16);
    body.push(tx(fuse, 0, fy, 0, Math.PI / 2, 0, 0));
    glass.push(tx(new THREE.BoxGeometry(1.12, 0.56, 1.45), 0, fy + 0.42, 1.35, -0.22, 0, 0));
    body.push(tx(new THREE.BoxGeometry(11.4, 0.16, 1.68), 0, fy + 0.72, 0.85));
    body.push(tx(new THREE.BoxGeometry(3.7, 0.1, 0.9), 0, fy + 0.18, -3.55));
    body.push(tx(new THREE.BoxGeometry(0.12, 1.38, 1.12), 0, fy + 0.78, -3.45, -0.22, 0, 0));
    // Spinner & twin prop blades
    trim.push(tx(new THREE.ConeGeometry(0.18, 0.36, 12), 0, fy, 3.68, Math.PI / 2, 0, 0));
    trim.push(tx(new THREE.BoxGeometry(0.14, 1.95, 0.04), 0, fy, 3.56));
    for (const s of [-1, 1]) {
      trim.push(tx(new THREE.CylinderGeometry(0.045, 0.045, 1.35, 8), s * 1.1, 0.65, 1.3, 0, 0, s * 0.25));
      trim.push(tx(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), s * 1.25, 0.32, 1.3, 0, 0, Math.PI / 2));
      trim.push(tx(new THREE.CylinderGeometry(0.032, 0.032, 2.1, 6), s * 1.65, fy + 0.15, 0.85, 0, 0, s * -0.92));
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

// ========================================================================= HANDCRAFTED WEAPONS
function buildWeaponPackGlb(): Buffer {
  const gunMats: MatSpec[] = [
    { name: 'gunmetal', baseColorFactor: hexToRgba(0x282d35), metallicFactor: 0.88, roughnessFactor: 0.28 },
    { name: 'grip_wood', baseColorFactor: hexToRgba(0x613c22), metallicFactor: 0.06, roughnessFactor: 0.72 },
    { name: 'polymer', baseColorFactor: hexToRgba(0x16181d), metallicFactor: 0.2, roughnessFactor: 0.54 },
    { name: 'brass', baseColorFactor: hexToRgba(0xd4a842), metallicFactor: 0.9, roughnessFactor: 0.22 },
  ];
  const pistolMetal = [
    tx(new THREE.BoxGeometry(0.048, 0.058, 0.24), 0, 0.042, 0.035),
    tx(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 10), 0, 0.048, 0.175, Math.PI / 2, 0, 0),
    tx(new THREE.BoxGeometry(0.014, 0.014, 0.025), 0, 0.075, 0.13),
  ];
  const pistolGrip = [
    tx(new THREE.BoxGeometry(0.042, 0.125, 0.062), 0, -0.042, -0.058, -0.24, 0, 0),
    tx(new THREE.BoxGeometry(0.018, 0.032, 0.065), 0, -0.008, 0.012),
  ];

  const smgMetal = [
    tx(new THREE.BoxGeometry(0.064, 0.088, 0.36), 0, 0.032, 0.02),
    tx(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 12), 0, 0.042, 0.29, Math.PI / 2, 0, 0),
    tx(new THREE.BoxGeometry(0.036, 0.022, 0.22), 0, 0.084, 0.02),
  ];
  const smgPoly = [
    tx(new THREE.BoxGeometry(0.042, 0.175, 0.048), 0, -0.092, 0.085, 0.14, 0, 0),
    tx(new THREE.BoxGeometry(0.044, 0.125, 0.056), 0, -0.048, -0.1, -0.22, 0, 0),
    tx(new THREE.BoxGeometry(0.032, 0.065, 0.14), 0, 0.02, -0.22),
  ];

  const rifleMetal = [
    tx(new THREE.BoxGeometry(0.066, 0.092, 0.54), 0, 0.04, 0.05),
    tx(new THREE.CylinderGeometry(0.016, 0.016, 0.46, 12), 0, 0.052, 0.51, Math.PI / 2, 0, 0),
    tx(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 12), 0, 0.128, 0.02, Math.PI / 2, 0, 0),
    tx(new THREE.BoxGeometry(0.042, 0.032, 0.08), 0, 0.098, 0.02),
  ];
  const rifleWood = [
    tx(new THREE.BoxGeometry(0.056, 0.105, 0.29), 0, 0.008, -0.34),
    tx(new THREE.BoxGeometry(0.048, 0.185, 0.064), 0, -0.082, 0.12, 0.2, 0, 0),
    tx(new THREE.BoxGeometry(0.056, 0.068, 0.24), 0, 0.038, 0.32),
  ];

  const rpgMetal = [
    tx(new THREE.CylinderGeometry(0.056, 0.056, 1.08, 16), 0, 0.04, 0, Math.PI / 2, 0, 0),
    tx(new THREE.CylinderGeometry(0.072, 0.054, 0.16, 14), 0, 0.04, -0.58, Math.PI / 2, 0, 0),
    tx(new THREE.ConeGeometry(0.092, 0.26, 14), 0, 0.04, 0.62, Math.PI / 2, 0, 0),
  ];
  const rpgWood = [
    tx(new THREE.CylinderGeometry(0.066, 0.066, 0.34, 14), 0, 0.04, 0.14, Math.PI / 2, 0, 0),
    tx(new THREE.BoxGeometry(0.046, 0.135, 0.056), 0, -0.058, 0.12, -0.18, 0, 0),
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
