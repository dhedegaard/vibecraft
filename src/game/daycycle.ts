import * as THREE from 'three';
import { seededRandom } from './props';

/** Real seconds per full day/night cycle. */
export const CYCLE_SECONDS = 300;
/** Fraction of the cycle the sun is above the horizon; t = 0 is sunrise. */
export const DAY_FRACTION = 0.6;
/** Phase the game starts at: 14:00, one minute before sunset at normal speed. */
export const START_PHASE = 0.4;
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

/** In-game clock for phase `t`: sunrise is 06:00, sunset 18:00, each half of the cycle spans 12 h. */
export function clockTime(t: number): { hours: number; minutes: number } {
  const phase = wrap(t);
  const hoursOfDay =
    phase < DAY_FRACTION
      ? 6 + (12 * phase) / DAY_FRACTION
      : (18 + (12 * (phase - DAY_FRACTION)) / (1 - DAY_FRACTION)) % 24;
  // Nearest minute, so 12 * 0.15 / 0.6 reads 09:00 rather than 08:59.
  const total = Math.round(hoursOfDay * 60) % (24 * 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** `clockTime` as "HH:MM". */
export function formatClock(t: number): string {
  const { hours, minutes } = clockTime(t);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

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
  // Out of [-1, 1]: no segment matched, so above/below still span the whole table and
  // clamping `elevation` collapses k to 0 or 1, i.e. the nearest end row.
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

/** Normal of the sun's path plane; the star field rotates about it with the sun. */
const PATH_AXIS = new THREE.Vector3().crossVectors(NOON, EAST).normalize();
/** Phase advance between applied visual steps: 0.5 s at normal speed, every frame at 40x. */
const STEP = 1 / 600;
const LIGHT_DISTANCE = 75;
const SKY_DISTANCE = 150;
const STAR_DISTANCE = 160;
const STAR_COUNT = 400;
const SUN_DISC_RADIUS = 6;
const MOON_DISC_RADIUS = 4;

const sunDiscGeo = new THREE.SphereGeometry(SUN_DISC_RADIUS, 16, 12);
const moonDiscGeo = new THREE.SphereGeometry(MOON_DISC_RADIUS, 16, 12);
const sunDiscMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false });
const moonDiscMat = new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false });

