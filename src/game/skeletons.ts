import * as THREE from 'three';
import { Arms } from './arms';
import { Legs } from './legs';
import { seededRandom } from './props';
import { Sword } from './sword';

const COUNT = 6;
const WALK_SPEED = 2;
const TURN_SPEED = 4;
/** Skeletons roam inside this square (metres), centred on the origin. */
const ROAM_EXTENT = 50;
const MIN_WALK = 6;
const MAX_WALK = 20;
const MIN_REST = 1.5;
const MAX_REST = 5;
const ARRIVE_DISTANCE = 0.3;
const HITS_TO_KILL = 2;
/** Axe reach and facing cone, matching the tree chop. */
const HIT_REACH = 2.8;
const HIT_FACING = 0.4;
const STAGGER_DURATION = 0.4;
const STAGGER_DISTANCE = 0.8;
const COLLAPSE_DURATION = 0.7;
const FLASH_DURATION = 0.3;
const FLASH_COLOR = new THREE.Color(0xff2a1a);
const RATTLE_ANGLE = 0.12;
const SINK_DURATION = 1.0;
/** Player distance at which a skeleton notices and starts chasing. */
const DETECT_RANGE = 8;
/** Player distance beyond which a chasing skeleton gives up. */
const LOSE_RANGE = 14;
const CHASE_SPEED = 3;
/** Close enough to start a sword swing. */
const ATTACK_RANGE = 1.7;
/** Player must still be this close on the hit frame to take damage. */
const SWORD_REACH = 2.3;
const ATTACK_COOLDOWN = 1.2;

/** Template; each skeleton clones it so a hit flash only tints that skeleton. */
const boneTemplate = new THREE.MeshStandardMaterial({ color: 0xe6e2d3, roughness: 0.8, emissive: FLASH_COLOR, emissiveIntensity: 0 });
const socket = new THREE.MeshStandardMaterial({ color: 0x111111 });

const skullGeo = new THREE.SphereGeometry(0.3, 14, 12);
const jawGeo = new THREE.BoxGeometry(0.3, 0.14, 0.26);
const socketGeo = new THREE.SphereGeometry(0.07, 8, 8);
const spineGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8);
const ribGeo = new THREE.TorusGeometry(0.3, 0.035, 6, 16);
const pelvisGeo = new THREE.BoxGeometry(0.5, 0.18, 0.28);

type Behaviour =
  | { kind: 'walk'; target: THREE.Vector3 }
  | { kind: 'rest'; remaining: number }
  | { kind: 'chase' }
  | { kind: 'attack'; cooldown: number }
  | { kind: 'stagger'; t: number; dir: THREE.Vector3 }
  | { kind: 'collapse'; t: number; axis: THREE.Vector3; upright: THREE.Quaternion }
  | { kind: 'sink'; t: number };

interface Skeleton {
  object: THREE.Group;
  legs: Legs;
  arms: Arms;
  sword: Sword;
  material: THREE.MeshStandardMaterial;
  health: number;
  /** Seconds of red hit flash remaining. */
  flash: number;
  behaviour: Behaviour;
}

function buildBody(bone: THREE.Material): THREE.Group {
  const hip = Legs.HIP_HEIGHT;
  const body = new THREE.Group();

  const pelvis = new THREE.Mesh(pelvisGeo, bone);
  pelvis.position.y = hip + 0.05;
  pelvis.castShadow = true;

  const spine = new THREE.Mesh(spineGeo, bone);
  spine.position.y = hip + 0.55;
  spine.castShadow = true;

  for (const y of [0.45, 0.65, 0.85]) {
    const rib = new THREE.Mesh(ribGeo, bone);
    rib.position.y = hip + y;
    rib.rotation.x = Math.PI / 2;
    rib.scale.z = 0.7;
    rib.castShadow = true;
    body.add(rib);
  }

  const skull = new THREE.Mesh(skullGeo, bone);
  skull.position.y = hip + 1.3;
  skull.castShadow = true;
  const jaw = new THREE.Mesh(jawGeo, bone);
  jaw.position.set(0, -0.24, 0.06);
  skull.add(jaw);
  for (const x of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(socketGeo, socket);
    eye.position.set(x, 0.05, 0.26);
    skull.add(eye);
  }

  body.add(pelvis, spine, skull);
  return body;
}

export interface SkeletonsUpdate {
  /** Where skeletons finished collapsing this frame. */
  killed: THREE.Vector3[];
  /** Hearts of damage dealt to the player this frame. */
  damage: number;
}

