import * as THREE from 'three';
import { CHARACTER_RADIUS, separate, type Blocker, type Colliders } from './collision';
import { Legs } from './legs';
import { forwardOf, groundSpeed, stepForward, turnToward } from './motion';
import { seededRandom } from './props';
import type { Circle } from './repel';
import type { SoundCue } from './sounds';
import { MELEE_REACH, nearestInCone, segmentHitsCylinder } from './targeting';
import type { Terrain } from './terrain';
import { applyTopple, beginTopple, type Topple } from './topple';

export const MAX_HEALTH = 8;
/** Collision and arrow-hit radius (XZ). */
export const BODY_RADIUS = 0.9;
export const ARROW_HEIGHT = 1.6;
/** Player distance that wakes it, or re-engages a retreat. */
export const DETECT_RANGE = 10;
/** Player distance (from the cat) at which it gives up. */
export const LOSE_RANGE = 25;
/** Distance from the bed beyond which it gives up. */
export const LEASH_RANGE = 25;
/** A retreat only turns back into a chase once the cat is this much inside the leash, so the edge doesn't flap. */
export const LEASH_SLACK = 5;
export const WAKE_DURATION = 0.8;
export const CHASE_SPEED = 5;
export const RETREAT_SPEED = 3;
/** Seconds of slack beyond the straight-line walk home; a cat wedged on the cave's corners sleeps where it stands. */
export const RETREAT_GRACE = 4;
export const TURN_SPEED = 4;
export const POUNCE_MIN = 3;
export const POUNCE_MAX = 6;
/** Minimum dot(forward, toward player) to pounce. */
export const POUNCE_FACING = 0.9;
export const POUNCE_CROUCH = 0.4;
export const POUNCE_LEAP = 0.6;
export const POUNCE_HOP = 1.2;
/** Player within this (XZ) of the landed cat takes the hit. */
export const POUNCE_HIT_RADIUS = 1.5;
export const POUNCE_DAMAGE = 2;
export const POUNCE_COOLDOWN = 3;
export const SWIPE_RANGE = 1.8;
export const SWIPE_DURATION = 0.7;
/** Hit frame of the swipe, seconds after it starts. */
export const SWIPE_HIT_TIME = 0.5;
export const SWIPE_REACH = 2.2;
export const SWIPE_DAMAGE = 1;
export const SWIPE_COOLDOWN = 1.2;
/** A player higher than this (jumping) dodges both attacks, as with the sword. */
export const HIT_MAX_PLAYER_Y = 1.2;
/** Seconds per health point healed while retreating or asleep. */
export const HEAL_INTERVAL = 2;
export const MEOW_MIN = 8;
export const MEOW_MAX = 20;
export const COLLAPSE_DURATION = 0.9;
export const SINK_DURATION = 1.2;
/** Repel circle at the bed once the cat is dead. */
export const SHELTER_RADIUS = 6;

/** Rig scale: about twice the mouse's bulk while the ears still clear the cave's lintel. */
const SCALE = 1.5;
const ARRIVE_DISTANCE = 0.3;
/** How far the rig sinks into the ground asleep (the legs fold away). */
const SLEEP_DROP = 0.3;
const SLEEP_HEAD_PITCH = 0.45;
const CROUCH_DIP = 0.2;
const FLASH_DURATION = 0.3;
const FLASH_COLOR = new THREE.Color(0xff2a1a);
const EYE_ASLEEP = new THREE.Color(0x700000);
const EYE_AWAKE = new THREE.Color(0xff2020);
const EYE_AWAKE_SCALE = 1.4;
const HALO_ASLEEP = 0.15;
const HALO_AWAKE = 0.35;
const SINK_DEPTH = 2;

/** Template; cloned per cat so the hit flash tints only it. */
const furTemplate = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9, emissive: FLASH_COLOR, emissiveIntensity: 0 });
const bodyGeo = new THREE.CapsuleGeometry(0.32, 1.0, 8, 16);
const headGeo = new THREE.SphereGeometry(0.3, 16, 14);
const earGeo = new THREE.ConeGeometry(0.1, 0.22, 8);
const muzzleGeo = new THREE.SphereGeometry(0.14, 10, 8);
const whiskerGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.45, 4);
const eyeGeo = new THREE.SphereGeometry(0.07, 10, 8);
const haloGeo = new THREE.SphereGeometry(0.175, 10, 8);
const whiskerMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.5 });

