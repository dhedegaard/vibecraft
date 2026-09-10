import * as THREE from 'three';
import { Arms } from './arms';
import { CHARACTER_RADIUS, separate, type Colliders } from './collision';
import { Legs } from './legs';
import { BONE_COLOR } from './mesh';
import { stepForward, turnToward } from './motion';
import { pushOutOfCircles, type Circle } from './repel';
import { seededRandom } from './props';
import { Sword } from './sword';
import { nearestInCone } from './targeting';
import { applyTopple, beginTopple, type Topple } from './topple';

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
/** Extra seconds beyond the straight-line time before a walk gives up (a target behind a tree). */
const WALK_GRACE = 3;
const HITS_TO_KILL = 2;
/** Horizontal radius and height of the body an arrow can strike. */
const ARROW_RADIUS_SQ = 0.5 * 0.5;
const ARROW_HEIGHT = 2;
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
const boneTemplate = new THREE.MeshStandardMaterial({ color: BONE_COLOR, roughness: 0.8, emissive: FLASH_COLOR, emissiveIntensity: 0 });
const socket = new THREE.MeshStandardMaterial({ color: 0x111111 });

const skullGeo = new THREE.SphereGeometry(0.3, 14, 12);
const jawGeo = new THREE.BoxGeometry(0.3, 0.14, 0.26);
const socketGeo = new THREE.SphereGeometry(0.07, 8, 8);
const spineGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8);
const ribGeo = new THREE.TorusGeometry(0.3, 0.035, 6, 16);
const pelvisGeo = new THREE.BoxGeometry(0.5, 0.18, 0.28);

// Per-frame scratch vectors.
const toPlayer = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const shotDir = new THREE.Vector3();
const rel = new THREE.Vector3();

type Behaviour =
  | { kind: 'walk'; target: THREE.Vector3; remaining: number }
  | { kind: 'rest'; remaining: number }
  | { kind: 'chase' }
  | { kind: 'attack'; cooldown: number }
  | { kind: 'stagger'; t: number; dir: THREE.Vector3 }
  | { kind: 'collapse'; t: number; topple: Topple }
  | { kind: 'sink'; t: number };

interface Skeleton {
  object: THREE.Group;
  legs: Legs;
  arms: Arms;
  sword: Sword;
  /** Cloned bone material; its emissive intensity is the hit flash. */
  material: THREE.MeshStandardMaterial;
  health: number;
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
  private readonly root = new THREE.Group();
  private readonly skeletons: Skeleton[] = [];
  private readonly rand = seededRandom(7);
  private moved = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
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
      this.root.add(object);