function buildStars(): THREE.BufferGeometry {
  const rand = seededRandom(11);
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Uniform on the sphere: z uniform in [-1, 1], angle uniform.
    const z = rand() * 2 - 1;
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    positions[i * 3] = Math.cos(angle) * r * STAR_DISTANCE;
    positions[i * 3 + 1] = Math.sin(angle) * r * STAR_DISTANCE;
    positions[i * 3 + 2] = z * STAR_DISTANCE;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

/**
 * Drives the sun, moon, sky colours, fog and stars through a day/night cycle.
 * Visible state is applied in coarse steps so `animating` is false most frames.
 */
export class DayCycle {
  readonly moon: THREE.DirectionalLight;

  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly fog: THREE.Fog;
  private readonly grid: THREE.GridHelper;
  private readonly background = new THREE.Color();
  private readonly sky = new THREE.Group();
  private readonly sunDisc = new THREE.Mesh(sunDiscGeo, sunDiscMat);
  private readonly moonDisc = new THREE.Mesh(moonDiscGeo, moonDiscMat);
  // Per instance, not a module constant like sunDiscMat/moonDiscMat: apply() mutates its opacity.
  private readonly starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  private readonly stars = new THREE.Points(buildStars(), this.starMat);
  private readonly lighting = createLighting();
  private readonly dir = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly snapped = new THREE.Vector3();
  private current = START_PHASE;
  private applied = START_PHASE;
  private active = false;

  constructor(
    scene: THREE.Scene,
    sun: THREE.DirectionalLight,
    hemisphere: THREE.HemisphereLight,
    fog: THREE.Fog,
    grid: THREE.GridHelper,
  ) {
    this.sun = sun;
    this.hemisphere = hemisphere;
    this.fog = fog;
    this.grid = grid;
    scene.background = this.background;

    this.moon = new THREE.DirectionalLight(0x8fa8d8, 0);
    this.moon.castShadow = false;
    this.moon.shadow.mapSize.set(1024, 1024);
    this.moon.shadow.camera.far = sun.shadow.camera.far;
    this.moon.shadow.camera.left = sun.shadow.camera.left;
    this.moon.shadow.camera.right = sun.shadow.camera.right;
    this.moon.shadow.camera.top = sun.shadow.camera.top;
    this.moon.shadow.camera.bottom = sun.shadow.camera.bottom;
    // Targets must be in the scene for their matrices to update once they leave the origin.
    scene.add(this.moon, this.moon.target, sun.target);

    this.sunDisc.name = 'sun-disc';
    this.moonDisc.name = 'moon-disc';
    this.stars.name = 'stars';
    this.sky.add(this.sunDisc, this.moonDisc, this.stars);
    scene.add(this.sky);

    this.apply();
    this.placeLights();
  }

  /** Current phase in [0, 1): 0 sunrise, 0.6 sunset. */
  get phase(): number {
    return this.current;
  }

  /** True only on a frame where the visible state stepped. */
  get animating(): boolean {
    return this.active;
  }

  /** `focus` is what the shadow frustum follows (the player). */
  update(dt: number, fastForward: boolean, cameraPos: THREE.Vector3, focus: THREE.Vector3): void {
    this.current = wrap(this.current + (dt * (fastForward ? FAST_FORWARD : 1)) / CYCLE_SECONDS);
    // Sky objects sit at a fixed distance from the eye so they never parallax.
    this.sky.position.copy(cameraPos);
    this.focus.copy(focus);
    this.active = wrap(this.current - this.applied) >= STEP;
    if (this.active) this.apply();
    this.placeLights();
  }

  /** Aims both lights at the focus so the shadow box travels with the player. */
  private placeLights(): void {
    this.placeLight(this.sun, 1);
    this.placeLight(this.moon, -1);
  }

  /**
   * Puts `light` `LIGHT_DISTANCE` from the focus along `sign * dir`, with the focus snapped
   * to the light's shadow texel grid so a sliding frustum doesn't make shadow edges shimmer.
   */
  private placeLight(light: THREE.DirectionalLight, sign: 1 | -1): void {
    const d = this.dir;
    // Light-space axes; the sun never gets near the zenith, so UP is a safe reference.
    this.right.crossVectors(THREE.Object3D.DEFAULT_UP, d).normalize();
    this.up.crossVectors(d, this.right);
    const cam = light.shadow.camera;
    const texel = (cam.right - cam.left) / light.shadow.mapSize.width;
    const x = this.focus.dot(this.right);
    const y = this.focus.dot(this.up);
    this.snapped
      .copy(this.focus)
      .addScaledVector(this.right, Math.round(x / texel) * texel - x)
      .addScaledVector(this.up, Math.round(y / texel) * texel - y);
    light.target.position.copy(this.snapped);
    light.position.copy(this.snapped).addScaledVector(d, sign * LIGHT_DISTANCE);
  }

  private apply(): void {
    this.applied = this.current;
    const elevation = sunElevation(this.current);
    const l = lightingAt(elevation, this.lighting);
    sunDirection(this.current, this.dir);

    this.sun.color.copy(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.moon.color.copy(l.moonColor);
    this.moon.intensity = l.moonIntensity;
    this.hemisphere.color.copy(l.hemiSky);
    this.hemisphere.groundColor.copy(l.hemiGround);
    this.hemisphere.intensity = l.hemiIntensity;
    this.background.copy(l.sky);
    this.fog.color.copy(l.sky);
    this.fog.near = l.fogNear;
    this.fog.far = l.fogFar;
    // The grid's line material ignores lights; its vertex colours are scaled by the material colour.
    this.grid.material.color.setScalar(l.unlit);

    this.sunDisc.position.copy(this.dir).multiplyScalar(SKY_DISTANCE);
    this.sunDisc.visible = elevation >= 0;
    this.moonDisc.position.copy(this.dir).multiplyScalar(-SKY_DISTANCE);
    this.moonDisc.visible = elevation < 0;
    this.starMat.opacity = l.stars;
    this.stars.visible = l.stars > 0;
    this.stars.setRotationFromAxisAngle(PATH_AXIS, pathAngle(this.current));

    // One shadow map at a time: hand it over at the horizon, where both lights are dim.
    const sunUp = elevation > 0;
    this.sun.castShadow = sunUp;
    this.moon.castShadow = !sunUp;
  }
}