// Per-frame scratch vectors.
const toPlayer = new THREE.Vector3();
const toBed = new THREE.Vector3();
/** Scratch for the cat's own facing; not `forward`, which `hit` takes as a parameter (`no-shadow`). */
const facingDir = new THREE.Vector3();
const stepStart = new THREE.Vector3();
const shotDir = new THREE.Vector3();

type Behaviour =
  | { kind: 'sleep'; meowIn: number }
  | { kind: 'wake'; t: number }
  | { kind: 'chase' }
  | { kind: 'pounce'; t: number }
  | { kind: 'swipe'; t: number }
  | { kind: 'retreat'; remaining: number }
  | { kind: 'collapse'; t: number; topple: Topple }
  | { kind: 'sink'; t: number }
  | { kind: 'gone' };

export interface CatUpdate {
  /** Hearts of damage dealt to the player this frame. */
  damage: number;
  /** Where the cat stood when it landed a blow, for knockback. */
  hitFrom: THREE.Vector3 | undefined;
  /** Where the cat finished collapsing, on that one frame. */
  killed: THREE.Vector3 | undefined;
  /** Positioned sounds the cat made this frame. */
  sounds: SoundCue[];
}

interface Rig {
  object: THREE.Group;
  frontPivot: THREE.Group;
  front: Legs;
  back: Legs;
  head: THREE.Group;
  eyes: THREE.Mesh[];
  eyeMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
}

function buildRig(fur: THREE.Material): Rig {
  const hip = Legs.HIP_HEIGHT;
  const object = new THREE.Group();
  object.scale.setScalar(SCALE);

  const body = new THREE.Mesh(bodyGeo, fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = hip + 0.3;
  body.castShadow = true;

  const legStyle = { leg: fur, foot: fur };
  const back = new Legs(legStyle);
  back.root.position.set(0, hip, -0.45);
  const front = new Legs(legStyle);
  const frontPivot = new THREE.Group();
  frontPivot.position.set(0, hip, 0.45);
  frontPivot.add(front.root);

  const head = new THREE.Group();
  head.position.set(0, hip + 0.55, 0.75);
  const skull = new THREE.Mesh(headGeo, fur);
  skull.castShadow = true;
  const muzzle = new THREE.Mesh(muzzleGeo, fur);
  muzzle.position.set(0, -0.06, 0.26);
  head.add(skull, muzzle);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, fur);
    ear.position.set(side * 0.14, 0.28, 0);
    ear.rotation.z = side * -0.25;
    ear.castShadow = true;
    head.add(ear);
    for (const tilt of [-0.2, 0, 0.2]) {
      const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
      whisker.position.set(side * 0.2, -0.08 + tilt * 0.1, 0.3);
      whisker.rotation.set(0, 0, Math.PI / 2 + side * tilt);
      head.add(whisker);
    }
  }

  const eyeMat = new THREE.MeshBasicMaterial({ color: EYE_ASLEEP, fog: false });
  const haloMat = new THREE.MeshBasicMaterial({ color: EYE_AWAKE, fog: false, transparent: true, opacity: HALO_ASLEEP, depthWrite: false });
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 0.06, 0.24);
    eye.add(new THREE.Mesh(haloGeo, haloMat));
    head.add(eye);
    eyes.push(eye);
  }

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, hip + 0.3, -0.8),
    new THREE.Vector3(0.1, hip + 0.1, -1.2),
    new THREE.Vector3(0.3, hip + 0.4, -1.5),
    new THREE.Vector3(0.35, hip + 0.9, -1.55),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.05, 6), fur);
  tail.castShadow = true;

  object.add(body, back.root, frontPivot, head, tail);
  return { object, frontPivot, front, back, head, eyes, eyeMat, haloMat };
}

