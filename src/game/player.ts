import * as THREE from 'three';
import { Arms } from './arms';
import { Axe } from './axe';
import { Gun } from './gun';
import type { Input } from './input';
import { Legs } from './legs';
import { WEAPON_SLOTS, type Weapon, type WeaponKind } from './weapons';

const MOVE_SPEED = 6;
const JUMP_SPEED = 7;
const GRAVITY = -20;
const TURN_SPEED = 12;

/** A bullet leaving the gun this frame. */
export interface Shot {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}

export interface PlayerUpdate {
  /** True on the frame an axe swing connects. */
  hit: boolean;
  /** Set on the frame the gun fires. */
  shot: Shot | undefined;
  /** True if the character moved or animated this frame. */
  active: boolean;
}

export class Player {
  readonly object = new THREE.Group();
  private readonly axe = new Axe();
  private readonly gun = new Gun();
  private readonly weapons: Record<WeaponKind, Weapon> = { axe: this.axe, gun: this.gun };
  private weaponKind: WeaponKind = 'axe';
  private readonly legs: Legs;
  private readonly arms: Arms;
  private readonly velocity = new THREE.Vector3();
  private grounded = true;

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

    // Both weapons live in the hand; only the selected one is visible.
    const held = new THREE.Group();
    held.add(this.axe.model, this.gun.model);
    this.gun.model.visible = false;
    this.arms = new Arms(held, { arm: fur, hand: pink });
    this.arms.root.position.y = hip + 1.05;

    this.object.add(body, bellyPatch, head, tail, this.legs.root, this.arms.root);
  }

  /** Horizontal unit vector the character is facing. */
  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.object.rotation.y), 0, Math.cos(this.object.rotation.y));
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get weapon(): WeaponKind {
    return this.weaponKind;
  }

  /** Switches weapons; ignored mid-swing. Returns true if the held item changed. */
  select(kind: WeaponKind): boolean {
    if (kind === this.weaponKind || this.weapons[this.weaponKind].swinging) return false;
    this.weapons[this.weaponKind].model.visible = false;
    this.weaponKind = kind;
    this.weapons[kind].model.visible = true;
    return true;
  }

  update(dt: number, input: Input, cameraYaw: number): PlayerUpdate {
    const slot = input.consumeSlot();
    const slotKind = slot === undefined ? undefined : WEAPON_SLOTS[slot];
    const switched = slotKind !== undefined && this.select(slotKind);
    const weapon = this.weapons[this.weaponKind];
    const wasSwinging = weapon.swinging;
    const before = this.object.position.clone();
    const yawBefore = this.object.rotation.y;
    const dir = new THREE.Vector3(
      (input.isHeld('right') ? 1 : 0) - (input.isHeld('left') ? 1 : 0),
      0,
      (input.isHeld('back') ? 1 : 0) - (input.isHeld('forward') ? 1 : 0),
    );

    if (dir.lengthSq() > 0) {
      // Move relative to where the camera is looking.
      dir.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, cameraYaw);
      this.velocity.x = dir.x * MOVE_SPEED;
      this.velocity.z = dir.z * MOVE_SPEED;

      const targetYaw = Math.atan2(dir.x, dir.z);
      const current = this.object.rotation.y;
      let diff = targetYaw - current;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.object.rotation.y = current + diff * Math.min(1, TURN_SPEED * dt);
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

    if (this.object.position.y <= 0) {
      this.object.position.y = 0;
      this.velocity.y = 0;
      this.grounded = true;
    }

    if (input.consumeAttack()) weapon.swing();
    const acted = weapon.update(dt);
    const hit = acted && weapon === this.axe;
    let shot: Shot | undefined;
    if (acted && weapon === this.gun) {
      shot = { origin: this.gun.muzzle.getWorldPosition(new THREE.Vector3()), direction: this.forward };
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const legsMoved = this.legs.update(dt, speed, this.grounded);
    // The right arm follows the weapon's pose; otherwise both arms swing with the walk.
    this.arms.update(this.legs.swingAngle, weapon.angle, weapon.armLocked);

    const active =
      acted ||
      switched ||
      legsMoved ||
      wasSwinging ||
      weapon.swinging ||
      !this.grounded ||
      this.object.rotation.y !== yawBefore ||
      !this.object.position.equals(before);
    return { hit, shot, active };
  }
}
