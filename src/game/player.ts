import * as THREE from 'three';
import { CHARACTER_RADIUS, type Colliders } from './collision';
import { Arms } from './arms';
import { Axe } from './axe';
import { Bow } from './bow';
import type { InputState } from './input';
import type { Inventory } from './inventory';
import { Legs } from './legs';
import { forwardOf, turnToward } from './motion';
import { WEAPON_SLOTS, type Weapon, type WeaponAction, type WeaponKind } from './weapons';

const MOVE_SPEED = 6;
const JUMP_SPEED = 7;
const GRAVITY = -20;
const TURN_SPEED = 12;

/** True unless the weapon needs an item the inventory has run out of. */
function canUse(weapon: Weapon, inventory: Inventory): boolean {
  return weapon.ammo === undefined || inventory.count(weapon.ammo) > 0;
}

export interface PlayerUpdate {
  /** What the held weapon did this frame, if anything. */
  action: WeaponAction | undefined;
  /** True on the frame the held weapon changed. */
  switched: boolean;
  /** True if the character moved or animated this frame. */
  active: boolean;
}

export class Player {
  readonly object = new THREE.Group();
  private readonly weapons: Record<WeaponKind, Weapon> = { axe: new Axe(), bow: new Bow() };
  private weaponKind: WeaponKind = 'axe';
  /** Slots the player may select; crafting adds to it. */
  private readonly unlocked = new Set<WeaponKind>(['axe']);
  private readonly legs: Legs;
  private readonly arms: Arms;
  private readonly velocity = new THREE.Vector3();
  private grounded = true;
  private readonly moveDir = new THREE.Vector3();
  private readonly positionBefore = new THREE.Vector3();