/** Front-leg pitch over a swipe: raise (negative = forward/up), slam past neutral, ease back. */
function swipeAngle(t: number): number {
  const RAISE_END = 0.3;
  if (t < RAISE_END) return THREE.MathUtils.lerp(0, -1.0, t / RAISE_END);
  if (t < SWIPE_HIT_TIME) return THREE.MathUtils.lerp(-1.0, 0.2, (t - RAISE_END) / (SWIPE_HIT_TIME - RAISE_END));
  return THREE.MathUtils.lerp(0.2, 0, (t - SWIPE_HIT_TIME) / (SWIPE_DURATION - SWIPE_HIT_TIME));
}

/** The boss: a big cat asleep in its cave that chases, pounces and swipes when disturbed. */
export class Cat {
  private readonly rig: Rig;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly bed: { readonly x: number; readonly z: number; readonly yaw: number };
  private readonly bedForward: THREE.Vector3;
  private readonly rand = seededRandom(13);
  private behaviour: Behaviour;
  private hp = MAX_HEALTH;
  private pounceCooldown = 0;
  private swipeCooldown = 0;
  private healTimer = 0;
  /** Vertical offset from the ground set by the current pose (asleep, crouched, mid-leap). */
  private lift = 0;
  /** Terrain height under the cat as of the last `update`; the killing hit drops the body onto it. */
  private groundY = 0;
  /** Leap endpoints, taken when the crouch ends; instance scratch so a pounce allocates nothing. */
  private readonly pounceFrom = new THREE.Vector3();
  private readonly pounceTo = new THREE.Vector3();
  private moved = false;
  /** Cues from `hit`/`shoot`, which run before `update` in a frame; flushed there. */
  private pending: SoundCue[] = [];
  private readonly playerBlocker: Blocker = { position: new THREE.Vector3(), radius: CHARACTER_RADIUS };
  private readonly resolveOptions: { blockers: readonly Blocker[] };
  private readonly shelter: Circle[] = [];
  /** `nearestInCone` wants a list; this one holds only the cat. */
  private readonly self: readonly Cat[];

  constructor(scene: THREE.Scene, bed: { readonly x: number; readonly z: number; readonly yaw: number }) {
    this.material = furTemplate.clone();
    this.rig = buildRig(this.material);
    this.bed = bed;
    this.bedForward = forwardOf(bed.yaw, new THREE.Vector3());
    this.rig.object.position.set(bed.x, 0, bed.z);
    this.rig.object.rotation.y = bed.yaw;
    this.resolveOptions = { blockers: [this.playerBlocker] };
    this.self = [this];
    this.behaviour = { kind: 'sleep', meowIn: this.rollMeow() };
    this.pose(1);
    this.rig.object.position.y = this.lift;
    scene.add(this.rig.object);
  }

  get position(): THREE.Vector3 {
    return this.rig.object.position;
  }

  get health(): number {
    return this.hp;
  }