      this.skeletons.push({
        object,
        legs,
        arms,
        sword,
        material,
        health: HITS_TO_KILL,
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
    const living = this.skeletons.filter((s) => s.health > 0);
    const found = nearestInCone(living, (s) => s.object.position, origin, forward);
    if (!found) return false;
    this.applyHit(found.item, found.away);
    return true;
  }

  /**
   * Applies one arrow hit to the first living skeleton whose body the segment
   * `from` → `to` passes through. Returns true if one was hit.
   */
  shoot(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = shotDir.subVectors(to, from);
    const lengthSq = dir.lengthSq();
    if (lengthSq === 0) return false;
    let best: Skeleton | undefined;
    let bestAlong = Infinity;

    for (const s of this.skeletons) {
      if (s.health <= 0) continue;
      // Closest point on the segment to the skeleton's axis, then a cylinder test.
      rel.subVectors(s.object.position, from);
      const along = THREE.MathUtils.clamp(rel.dot(dir) / lengthSq, 0, 1);
      if (along >= bestAlong) continue;
      rel.addScaledVector(dir, -along);
      const y = from.y + dir.y * along - s.object.position.y;
      if (rel.x * rel.x + rel.z * rel.z > ARROW_RADIUS_SQ || y < 0 || y > ARROW_HEIGHT) continue;
      best = s;
      bestAlong = along;
    }
    if (!best) return false;

    this.applyHit(best, dir.setY(0).normalize());
    return true;
  }

  /** Damages `s`, flashing and staggering it away along `away`, or toppling it if that was the last hit. */
  private applyHit(s: Skeleton, away: THREE.Vector3): void {
    s.health -= 1;
    s.material.emissiveIntensity = 1;
    s.sword.cancel();
    // Drop any rattle so the collapse hinges from an upright pose.
    s.object.rotation.z = 0;
    if (s.health > 0) {
      s.behaviour = { kind: 'stagger', t: 0, dir: away.clone() };
    } else {
      // Topple away from the attacker, hinged at the feet.
      s.behaviour = { kind: 'collapse', t: 0, topple: beginTopple(s.object, away) };
    }
    this.moved = true;
  }

  /**
   * Advances behaviour and attacks against the player at `playerPos`, keeping skeletons out of
   * `colliders`, the player, each other and the `repellers` (torch light).
   */
  update(dt: number, playerPos: THREE.Vector3, colliders: Colliders, repellers: readonly Circle[]): SkeletonsUpdate {
    const killed: THREE.Vector3[] = [];
    let damage = 0;
    this.moved = false;
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
      switch (behaviour.kind) {
        case 'rest':
          behaviour.remaining -= dt;
          if (behaviour.remaining <= 0) s.behaviour = this.startWalk(s.object.position);
          break;

        case 'walk': {
          toTarget.subVectors(behaviour.target, s.object.position).setY(0);
          const distance = toTarget.length();
          behaviour.remaining -= dt;
          if (distance < ARRIVE_DISTANCE || behaviour.remaining <= 0) {
            s.behaviour = { kind: 'rest', remaining: MIN_REST + this.rand() * (MAX_REST - MIN_REST) };
          } else {
            this.advance(s, toTarget, WALK_SPEED, distance, dt);
            speed = WALK_SPEED;
          }
          break;
        }

        case 'chase':
          if (playerDist > LOSE_RANGE) {
            s.behaviour = { kind: 'rest', remaining: MIN_REST };
          } else if (playerDist < ATTACK_RANGE) {
            s.sword.swing();
            s.behaviour = { kind: 'attack', cooldown: ATTACK_COOLDOWN };
          } else {
            this.advance(s, toPlayer, CHASE_SPEED, playerDist - ATTACK_RANGE * 0.8, dt);
            speed = CHASE_SPEED;
          }
          this.moved = true;
          break;

        case 'attack':
          turnToward(s.object, toPlayer, TURN_SPEED, dt);
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
          break;

        case 'stagger': {
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
          break;
        }

        case 'collapse': {
          behaviour.t += dt;
          const k = Math.min(behaviour.t / COLLAPSE_DURATION, 1);
          applyTopple(s.object, behaviour.topple, k);
          if (k >= 1) {
            killed.push(s.object.position.clone());
            s.behaviour = { kind: 'sink', t: 0 };
          }
          this.moved = true;
          break;
        }

        case 'sink': {
          behaviour.t += dt;
          const k = Math.min(behaviour.t / SINK_DURATION, 1);
          s.object.position.y = -1.5 * k;
          if (k >= 1) {
            this.root.remove(s.object);
            this.skeletons.splice(i, 1);
          }
          this.moved = true;
          continue;
        }
      }
      if (this.pushOut(s, i, playerPos, colliders, repellers)) this.moved = true;
      if (s.legs.update(dt, speed, true)) this.moved = true;
      // The blade connects if the player is still in reach and not jumping over it.
      if (s.sword.update(dt) && playerDist < SWORD_REACH && playerPos.y < 1.2) damage += 1;
      if (s.sword.swinging) this.moved = true;
      s.arms.update(s.legs.swingAngle, s.sword.angle, s.sword.armLocked);
      this.updateFlash(s, dt);
    }
    return { killed, damage };
  }

  /** Turns toward `toward` and walks in the facing direction, so turns look like turns rather than slides. */
  private advance(s: Skeleton, toward: THREE.Vector3, speed: number, remaining: number, dt: number): void {
    turnToward(s.object, toward, TURN_SPEED, dt);
    stepForward(s.object, Math.min(speed * dt, remaining));
    this.moved = true;
  }

  private updateFlash(s: Skeleton, dt: number): void {
    if (s.material.emissiveIntensity <= 0) return;
    s.material.emissiveIntensity = Math.max(0, s.material.emissiveIntensity - dt / FLASH_DURATION);
    this.moved = true;
  }

  /**
   * Keeps skeleton `i` out of torch light, static obstacles, the player and the living skeletons
   * already resolved this frame (those after `i`, as `update` walks the list backwards). Light
   * goes first so trunks and the player have the final say. Skeletons never push the player,
   * so player movement stays authoritative.
   */
  private pushOut(
    s: Skeleton,
    i: number,
    playerPos: THREE.Vector3,
    colliders: Colliders,
    repellers: readonly Circle[],
  ): boolean {
    const pos = s.object.position;
    let moved = pushOutOfCircles(pos, repellers);
    if (colliders.resolve(pos, CHARACTER_RADIUS)) moved = true;
    if (separate(playerPos, CHARACTER_RADIUS, pos, CHARACTER_RADIUS)) moved = true;
    for (let j = i + 1; j < this.skeletons.length; j++) {
      const other = this.skeletons[j];
      if (!other || other.health <= 0) continue;
      if (separate(other.object.position, CHARACTER_RADIUS, pos, CHARACTER_RADIUS)) moved = true;
    }
    return moved;
  }

  private startWalk(from: THREE.Vector3): Behaviour {
    const target = this.pickTarget(from);
    const remaining = from.distanceTo(target) / WALK_SPEED + WALK_GRACE;
    return { kind: 'walk', target, remaining };
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
