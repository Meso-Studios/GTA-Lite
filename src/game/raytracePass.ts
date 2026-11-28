/**
 * True WebGL2 Screen-Space Ray-Tracing Post-Process Pass (RayTracePass)
 *
 * Replaces washed-out bloom-only fake RTX with actual per-pixel screen-space ray marching
 * driven by the live hardware DepthTexture:
 *   1. Screen-Space Ray-Marched Reflections (SSR) with binary search refinement
 *   2. Screen-Space Ray-Marched Sun Contact Shadows (SSRT) along the live sun vector
 *   3. Screen-Space Ray-Traced Ambient Occlusion + 1-Bounce Indirect Color Bleeding (RTAO/SSGI)
 *   4. Crisp Vibrant Neutral-Filmic Tone Preservation (NO desaturated grey haze, NO milky bloom)
 */
import * as THREE from 'three';

export interface RayTraceUniforms {
  tDiffuse: { value: THREE.Texture | null };
  tDepth: { value: THREE.DepthTexture | null };
  uProj: { value: THREE.Matrix4 };
  uInvProj: { value: THREE.Matrix4 };
  uSunDirView: { value: THREE.Vector3 };
  uResolution: { value: THREE.Vector2 };
  uNear: { value: number };
  uFar: { value: number };
  uRtxStrength: { value: number };
  uIsNight: { value: number };
  uWetness: { value: number };
  uMotionBlur: { value: number };
  uBlurVec: { value: THREE.Vector2 };
  uGrayscale: { value: number };
  uSlomoVignette: { value: number };
}

export interface RayTracePostFX {
  motionBlur?: number;
  blurX?: number;
  blurY?: number;
  grayscale?: number;
  slomoVignette?: number;
}

const RAYTRACE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const RAYTRACE_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec3 uSunDirView;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uRtxStrength;
uniform float uIsNight;
uniform float uWetness;
uniform float uMotionBlur;
uniform vec2 uBlurVec;
uniform float uGrayscale;
uniform float uSlomoVignette;

varying vec2 vUv;

float readDepth(vec2 uv) {
  return texture2D(tDepth, clamp(uv, vec2(0.001), vec2(0.999))).r;
}

vec3 viewPosFromDepth(vec2 uv, float depth) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uInvProj * clip;
  return view.xyz / max(view.w, 1e-5);
}

vec2 projectToUv(vec3 viewPos) {
  vec4 clip = uProj * vec4(viewPos, 1.0);
  vec3 ndc = clip.xyz / max(clip.w, 1e-5);
  return ndc.xy * 0.5 + 0.5;
}