  /** Up and about: the boss bar shows. */
  get awake(): boolean {
    const { kind } = this.behaviour;
    return kind === 'wake' || kind === 'chase' || kind === 'pounce' || kind === 'swipe' || kind === 'retreat';
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** True if the cat moved or changed pose last frame. */
  get animating(): boolean {
    return this.moved;
  }

  /** Empty while alive; one shelter circle at the bed once dead. */
  get repellers(): readonly Circle[] {
    return this.shelter;
  }

  /** Applies one melee hit of `damage` if the cat is in front of `origin` within reach. */
  hit(origin: THREE.Vector3, forward: THREE.Vector3, damage: number): boolean {
    if (this.dead) return false;
    const found = nearestInCone(this.self, (c) => c.position, origin, forward, MELEE_REACH + BODY_RADIUS);
    if (!found) return false;
    this.applyHit(damage, found.away);
    return true;
  }

  /** Applies one arrow hit if the segment `from`→`to` passes through the body. */
  shoot(from: THREE.Vector3, to: THREE.Vector3): boolean {
    if (this.dead) return false;
    if (segmentHitsCylinder(from, to, this.position, BODY_RADIUS, ARROW_HEIGHT) === undefined) return false;
    this.applyHit(1, shotDir.subVectors(to, from).setY(0).normalize());
    return true;
  }

  update(dt: number, playerPos: THREE.Vector3, colliders: Colliders, terrain: Terrain): CatUpdate {
    const sounds = this.pending;
    this.pending = [];
    let damage = 0;
    let hitFrom: THREE.Vector3 | undefined;
    let killed: THREE.Vector3 | undefined;
    let speed = 0;
    let landed = false;
    this.moved = false;
    const { object } = this.rig;
    const pos = object.position;

    toPlayer.subVectors(playerPos, pos).setY(0);
    const playerDist = toPlayer.length();
    toBed.set(this.bed.x - pos.x, 0, this.bed.z - pos.z);
    const bedDist = toBed.length();
    const pace = terrain.speedFactor(pos.x, pos.z);
    stepStart.copy(pos);
    this.pounceCooldown = Math.max(0, this.pounceCooldown - dt);
    this.swipeCooldown = Math.max(0, this.swipeCooldown - dt);

    const b = this.behaviour;
    switch (b.kind) {
      case 'sleep':
        b.meowIn -= dt;
        if (b.meowIn <= 0) {
          sounds.push({ kind: 'catMeow', at: pos.clone() });
          b.meowIn = this.rollMeow();
        }
        this.heal(dt);
        if (turnToward(object, this.bedForward, TURN_SPEED, dt)) this.moved = true;
        if (playerDist < DETECT_RANGE) this.wakeUp(sounds);
        break;

      case 'wake': {
        b.t += dt;
        const k = Math.min(b.t / WAKE_DURATION, 1);
        // Smoothstep: the rise starts and ends gently.
        this.pose(1 - k * k * (3 - 2 * k));
        if (k >= 1) this.behaviour = { kind: 'chase' };
        this.moved = true;
        break;
      }

      case 'chase': {
        const facing = playerDist > 0 ? forwardOf(object.rotation.y, facingDir).dot(toPlayer) / playerDist : 1;
        if (playerDist > LOSE_RANGE || bedDist > LEASH_RANGE) {
          this.behaviour = { kind: 'retreat', remaining: bedDist / RETREAT_SPEED + RETREAT_GRACE };
        } else if (playerDist < SWIPE_RANGE && this.swipeCooldown <= 0) {
          this.behaviour = { kind: 'swipe', t: 0 };
          sounds.push({ kind: 'catHiss', at: pos.clone() });
        } else if (playerDist >= POUNCE_MIN && playerDist <= POUNCE_MAX && facing >= POUNCE_FACING && this.pounceCooldown <= 0) {
          this.behaviour = { kind: 'pounce', t: 0 };
        } else {
          turnToward(object, toPlayer, TURN_SPEED, dt);
          // Stops short of the player (just inside SWIPE_RANGE) rather than shoving them during the swipe cooldown.
          stepForward(object, Math.min(CHASE_SPEED * pace * dt, Math.max(0, playerDist - SWIPE_RANGE * 0.8)));
          speed = CHASE_SPEED;
        }
        this.moved = true;
        break;
      }

      case 'pounce':
        landed = this.pounce(b, dt, playerPos, sounds);
        this.moved = true;
        break;

      case 'swipe':
        if (this.swipe(b, dt, playerDist, playerPos)) {
          damage += SWIPE_DAMAGE;
          hitFrom = pos.clone();
        }
        this.moved = true;
        break;

      case 'retreat':
        this.heal(dt);
        if (playerDist < DETECT_RANGE && this.insideLeash()) {
          this.behaviour = { kind: 'chase' };
        } else if (bedDist < ARRIVE_DISTANCE) {
          pos.x = this.bed.x;
          pos.z = this.bed.z;
          this.behaviour = { kind: 'sleep', meowIn: this.rollMeow() };
          this.pose(1);
        } else if ((b.remaining -= dt) <= 0) {
          // Wedged on the cave's corners: give up and sleep here.
          this.behaviour = { kind: 'sleep', meowIn: this.rollMeow() };
          this.pose(1);
        } else {
          turnToward(object, toBed, TURN_SPEED, dt);
          stepForward(object, Math.min(RETREAT_SPEED * pace * dt, bedDist));
          speed = RETREAT_SPEED;
        }
        this.moved = true;
        break;

      case 'collapse': {
        b.t += dt;
        const k = Math.min(b.t / COLLAPSE_DURATION, 1);
        applyTopple(object, b.topple, k);
        if (k >= 1) {
          killed = pos.clone();
          this.behaviour = { kind: 'sink', t: 0 };
        }
        this.moved = true;
        break;
      }

      case 'sink': {
        b.t += dt;
        const k = Math.min(b.t / SINK_DURATION, 1);
        pos.y = terrain.heightAt(pos.x, pos.z) - SINK_DEPTH * k;
        if (k >= 1) {
          object.visible = false;
          this.behaviour = { kind: 'gone' };
        }
        this.moved = true;
        break;
      }

      case 'gone':
        // Sunk and hidden: nothing to move; cues queued by a stray hit still flush.
        return { damage, hitFrom, killed, sounds };
    }

    if (this.hp > 0) {
      // Living: out of obstacles (shoving boulders, but never into the player) and off the player.
      this.playerBlocker.position.copy(playerPos);
      if (colliders.resolve(pos, BODY_RADIUS, this.resolveOptions)) this.moved = true;
      if (separate(playerPos, CHARACTER_RADIUS, pos, BODY_RADIUS)) this.moved = true;
      this.groundY = terrain.heightAt(pos.x, pos.z);
      const y = this.groundY + this.lift;
      if (pos.y !== y) {
        pos.y = y;
        this.moved = true;
      }
      if (landed && Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z) <= POUNCE_HIT_RADIUS && playerPos.y < HIT_MAX_PLAYER_Y) {
        damage += POUNCE_DAMAGE;
        hitFrom = pos.clone();
      }
    }

    // Legs follow the distance actually covered, so a cat held at a wall doesn't run on the spot.
    speed = groundSpeed(speed, stepStart, pos, dt);
    const front = this.rig.front.update(dt, speed, true);
    const back = this.rig.back.update(dt, speed, true);
    if (front.moved || back.moved) this.moved = true;
    this.updateFlash(dt);
    return { damage, hitFrom, killed, sounds };
  }

