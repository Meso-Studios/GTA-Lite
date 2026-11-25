// Procedural HDR PMREM Reflection Environments for Simulated RTX (Day, Golden Sunset, Vice Neon Night).
// Zero external HDR files — dynamically reflects tropical sky, sun disk, city skyline & neon accents onto cars, glass, ocean & wet streets.
import * as THREE from 'three';

export type RtxEnvPhase = 'day' | 'sunset' | 'night';

export interface RtxEnvPack {
  day: THREE.Texture;
  sunset: THREE.Texture;
  night: THREE.Texture;
  flat: THREE.Texture;
  dispose: () => void;
}

function buildSkyReflectionScene(phase: RtxEnvPhase | 'flat'): THREE.Scene {
  const sc = new THREE.Scene();

  // Gradient reflection dome
  const domeGeo = new THREE.SphereGeometry(40, 24, 16);
  const pos = domeGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);

  const zenith = new THREE.Color(
    phase === 'day' ? 0x0f56c8 : phase === 'sunset' ? 0x24175e : phase === 'night' ? 0x040818 : 0x5c6878,
  );
  const horizon = new THREE.Color(
    phase === 'day' ? 0x9ed8ff : phase === 'sunset' ? 0xff7b36 : phase === 'night' ? 0x162048 : 0x8d97a4,
  );
  const ground = new THREE.Color(
    phase === 'day' ? 0x5c5244 : phase === 'sunset' ? 0x3b222c : phase === 'night' ? 0x080a14 : 0x3b3d42,
  );
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 40;
    if (y >= 0) {
      const t = Math.pow(y, 0.55);
      c.copy(horizon).lerp(zenith, t);
    } else {
      const t = Math.min(1, Math.pow(-y, 0.5));
      c.copy(horizon).multiplyScalar(0.75).lerp(ground, t);
    }
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false });
  sc.add(new THREE.Mesh(domeGeo, domeMat));

  if (phase === 'flat') return sc;

  // High-intensity HDR specular light panels & sun disk for razor-sharp car clearcoat & glass reflections
  const addPanel = (color: number, intensity: number, x: number, y: number, z: number, sx: number, sy: number) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), mat);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    sc.add(m);
  };

  if (phase === 'day') {
    // Crisp tropical sun hotspot + azure zenith contrast + vivid turquoise ocean reflection band + skyline contrast
    addPanel(0xfff7e0, 8.2, 22, 18, 12, 8.0, 8.0);
    addPanel(0xd8f0ff, 2.2, -18, 16, -14, 18, 7);
    addPanel(0x1ac8ee, 1.6, 0, -3.5, 24, 38, 5.0);
    addPanel(0xffe0b2, 1.35, -24, 3.5, 6, 16, 4.5);
    addPanel(0x1f2b3a, 0.75, 24, 2.0, -10, 20, 4.2);
    addPanel(0x283648, 0.75, -16, 2.0, 20, 18, 3.8);
  } else if (phase === 'sunset') {
    // Fiery Leonida golden-hour sun + coral/magenta horizon ribbon + warm Art Deco neon glints
    addPanel(0xff9b38, 8.5, 26, 7, 10, 9.5, 6.8);
    addPanel(0xff4a7a, 2.8, 18, 4, -18, 22, 5.2);
    addPanel(0xff8e42, 2.5, -22, 6, 12, 20, 5.2);
    addPanel(0x5d4eff, 1.7, -10, 18, -16, 20, 8);
    addPanel(0x18e0ff, 2.4, -18, 1.5, -18, 12, 2.4);
    addPanel(0xff2ea8, 2.4, 16, 1.5, 20, 12, 2.4);
  } else {
    // Vice Neon Night: vivid magenta, electric cyan, warm sodium streetlights & skyline window bands
    addPanel(0xff289c, 4.8, 22, 4, 10, 14, 3.2);
    addPanel(0x14e0ff, 4.6, -22, 4, -10, 14, 3.2);
    addPanel(0xff9c32, 3.5, 10, 3, -22, 12, 2.6);
    addPanel(0x7444ff, 2.9, -12, 5, 22, 14, 3.2);
    addPanel(0xffdca0, 3.2, 0, 12, 24, 6, 2.2);
    addPanel(0xffdca0, 2.9, 24, 10, -8, 5, 2.2);
    addPanel(0x74a4ff, 1.9, -16, 22, 8, 9, 6);
  }

  return sc;
}

/** Bakes 4 lightweight procedural PMREM reflection cubemaps (Day, Golden Sunset, Vice Neon Night, Flat non-RTX) once at startup. */
export function buildRtxEnvironments(renderer: THREE.WebGLRenderer): RtxEnvPack {
  const pm = new THREE.PMREMGenerator(renderer);
  pm.compileEquirectangularShader();

  const bake = (phase: RtxEnvPhase | 'flat') => {
    const sc = buildSkyReflectionScene(phase);
    const rt = pm.fromScene(sc, 0.035);
    sc.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.geometry.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else mat?.dispose();
      }
    });
    return rt;
  };

  const dayRt = bake('day');
  const sunsetRt = bake('sunset');
  const nightRt = bake('night');
  const flatRt = bake('flat');
  pm.dispose();

  return {
    day: dayRt.texture,
    sunset: sunsetRt.texture,
    night: nightRt.texture,
    flat: flatRt.texture,
    dispose() {
      dayRt.dispose();
      sunsetRt.dispose();
      nightRt.dispose();
      flatRt.dispose();
    },
  };
}
