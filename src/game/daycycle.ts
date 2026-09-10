import * as THREE from 'three';

/** Real seconds per full day/night cycle. */
export const CYCLE_SECONDS = 300;
/** Fraction of the cycle the sun is above the horizon; t = 0 is sunrise. */
export const DAY_FRACTION = 0.6;
/** Phase the game starts at (mid-morning). */
export const START_PHASE = 0.15;
/** Time multiplier while the fast-forward key is held. */
export const FAST_FORWARD = 40;

/** Wraps a phase into [0, 1). */
function wrap(t: number): number {
  return ((t % 1) + 1) % 1;
}

/** Unitless sun height: +1 at noon, 0 at sunrise/sunset, −1 at midnight. */
export function sunElevation(t: number): number {
  const phase = wrap(t);
  if (phase < DAY_FRACTION) return Math.sin((Math.PI * phase) / DAY_FRACTION);
  return -Math.sin((Math.PI * (phase - DAY_FRACTION)) / (1 - DAY_FRACTION));
}

/** Angle along the sun's path: −π/2 at sunrise, 0 at noon, π/2 at sunset, π at midnight. */
function pathAngle(t: number): number {
  const phase = wrap(t);
  if (phase < DAY_FRACTION) return (Math.PI * phase) / DAY_FRACTION - Math.PI / 2;
  return Math.PI / 2 + (Math.PI * (phase - DAY_FRACTION)) / (1 - DAY_FRACTION);
}

/** Direction of the old fixed sun; the path's noon point. */
const NOON = new THREE.Vector3(40, 60, 20).normalize();
/** Horizontal unit vector perpendicular to NOON: where the sun sets. */
const EAST = new THREE.Vector3(NOON.z, 0, -NOON.x).normalize();

/** Unit vector from the origin toward the sun at phase `t`, written into `out`. */
export function sunDirection(t: number, out: THREE.Vector3): THREE.Vector3 {
  const theta = pathAngle(t);
  return out.copy(NOON).multiplyScalar(Math.cos(theta)).addScaledVector(EAST, Math.sin(theta));
}

/** Everything the sky and lights need at one moment; written in place each step. */
export interface Lighting {
  /** Background and fog colour. */
  sky: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  moonColor: THREE.Color;
  moonIntensity: number;
  fogNear: number;
  fogFar: number;
  /** Star field opacity. */
  stars: number;
  /** Brightness multiplier for materials that ignore lighting (the ground grid). */
  unlit: number;
}

export function createLighting(): Lighting {
  return {
    sky: new THREE.Color(),
    sunColor: new THREE.Color(),
    sunIntensity: 0,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 0,
    moonColor: new THREE.Color(),
    moonIntensity: 0,
    fogNear: 0,
    fogFar: 0,
    stars: 0,
    unlit: 1,
  };
}

interface Keyframe {
  elevation: number;
  lighting: Lighting;
}

function keyframe(
  elevation: number,
  sky: number,
  sun: number,
  sunIntensity: number,
  hemiSky: number,
  hemiGround: number,
  hemiIntensity: number,
  moon: number,
  moonIntensity: number,
  fogNear: number,
  fogFar: number,
  stars: number,
  unlit: number,
): Keyframe {
  return {
    elevation,
    lighting: {
      sky: new THREE.Color(sky),
      sunColor: new THREE.Color(sun),
      sunIntensity,
      hemiSky: new THREE.Color(hemiSky),
      hemiGround: new THREE.Color(hemiGround),
      hemiIntensity,
      moonColor: new THREE.Color(moon),
      moonIntensity,
      fogNear,
      fogFar,
      stars,
      unlit,
    },
  };
}

/** Palette rows from noon down to deep night; dawn and dusk share them. */
const KEYFRAMES: readonly Keyframe[] = [
  keyframe(1.0, 0x87ceeb, 0xffffff, 1.2, 0xffffff, 0x3fa34d, 0.6, 0x8fa8d8, 0, 60, 200, 0, 1.0),
  keyframe(0.05, 0xf08a5c, 0xffa050, 0.2, 0xffc8a0, 0x3f6a3d, 0.35, 0x8fa8d8, 0, 50, 170, 0, 0.7),
  keyframe(-0.05, 0x1c1f4f, 0xffa050, 0, 0x6070b0, 0x1e3a2a, 0.2, 0x8fa8d8, 0.1, 40, 140, 0.4, 0.35),
  keyframe(-1.0, 0x070a1e, 0xffa050, 0, 0x3a4a80, 0x101c18, 0.15, 0x8fa8d8, 0.3, 30, 120, 1, 0.2),
];

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** Interpolates the palette for a sun elevation in [−1, 1] into `out`. */
export function lightingAt(elevation: number, out: Lighting): Lighting {
  const first = KEYFRAMES[0];
  const last = KEYFRAMES[KEYFRAMES.length - 1];
  if (!first || !last) throw new Error('empty palette');
  let above = first;
  let below = last;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const hi = KEYFRAMES[i];
    const lo = KEYFRAMES[i + 1];
    if (!hi || !lo) continue;
    if (elevation <= hi.elevation && elevation >= lo.elevation) {
      above = hi;
      below = lo;
      break;
    }
  }
  const span = above.elevation - below.elevation;
  const clamped = Math.min(above.elevation, Math.max(below.elevation, elevation));
  const k = span > 0 ? (above.elevation - clamped) / span : 0;
  const a = above.lighting;
  const b = below.lighting;
  out.sky.lerpColors(a.sky, b.sky, k);
  out.sunColor.lerpColors(a.sunColor, b.sunColor, k);
  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, k);
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, k);
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, k);
  out.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, k);
  out.moonColor.lerpColors(a.moonColor, b.moonColor, k);
  out.moonIntensity = lerp(a.moonIntensity, b.moonIntensity, k);
  out.fogNear = lerp(a.fogNear, b.fogNear, k);
  out.fogFar = lerp(a.fogFar, b.fogFar, k);
  out.stars = lerp(a.stars, b.stars, k);
  out.unlit = lerp(a.unlit, b.unlit, k);
  return out;
}