  /**
   * Crouch, then a leap at where the player stood when the crouch ended, moved by per-frame
   * deltas so obstacles stop it short. Returns true on the frame the leap completes.
   */
  private pounce(b: Extract<Behaviour, { kind: 'pounce' }>, dt: number, playerPos: THREE.Vector3, sounds: SoundCue[]): boolean {
    const pos = this.rig.object.position;
    const from = this.pounceFrom;
    const to = this.pounceTo;
    const before = b.t;
    b.t += dt;
    if (before < POUNCE_CROUCH) {
      this.lift = -CROUCH_DIP * Math.min(b.t / POUNCE_CROUCH, 1);
      if (b.t < POUNCE_CROUCH) return false;
      // Aim is taken now; the leap carries on regardless of where the player goes.
      from.set(pos.x, 0, pos.z);
      to.set(playerPos.x, 0, playerPos.z);
      const reach = to.distanceTo(from);
      if (reach > POUNCE_MAX) to.sub(from).multiplyScalar(POUNCE_MAX / reach).add(from);
      if (reach > 0) this.rig.object.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      sounds.push({ kind: 'catYowl', at: pos.clone() });
    }
    const sPrev = Math.min(Math.max(before - POUNCE_CROUCH, 0) / POUNCE_LEAP, 1);
    const s = Math.min((b.t - POUNCE_CROUCH) / POUNCE_LEAP, 1);
    pos.x += (to.x - from.x) * (s - sPrev);
    pos.z += (to.z - from.z) * (s - sPrev);
    // The hop rides `lift`; the terrain height under it is applied after the switch like every pose.
    this.lift = POUNCE_HOP * Math.sin(Math.PI * s);
    if (s < 1) return false;
    this.lift = 0;
    this.pounceCooldown = POUNCE_COOLDOWN;
    this.behaviour = { kind: 'chase' };
    return true;
  }

