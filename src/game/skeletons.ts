import * as THREE from 'three';
import { Arms } from './arms';
import { Legs } from './legs';
import { seededRandom } from './props';
import { createSword, SWORD_REST_ANGLE } from './sword';

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

const bone = new THREE.MeshStandardMaterial({ color: 0xe6e2d3, roughness: 0.8 });
const socket = new THREE.MeshStandardMaterial({ color: 0x111111 });
const limbStyle = { leg: bone, foot: bone, arm: bone, hand: bone };

const skullGeo = new THREE.SphereGeometry(0.3, 14, 12);
const jawGeo = new THREE.BoxGeometry(0.3, 0.14, 0.26);
const socketGeo = new THREE.SphereGeometry(0.07, 8, 8);
const spineGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8);
const ribGeo = new THREE.TorusGeometry(0.3, 0.035, 6, 16);
const pelvisGeo = new THREE.BoxGeometry(0.5, 0.18, 0.28);

type Behaviour =
  | { kind: 'walk'; target: THREE.Vector3 }
  | { kind: 'rest'; remaining: number };

interface Skeleton {
  object: THREE.Group;
  legs: Legs;
  arms: Arms;
  behaviour: Behaviour;
}

function buildBody(): THREE.Group {
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

/** Ambient skeletons that wander the world with swords, ignoring the player. */
export class Skeletons {
  private readonly skeletons: Skeleton[] = [];
  private readonly rand = seededRandom(7);
  private moved = false;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < COUNT; i++) {
      const object = new THREE.Group();
      const legs = new Legs(limbStyle);
      legs.root.position.y = Legs.HIP_HEIGHT;
      const arms = new Arms(createSword(), limbStyle);
      arms.root.position.y = Legs.HIP_HEIGHT + 1.0;
      object.add(buildBody(), legs.root, arms.root);

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

      this.skeletons.push({ object, legs, arms, behaviour: { kind: 'rest', remaining: this.rand() * MAX_REST } });
    }
  }

  /** True if any skeleton moved last frame. */
  get animating(): boolean {
    return this.moved;
  }

  update(dt: number): void {
    this.moved = false;
    for (const s of this.skeletons) {
      let speed = 0;
      if (s.behaviour.kind === 'rest') {
        s.behaviour.remaining -= dt;
        if (s.behaviour.remaining <= 0) s.behaviour = { kind: 'walk', target: this.pickTarget(s.object.position) };
      } else {
        const to = s.behaviour.target.clone().sub(s.object.position);
        to.y = 0;
        const distance = to.length();
        if (distance < ARRIVE_DISTANCE) {
          s.behaviour = { kind: 'rest', remaining: MIN_REST + this.rand() * (MAX_REST - MIN_REST) };
        } else {
          const targetYaw = Math.atan2(to.x, to.z);
          let diff = targetYaw - s.object.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          s.object.rotation.y += diff * Math.min(1, TURN_SPEED * dt);

          // Walk in the facing direction so turns look like turns rather than slides.
          const step = Math.min(WALK_SPEED * dt, distance);
          s.object.position.x += Math.sin(s.object.rotation.y) * step;
          s.object.position.z += Math.cos(s.object.rotation.y) * step;
          speed = WALK_SPEED;
          this.moved = true;
        }
      }
      if (s.legs.update(dt, speed, true)) this.moved = true;
      s.arms.update(s.legs.swingAngle, SWORD_REST_ANGLE, false);
    }
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