// Discontinuity-aware view-space normal reconstruction (prevents black edge halos)
vec3 reconstructNormal(vec2 uv, vec3 P, float depth) {
  vec2 px = 1.0 / uResolution;
  float dR = readDepth(uv + vec2(px.x, 0.0));
  float dL = readDepth(uv - vec2(px.x, 0.0));
  float dU = readDepth(uv + vec2(0.0, px.y));
  float dD = readDepth(uv - vec2(0.0, px.y));

  vec3 pR = viewPosFromDepth(uv + vec2(px.x, 0.0), dR);
  vec3 pL = viewPosFromDepth(uv - vec2(px.x, 0.0), dL);
  vec3 pU = viewPosFromDepth(uv + vec2(0.0, px.y), dU);
  vec3 pD = viewPosFromDepth(uv - vec2(0.0, px.y), dD);

  vec3 dx = (abs(pR.z - P.z) < abs(pL.z - P.z)) ? (pR - P) : (P - pL);
  vec3 dy = (abs(pU.z - P.z) < abs(pD.z - P.z)) ? (pU - P) : (P - pD);
  vec3 n = cross(dx, dy);
  float len = length(n);
  return len > 1e-6 ? n / len : vec3(0.0, 1.0, 0.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 applyCinematicPost(vec3 col, vec2 uv) {
  vec3 outCol = col;

  // Directional velocity / camera-turn motion blur (7-tap Gaussian weighted)
  if (uMotionBlur > 0.005) {
    float vecLen = length(uBlurVec);
    if (vecLen > 0.0004) {
      vec2 stepUv = uBlurVec * clamp(uMotionBlur, 0.0, 1.0);
      vec3 acc = outCol * 0.28;
      float wSum = 0.28;
      for (int i = -3; i <= 3; i++) {
        if (i == 0) continue;
        float fi = float(i) / 3.0;
        float w = exp(-fi * fi * 2.2) * 0.14;
        vec2 suv = clamp(uv + stepUv * fi, vec2(0.002), vec2(0.998));
        acc += texture2D(tDiffuse, suv).rgb * w;
        wSum += w;
      }
      outCol = mix(outCol, acc / wSum, clamp(uMotionBlur, 0.0, 0.92));
    }
  }

  // Subtle realistic optical sun glare when facing the daytime sun (warm atmospheric halo, zero plastic wash)
  if (uIsNight < 0.65 && uSunDirView.z < -0.15) {
    vec2 sunUv = projectToUv(uSunDirView * 120.0);
    if (sunUv.x > -0.35 && sunUv.x < 1.35 && sunUv.y > -0.35 && sunUv.y < 1.35) {
      vec2 d = (uv - sunUv) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
      float sunDist = length(d);
      float halo = exp(-sunDist * 4.4) * 0.11 + exp(-sunDist * 14.0) * 0.08;
      float sunDepth = readDepth(clamp(sunUv, vec2(0.01), vec2(0.99)));
      float vis = smoothstep(0.992, 0.9995, sunDepth) * (1.0 - uIsNight * 0.85);
      outCol += vec3(1.0, 0.92, 0.78) * halo * vis;
    }
  }

  // 30ft+ Pistol Headshot Slomo Monochrome Grayscale + Dramatic Vignette
  if (uGrayscale > 0.005) {
    float g = clamp(uGrayscale, 0.0, 1.0);
    float luma = dot(outCol, vec3(0.299, 0.587, 0.114));
    // Crisp noir S-curve contrast during killcam so silhouettes pop dramatically
    float noir = clamp((luma - 0.48) * 1.18 + 0.49, 0.0, 1.35);
    vec3 mono = vec3(noir * 0.97, noir * 0.99, noir * 1.02);
    outCol = mix(outCol, mono, g);
    vec2 v = uv * 2.0 - 1.0;
    float vigAmt = clamp(dot(v, v) * 0.34 * uSlomoVignette, 0.0, 0.52);
    outCol *= (1.0 - vigAmt);
  }

  return max(outCol, vec3(0.0));
}

void main() {
  vec4 baseSample = texture2D(tDiffuse, vUv);
  vec3 col = baseSample.rgb;
  float depth = readDepth(vUv);

  // Bypass RTX shading on sky / far horizon or when RTX is disabled, while still running motion blur & killcam grayscale
  if (depth >= 0.9996 || uRtxStrength <= 0.01) {
    gl_FragColor = vec4(applyCinematicPost(col, vUv), 1.0);
    return;
  }

  vec3 P = viewPosFromDepth(vUv, depth);
  float viewDist = -P.z;
  if (viewDist > 190.0) {
    gl_FragColor = vec4(applyCinematicPost(col, vUv), 1.0);
    return;
  }

  vec3 N = reconstructNormal(vUv, P, depth);
  vec3 V = normalize(-P);
  float NdotV = max(dot(N, V), 0.001);
  float jitter = hash12(vUv * uResolution);

  // Distance fade so distant mountains never pick up noisy screen-space hits
  float distFade = 1.0 - smoothstep(75.0, 175.0, viewDist);

  // -------------------------------------------------------------------------
  // 1. SCREEN-SPACE RAY-TRACED AMBIENT OCCLUSION + 1-BOUNCE GI COLOR BLEEDING
  // -------------------------------------------------------------------------
  float aoAccum = 0.0;
  vec3 giAccum = vec3(0.0);
  float radius = clamp(viewDist * 0.045, 0.45, 2.8);
  vec3 tangent = normalize(abs(N.y) < 0.9 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0)));
  vec3 bitangent = cross(N, tangent);

  const int AO_SAMPLES = 8;
  for (int i = 0; i < AO_SAMPLES; i++) {
    float fi = float(i);
    float angle = (fi + jitter) * 2.3999632; // golden angle
    float r = ((fi + 0.5) / float(AO_SAMPLES)) * radius;
    vec3 hemi = tangent * (cos(angle) * 0.78) + bitangent * (sin(angle) * 0.78) + N * (0.28 + 0.55 * fract(fi * 0.618 + jitter));
    vec3 samplePos = P + normalize(hemi) * r;
    vec2 suv = projectToUv(samplePos);
    if (suv.x < 0.01 || suv.x > 0.99 || suv.y < 0.01 || suv.y > 0.99) continue;

    float sd = readDepth(suv);
    if (sd >= 0.9996) continue;
    vec3 sP = viewPosFromDepth(suv, sd);
    vec3 diff = sP - P;
    float dLen = length(diff);
    if (dLen > 0.06 && dLen < radius * 1.45) {
      float nd = max(0.0, dot(N, diff / dLen) - 0.12);
      float rangeAtten = 1.0 - smoothstep(radius * 0.25, radius * 1.45, dLen);
      float occ = nd * rangeAtten;
      aoAccum += occ;
      vec3 sCol = texture2D(tDiffuse, suv).rgb;
      giAccum += sCol * occ * 0.58;
    }
  }
  float ao = 1.0 - clamp((aoAccum / float(AO_SAMPLES)) * 0.85, 0.0, 0.46) * distFade * uRtxStrength;
  vec3 giBounce = (giAccum / float(AO_SAMPLES)) * 0.36 * distFade * uRtxStrength;

  // -------------------------------------------------------------------------
  // 2. SCREEN-SPACE RAY-MARCHED SUN CONTACT SHADOWS (SSRT)
  // -------------------------------------------------------------------------
  float contactShadow = 1.0;
  float sunNdotL = dot(N, uSunDirView);
  if (sunNdotL > 0.06 && uIsNight < 0.75 && viewDist < 95.0) {
    vec3 rayStep = uSunDirView * clamp(viewDist * 0.012, 0.08, 0.52);
    vec3 rayP = P + N * 0.06 + rayStep * (0.4 + jitter * 0.6);
    float occHit = 0.0;
    for (int s = 0; s < 10; s++) {
      vec2 ruv = projectToUv(rayP);
      if (ruv.x < 0.01 || ruv.x > 0.99 || ruv.y < 0.01 || ruv.y > 0.99) break;
      float rd = readDepth(ruv);
      if (rd < 0.9995) {
        vec3 hitP = viewPosFromDepth(ruv, rd);
        float zDiff = hitP.z - rayP.z; // positive when surface is closer to camera than ray
        if (zDiff > 0.035 && zDiff < 0.95) {
          occHit = 1.0 - float(s) / 10.0;
          break;
        }
      }
      rayP += rayStep;
      rayStep *= 1.12;
    }
    float shadowFade = (1.0 - smoothstep(45.0, 95.0, viewDist)) * (1.0 - uIsNight * 0.85);
    contactShadow = 1.0 - occHit * 0.32 * shadowFade * uRtxStrength;
  }

  // -------------------------------------------------------------------------
  // 3. SCREEN-SPACE RAY-MARCHED REFLECTIONS (SSR) — PHYSICALLY RESTRAINED
  // -------------------------------------------------------------------------
  vec3 reflCol = vec3(0.0);
  float reflMask = 0.0;
  vec3 R = reflect(-V, N);
  // Only trace screen-space reflections on genuinely wet/rain surfaces (zero glassy sheen on dry matte floors/walls/roads)
  if (uWetness > 0.16 && R.z < -0.02 && viewDist < 95.0) {
    float fresnel = pow(1.0 - NdotV, 5.0);
    float upwardness = smoothstep(0.84, 0.98, N.y);
    float surfaceGloss = clamp(upwardness * uWetness * (0.14 + fresnel * 0.18), 0.0, 0.20);

    if (surfaceGloss > 0.05) {
      float stride = clamp(viewDist * 0.03, 0.35, 1.85);
      vec3 marchP = P + N * 0.08 + R * (stride * (0.35 + jitter * 0.65));
      vec3 prevP = P;
      bool hit = false;
      vec2 hitUv = vec2(0.0);

      for (int i = 0; i < 12; i++) {
        vec2 muv = projectToUv(marchP);
        if (muv.x < 0.005 || muv.x > 0.995 || muv.y < 0.005 || muv.y > 0.995) break;
        float md = readDepth(muv);
        if (md < 0.9995) {
          vec3 surfP = viewPosFromDepth(muv, md);
          float deltaZ = surfP.z - marchP.z;
          float thickness = stride * 1.45 + 0.25;
          if (deltaZ > 0.0 && deltaZ < thickness) {
            vec3 lo = prevP;
            vec3 hi = marchP;
            for (int b = 0; b < 3; b++) {
              vec3 mid = (lo + hi) * 0.5;
              vec2 buv = projectToUv(mid);
              float bd = readDepth(buv);
              vec3 bp = viewPosFromDepth(buv, bd);
              if (bp.z - mid.z > 0.0) hi = mid;
              else lo = mid;
            }
            hitUv = projectToUv(hi);
            hit = true;
            break;
          }
        }
        prevP = marchP;
        marchP += R * stride;
        stride *= 1.15;
      }

      if (hit) {
        vec2 edge = smoothstep(vec2(0.0), vec2(0.1), hitUv) * (1.0 - smoothstep(vec2(0.9), vec2(1.0), hitUv));
        float edgeFade = edge.x * edge.y;
        float rFade = (1.0 - smoothstep(45.0, 95.0, viewDist)) * edgeFade;
        reflCol = min(texture2D(tDiffuse, hitUv).rgb, vec3(1.25));
        reflMask = clamp(surfaceGloss * rFade * uRtxStrength, 0.0, 0.20);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. COMPOSE NATURAL NON-SHINY ARCHITECTURAL LIGHTING
  // -------------------------------------------------------------------------
  float softAo = mix(0.82, 1.0, ao);
  float softContact = mix(0.84, 1.0, contactShadow);
  vec3 lit = col * softAo * softContact + giBounce * (0.42 + 0.30 * col);
  lit = mix(lit, reflCol, reflMask);

  // Subtle sunlit atmospheric perspective on distant skyline
  float aerial = smoothstep(160.0, 820.0, viewDist) * (1.0 - uIsNight * 0.72) * 0.05 * uRtxStrength;
  vec3 sunScatter = mix(vec3(0.56, 0.76, 0.96), vec3(1.0, 0.86, 0.68), clamp(dot(normalize(P), uSunDirView) * 0.5 + 0.5, 0.0, 1.0));
  lit = mix(lit, lit + sunScatter * 0.16, aerial);

  // Clean grounded color balance (zero glossy washout)
  float outLuma = dot(lit, vec3(0.2126, 0.7152, 0.0722));
  lit = mix(vec3(outLuma), lit, 1.04);
  vec2 vig = vUv * 2.0 - 1.0;
  lit *= 1.0 - dot(vig, vig) * 0.015;

  gl_FragColor = vec4(applyCinematicPost(lit, vUv), 1.0);
}
`;

export const RTX_LIGHTING_LIMITS = {
  maxDryReflectionBlend: 0.0,
  maxWetReflectionBlend: 0.20,
  filmicSaturation: 1.04,
  dayExposure: 1.08,
  indoorEnvIntensity: 0.16,
} as const;

export class RayTracePipeline {
  private rt: THREE.WebGLRenderTarget;
  private quadScene: THREE.Scene;
  private quadCam: THREE.OrthographicCamera;
  private mat: THREE.ShaderMaterial;
  public uniforms: RayTraceUniforms;
  private _sunWorld = new THREE.Vector3();
  private _normalMat = new THREE.Matrix3();

  constructor(width: number, height: number, pixelRatio: number) {
    const rw = Math.max(2, Math.floor(width * pixelRatio));
    const rh = Math.max(2, Math.floor(height * pixelRatio));

    const depthTexture = new THREE.DepthTexture(rw, rh);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.format = THREE.DepthFormat;

    this.rt = new THREE.WebGLRenderTarget(rw, rh, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthTexture,
      samples: 0,
    });

    this.uniforms = {
      tDiffuse: { value: this.rt.texture },
      tDepth: { value: depthTexture },
      uProj: { value: new THREE.Matrix4() },
      uInvProj: { value: new THREE.Matrix4() },
      uSunDirView: { value: new THREE.Vector3(0.4, 0.7, -0.5).normalize() },
      uResolution: { value: new THREE.Vector2(rw, rh) },
      uNear: { value: 0.2 },
      uFar: { value: 1800 },
      uRtxStrength: { value: 1.0 },
      uIsNight: { value: 0.0 },
      uWetness: { value: 0.0 },
      uMotionBlur: { value: 0.0 },
      uBlurVec: { value: new THREE.Vector2(0, 0) },
      uGrayscale: { value: 0.0 },
      uSlomoVignette: { value: 0.0 },
    };

    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: RAYTRACE_VERT,
      fragmentShader: RAYTRACE_FRAG,
      depthWrite: false,
      depthTest: false,
    });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  public setSize(width: number, height: number, pixelRatio: number): void {
    const rw = Math.max(2, Math.floor(width * pixelRatio));
    const rh = Math.max(2, Math.floor(height * pixelRatio));
    if (this.rt.width === rw && this.rt.height === rh) return;
    this.rt.setSize(rw, rh);
    this.uniforms.uResolution.value.set(rw, rh);
  }

  public render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sunPosition: THREE.Vector3,
    isNightFactor: number,
    wetness: number,
    strength = 1.0,
    fx?: RayTracePostFX,
  ): void {
    // 1. Render full 3D scene + hardware depth texture into offscreen HalfFloat target
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    // 2. Update screen-space ray-tracing + motion blur + killcam grayscale uniforms
    this.uniforms.uProj.value.copy(camera.projectionMatrix);
    this.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    this.uniforms.uNear.value = camera.near;
    this.uniforms.uFar.value = camera.far;
    this.uniforms.uIsNight.value = isNightFactor;
    this.uniforms.uWetness.value = wetness;
    this.uniforms.uRtxStrength.value = strength;
    this.uniforms.uMotionBlur.value = fx?.motionBlur ?? 0;
    this.uniforms.uBlurVec.value.set(fx?.blurX ?? 0, fx?.blurY ?? 0);
    this.uniforms.uGrayscale.value = fx?.grayscale ?? 0;
    this.uniforms.uSlomoVignette.value = fx?.slomoVignette ?? 0;

    this._sunWorld.copy(sunPosition).normalize();
    this._normalMat.setFromMatrix4(camera.matrixWorldInverse);
    this.uniforms.uSunDirView.value.copy(this._sunWorld).applyMatrix3(this._normalMat).normalize();

    // 3. Execute Screen-Space Ray-Tracing + Cinematic Post pass directly to screen framebuffer
    renderer.setRenderTarget(prevTarget);
    renderer.render(this.quadScene, this.quadCam);
  }

  public dispose(): void {
    this.rt.depthTexture?.dispose();
    this.rt.dispose();
    this.mat.dispose();
  }
}