  /** Raises the front legs and slams them down; returns true on the hit frame if the player is in reach. */
  private swipe(b: Extract<Behaviour, { kind: 'swipe' }>, dt: number, playerDist: number, playerPos: THREE.Vector3): boolean {
    const before = b.t;
    b.t += dt;
    const t = Math.min(b.t, SWIPE_DURATION);
    this.rig.frontPivot.rotation.x = swipeAngle(t);
    turnToward(this.rig.object, toPlayer, TURN_SPEED, dt);
    const hit = before < SWIPE_HIT_TIME && b.t >= SWIPE_HIT_TIME && playerDist < SWIPE_REACH && playerPos.y < HIT_MAX_PLAYER_Y;
    if (b.t >= SWIPE_DURATION) {
      this.rig.frontPivot.rotation.x = 0;
      this.swipeCooldown = SWIPE_COOLDOWN;
      this.behaviour = { kind: 'chase' };
    }
    return hit;
  }

  private wakeUp(sounds: SoundCue[]): void {
    this.behaviour = { kind: 'wake', t: 0 };
    this.healTimer = 0;
    this.moved = true;
    sounds.push({ kind: 'catYowl', at: this.position.clone() });
  }

  /** Close enough to the bed that a chase may start again (hysteresis against the leash edge). */
  private insideLeash(): boolean {
    const pos = this.position;
    return Math.hypot(pos.x - this.bed.x, pos.z - this.bed.z) < LEASH_RANGE - LEASH_SLACK;
  }

  /** Damages the cat, flashing it; a sleeper wakes, a retreater turns back, the last hit topples it. */
  private applyHit(damage: number, away: THREE.Vector3): void {
    this.hp = Math.max(0, this.hp - damage);
    this.material.emissiveIntensity = 1;
    this.moved = true;
    if (this.hp > 0) {
      this.pending.push({ kind: 'catHurt', at: this.position.clone() });
      if (this.behaviour.kind === 'sleep') this.wakeUp(this.pending);
      else if (this.behaviour.kind === 'retreat' && this.insideLeash()) this.behaviour = { kind: 'chase' };
      return;
    }
    this.pending.push({ kind: 'catDeath', at: this.position.clone() });
    this.rig.frontPivot.rotation.x = 0;
    this.lift = 0;
    // Dying skips the per-frame height sync, so drop a sunk, crouched or airborne body onto the ground now.
    this.position.y = this.groundY;
    for (const eye of this.rig.eyes) eye.visible = false;
    this.behaviour = { kind: 'collapse', t: 0, topple: beginTopple(this.rig.object, away) };
    this.shelter.push({ position: new THREE.Vector3(this.bed.x, 0, this.bed.z), radius: SHELTER_RADIUS });
  }

  /** One health point per `HEAL_INTERVAL`, up to full. */
  private heal(dt: number): void {
    if (this.hp >= MAX_HEALTH) return;
    this.healTimer += dt;
    if (this.healTimer < HEAL_INTERVAL) return;
    this.healTimer -= HEAL_INTERVAL;
    this.hp = Math.min(MAX_HEALTH, this.hp + 1);
  }

  /** Sleep pose at `sleepiness` 1 (sunk, head down, eyes dim) through 0 (standing, eyes flared). */
  private pose(sleepiness: number): void {
    const { head, eyes, eyeMat, haloMat } = this.rig;
    this.lift = -SLEEP_DROP * sleepiness;
    head.rotation.x = SLEEP_HEAD_PITCH * sleepiness;
    eyeMat.color.copy(EYE_AWAKE).lerp(EYE_ASLEEP, sleepiness);
    haloMat.opacity = HALO_AWAKE + (HALO_ASLEEP - HALO_AWAKE) * sleepiness;
    const scale = EYE_AWAKE_SCALE + (1 - EYE_AWAKE_SCALE) * sleepiness;
    for (const eye of eyes) eye.scale.setScalar(scale);
  }

  private updateFlash(dt: number): void {
    if (this.material.emissiveIntensity <= 0) return;
    this.material.emissiveIntensity = Math.max(0, this.material.emissiveIntensity - dt / FLASH_DURATION);
    this.moved = true;
  }

  private rollMeow(): number {
    return MEOW_MIN + this.rand() * (MEOW_MAX - MEOW_MIN);
  }
}