/** Skeletons that wander the world and chase and attack the player when close. */
export class Skeletons {
  private readonly skeletons: Skeleton[] = [];
  private readonly rand = seededRandom(7);
  private readonly scene: THREE.Scene;
  private moved = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (let i = 0; i < COUNT; i++) {
      const object = new THREE.Group();
      const material = boneTemplate.clone();
      const limbStyle = { leg: material, foot: material, arm: material, hand: material };
      const legs = new Legs(limbStyle);
      legs.root.position.y = Legs.HIP_HEIGHT;
      const sword = new Sword();
      const arms = new Arms(sword.model, limbStyle);
      arms.root.position.y = Legs.HIP_HEIGHT + 1.0;
      object.add(buildBody(material), legs.root, arms.root);

      // Spawn away from the player's start so they aren't in your face on load.
      let x: number;
      let z: number;
      do {
        x = (this.rand() - 0.5) * ROAM_EXTENT;
        z = (this.rand() - 0.5) * ROAM_EXTENT;
      } while (Math.hypot(x, z) < 10);
      object.position.set(x, 0, z);
      object.rotation.y = this.rand() * Math.PI * 2;
      scene.add(object);

      this.skeletons.push({
        object,
        legs,
        arms,
        sword,
        material,
        health: HITS_TO_KILL,
        flash: 0,
        behaviour: { kind: 'rest', remaining: this.rand() * MAX_REST },
      });
    }
  }

  /** True if any skeleton moved last frame. */
  get animating(): boolean {
    return this.moved;
  }

  /** Applies one axe hit to the closest living skeleton in front of `origin`. Returns true if one was hit. */
  hit(origin: THREE.Vector3, forward: THREE.Vector3): boolean {
    let best: Skeleton | undefined;
    let bestDist = Infinity;
    const to = new THREE.Vector3();

    for (const s of this.skeletons) {
      if (s.behaviour.kind === 'collapse' || s.behaviour.kind === 'sink') continue;
      to.subVectors(s.object.position, origin).setY(0);
      const dist = to.length();
      if (dist > HIT_REACH || dist >= bestDist) continue;
      if (to.normalize().dot(forward) < HIT_FACING) continue;
      best = s;
      bestDist = dist;
    }
    if (!best) return false;

    best.health -= 1;
    best.flash = FLASH_DURATION;
    best.sword.cancel();
    // Drop any rattle so the collapse hinges from an upright pose.
    best.object.rotation.z = 0;
    const away = new THREE.Vector3().subVectors(best.object.position, origin).setY(0).normalize();
    if (best.health > 0) {
      best.behaviour = { kind: 'stagger', t: 0, dir: away };
    } else {
      // Topple away from the player, hinged at the feet.
      const axis = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, away).normalize();
      best.behaviour = { kind: 'collapse', t: 0, axis, upright: best.object.quaternion.clone() };
    }
    this.moved = true;
    return true;
  }

  /** Advances behaviour and attacks against the player at `playerPos`. */
  update(dt: number, playerPos: THREE.Vector3): SkeletonsUpdate {
    const killed: THREE.Vector3[] = [];
    let damage = 0;
    this.moved = false;
    const toPlayer = new THREE.Vector3();
    for (let i = this.skeletons.length - 1; i >= 0; i--) {
      const s = this.skeletons[i];
      if (!s) continue;
      let speed = 0;
      toPlayer.subVectors(playerPos, s.object.position).setY(0);
      const playerDist = toPlayer.length();

      // Wanderers notice a nearby player and switch to chasing.
      if ((s.behaviour.kind === 'rest' || s.behaviour.kind === 'walk') && playerDist < DETECT_RANGE) {
        s.behaviour = { kind: 'chase' };
      }

      const { behaviour } = s;
      if (behaviour.kind === 'rest') {
        behaviour.remaining -= dt;
        if (behaviour.remaining <= 0) s.behaviour = { kind: 'walk', target: this.pickTarget(s.object.position) };
      } else if (behaviour.kind === 'chase') {
        if (playerDist > LOSE_RANGE) {
          s.behaviour = { kind: 'rest', remaining: MIN_REST };
        } else if (playerDist < ATTACK_RANGE) {
          s.sword.swing();
          s.behaviour = { kind: 'attack', cooldown: ATTACK_COOLDOWN };
        } else {
          this.turnToward(s, toPlayer, dt);
          const step = Math.min(CHASE_SPEED * dt, playerDist - ATTACK_RANGE * 0.8);
          s.object.position.x += Math.sin(s.object.rotation.y) * step;
          s.object.position.z += Math.cos(s.object.rotation.y) * step;
          speed = CHASE_SPEED;
        }
        this.moved = true;
      } else if (behaviour.kind === 'attack') {
        this.turnToward(s, toPlayer, dt);
        behaviour.cooldown -= dt;
        if (!s.sword.swinging && behaviour.cooldown <= 0) {
          if (playerDist < ATTACK_RANGE) {
            s.sword.swing();
            behaviour.cooldown = ATTACK_COOLDOWN;
          } else {
            s.behaviour = { kind: 'chase' };
          }
        }
        this.moved = true;
      } else if (behaviour.kind === 'stagger') {
        behaviour.t += dt;
        const k = Math.min(behaviour.t / STAGGER_DURATION, 1);
        // Quick shove that decelerates while the whole body rattles, then resume wandering.
        s.object.position.addScaledVector(behaviour.dir, STAGGER_DISTANCE * (1 - k) * (dt / STAGGER_DURATION) * 2);
        s.object.rotation.z = Math.sin(behaviour.t * 70) * RATTLE_ANGLE * (1 - k);
        if (k >= 1) {
          s.object.rotation.z = 0;
          s.behaviour = { kind: 'rest', remaining: MIN_REST };
        }
        this.moved = true;
      } else if (behaviour.kind === 'collapse') {
        behaviour.t += dt;
        const k = Math.min(behaviour.t / COLLAPSE_DURATION, 1);
        const fall = new THREE.Quaternion().setFromAxisAngle(behaviour.axis, (Math.PI / 2 - 0.05) * k * k);
        s.object.quaternion.copy(fall).multiply(behaviour.upright);
        if (k >= 1) {
          killed.push(s.object.position.clone());
          s.behaviour = { kind: 'sink', t: 0 };
        }
        this.moved = true;
      } else if (behaviour.kind === 'sink') {
        behaviour.t += dt;
        const k = Math.min(behaviour.t / SINK_DURATION, 1);
        s.object.position.y = -1.5 * k;
        if (k >= 1) {
          this.scene.remove(s.object);
          this.skeletons.splice(i, 1);
        }
        this.moved = true;
        continue;
      } else {
        const to = behaviour.target.clone().sub(s.object.position);
        to.y = 0;
        const distance = to.length();
        if (distance < ARRIVE_DISTANCE) {
          s.behaviour = { kind: 'rest', remaining: MIN_REST + this.rand() * (MAX_REST - MIN_REST) };
        } else {
          this.turnToward(s, to, dt);

          // Walk in the facing direction so turns look like turns rather than slides.
          const step = Math.min(WALK_SPEED * dt, distance);
          s.object.position.x += Math.sin(s.object.rotation.y) * step;
          s.object.position.z += Math.cos(s.object.rotation.y) * step;
          speed = WALK_SPEED;
          this.moved = true;
        }
      }
      if (s.legs.update(dt, speed, true)) this.moved = true;
      // The blade connects if the player is still in reach and not jumping over it.
      if (s.sword.update(dt) && playerDist < SWORD_REACH && playerPos.y < 1.2) damage += 1;
      if (s.sword.swinging) this.moved = true;
      s.arms.update(s.legs.swingAngle, s.sword.angle, s.sword.swinging);
      this.updateFlash(s, dt);
    }
    return { killed, damage };
  }

  private turnToward(s: Skeleton, dir: THREE.Vector3, dt: number): void {
    const targetYaw = Math.atan2(dir.x, dir.z);
    let diff = targetYaw - s.object.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    s.object.rotation.y += diff * Math.min(1, TURN_SPEED * dt);
  }

  private updateFlash(s: Skeleton, dt: number): void {
    if (s.flash <= 0) return;
    s.flash = Math.max(0, s.flash - dt);
    s.material.emissiveIntensity = s.flash / FLASH_DURATION;
    this.moved = true;
  }

  private pickTarget(from: THREE.Vector3): THREE.Vector3 {
    for (;;) {
      const angle = this.rand() * Math.PI * 2;
      const dist = MIN_WALK + this.rand() * (MAX_WALK - MIN_WALK);
      const target = new THREE.Vector3(from.x + Math.sin(angle) * dist, 0, from.z + Math.cos(angle) * dist);
      const half = ROAM_EXTENT / 2;
      if (Math.abs(target.x) <= half && Math.abs(target.z) <= half) return target;
    }
  }
}