  constructor() {
    const hip = Legs.HIP_HEIGHT;
    const fur = new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 0.9 });
    const belly = new THREE.MeshStandardMaterial({ color: 0xc9c6c0, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xf2a6b8, roughness: 0.7 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });

    // Plump body sitting on the legs; the head is a separate sphere above it.
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 8, 16), fur);
    body.position.y = hip + 0.6;
    body.castShadow = true;
    const bellyPatch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), belly);
    bellyPatch.position.set(0, hip + 0.55, 0.2);
    bellyPatch.scale.set(1, 1.2, 0.6);

    const head = new THREE.Group();
    head.position.y = hip + 1.4;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 14), fur);
    skull.castShadow = true;
    head.add(skull);

    // Snout tapers forward (+Z) with a pink nose at the tip.
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 12), fur);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.06, 0.42);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), pink);
    nose.position.set(0, -0.06, 0.63);
    head.add(snout, nose);

    const eyeGeo = new THREE.SphereGeometry(0.06, 10, 8);
    for (const x of [-0.14, 0.14]) {
      const eye = new THREE.Mesh(eyeGeo, black);
      eye.position.set(x, 0.08, 0.31);
      head.add(eye);
    }

    // Big round ears with a pink inner disc, angled slightly outward.
    const earGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20);
    const innerEarGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.02, 20);
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.28, 0.34, -0.02);
      ear.rotation.set(Math.PI / 2, 0, side * -0.35);
      const outer = new THREE.Mesh(earGeo, fur);
      outer.castShadow = true;
      const inner = new THREE.Mesh(innerEarGeo, pink);
      inner.position.y = 0.02;
      ear.add(outer, inner);
      head.add(ear);
    }

    const whiskerGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4);
    for (const side of [-1, 1]) {
      for (const tilt of [-0.25, 0, 0.25]) {
        const whisker = new THREE.Mesh(whiskerGeo, black);
        whisker.position.set(side * 0.22, -0.08 + tilt * 0.15, 0.5);
        whisker.rotation.set(0, 0, Math.PI / 2 + side * tilt);
        head.add(whisker);
      }
    }

    // Long thin tail curving out behind and up.
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, hip + 0.35, -0.3),
      new THREE.Vector3(0.1, hip + 0.15, -0.8),
      new THREE.Vector3(0.35, hip + 0.3, -1.2),
      new THREE.Vector3(0.5, hip + 0.7, -1.35),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.04, 6), pink);
    tail.castShadow = true;

    this.legs = new Legs({ leg: fur, foot: pink });
    this.legs.root.position.y = hip;

    // Every weapon lives in the hand; only the selected one is visible.
    const held = new THREE.Group();
    for (const kind of WEAPON_SLOTS) {
      const weapon = this.weapons[kind];
      weapon.model.visible = kind === this.weaponKind;
      held.add(weapon.model);
    }
    this.arms = new Arms(held, { arm: fur, hand: pink });
    this.arms.root.position.y = hip + 1.05;

    this.object.add(body, bellyPatch, head, tail, this.legs.root, this.arms.root);
  }

  /** Horizontal unit vector the character is facing (a fresh vector). */
  get forward(): THREE.Vector3 {
    return forwardOf(this.object.rotation.y, new THREE.Vector3());
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get weapon(): WeaponKind {
    return this.weaponKind;
  }

  /** Draw fraction of the held weapon, 0 unless it is being drawn. */
  get draw(): number {
    return this.weapons[this.weaponKind].draw ?? 0;
  }

  isUnlocked(kind: WeaponKind): boolean {
    return this.unlocked.has(kind);
  }

  /** Makes a slot selectable; returns true if it was locked before. */
  unlock(kind: WeaponKind): boolean {
    if (this.unlocked.has(kind)) return false;
    this.unlocked.add(kind);
    return true;
  }

  /** Switches weapons; ignored mid-swing or for a locked slot. Returns true if the held item changed. */
  private select(kind: WeaponKind): boolean {
    if (kind === this.weaponKind || !this.unlocked.has(kind) || this.weapons[this.weaponKind].swinging) return false;
    this.weapons[this.weaponKind].model.visible = false;
    this.weaponKind = kind;
    this.weapons[kind].model.visible = true;
    return true;
  }

  update(
    dt: number,
    input: InputState,
    cameraYaw: number,
    inventory: Inventory,
    colliders: Colliders,
  ): PlayerUpdate {
    const slot = input.consumeSlot();
    const slotKind = slot === undefined ? undefined : WEAPON_SLOTS[slot];
    const switched = slotKind !== undefined && this.select(slotKind);
    const weapon = this.weapons[this.weaponKind];
    const wasSwinging = weapon.swinging;
    const before = this.positionBefore.copy(this.object.position);
    const yawBefore = this.object.rotation.y;
    const dir = this.moveDir.set(
      (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0),
      0,
      (input.isHeld('back') ? 1 : 0) - (input.isHeld('forward') ? 1 : 0),
    );

    if (dir.lengthSq() > 0) {
      // Move relative to where the camera is looking.
      dir.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, cameraYaw);
      this.velocity.x = dir.x * MOVE_SPEED;
      this.velocity.z = dir.z * MOVE_SPEED;
      turnToward(this.object, dir, TURN_SPEED, dt);
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    if (this.grounded && input.isHeld('jump')) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
    }

    this.velocity.y += GRAVITY * dt;
    this.object.position.addScaledVector(this.velocity, dt);
    colliders.resolve(this.object.position, CHARACTER_RADIUS);

    if (this.object.position.y <= 0) {
      this.object.position.y = 0;
      this.velocity.y = 0;
      this.grounded = true;
    }

    if (input.consumeAttack() && canUse(weapon, inventory)) weapon.swing();
    // Held actions (the bow's draw) end when the key comes up; a click never counts as held,
    // so it fires a minimum-power shot on the same frame. No-op for the axe.
    if (weapon.swinging && !input.isHeld('attack')) weapon.release();
    const action = weapon.update(dt);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const legsMoved = this.legs.update(dt, speed, this.grounded);
    this.arms.update(this.legs.swingAngle, weapon.angle, weapon.armLocked, weapon.offHandAngle);

    // An action frame is always also a swinging frame, so `action` needn't be checked here.
    const active =
      switched ||
      legsMoved ||
      wasSwinging ||
      weapon.swinging ||
      !this.grounded ||
      this.object.rotation.y !== yawBefore ||
      !this.object.position.equals(before);
    return { action, switched, active };
  }
}
