import * as THREE from 'three';

const SPEED = 40;
/** Bullets vanish after travelling this far (metres). */
const MAX_RANGE = 30;

const bulletMat = new THREE.MeshStandardMaterial({
  color: 0xffe08a,
  emissive: new THREE.Color(0xffc23a),
  emissiveIntensity: 1.5,
  roughness: 0.4,
});
const bulletGeo = new THREE.SphereGeometry(0.06, 8, 6);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** Flight segment of a live bullet for the frame just simulated. */
export interface BulletPath {
  readonly id: number;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
}

interface Bullet {
  id: number;
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  travelled: number;
  previous: THREE.Vector3;
}

/** Bullets in flight. Hit-testing lives with the targets; see `update`. */
export class Projectiles {
  private readonly root = new THREE.Group();
  private readonly bullets: Bullet[] = [];
  private nextId = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  get animating(): boolean {
    return this.bullets.length > 0;
  }

  fire(origin: THREE.Vector3, direction: THREE.Vector3): void {
    const mesh = new THREE.Mesh(bulletGeo, bulletMat);
    mesh.position.copy(origin);
    // Stretch the sphere along its flight direction.
    mesh.scale.set(1, 1, 2.5);
    mesh.quaternion.setFromUnitVectors(FORWARD, direction);
    this.root.add(mesh);
    this.bullets.push({
      id: this.nextId++,
      mesh,
      velocity: direction.clone().multiplyScalar(SPEED),
      travelled: 0,
      previous: origin.clone(),
    });
  }

  /**
   * Moves every bullet and returns the segment each one swept this frame so
   * the caller can hit-test them; call `remove` for the ones that connected.
   */
  update(dt: number): BulletPath[] {
    const paths: BulletPath[] = [];
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) continue;
      b.previous.copy(b.mesh.position);
      b.mesh.position.addScaledVector(b.velocity, dt);
      b.travelled += SPEED * dt;
      if (b.travelled > MAX_RANGE || b.mesh.position.y < 0) {
        this.destroy(i);
        continue;
      }
      paths.push({ id: b.id, from: b.previous, to: b.mesh.position });
    }
    return paths;
  }

  remove(id: number): void {
    const i = this.bullets.findIndex((b) => b.id === id);
    if (i >= 0) this.destroy(i);
  }

  private destroy(index: number): void {
    const b = this.bullets[index];
    if (!b) return;
    this.root.remove(b.mesh);
    this.bullets.splice(index, 1);
  }
}
