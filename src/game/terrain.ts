/** Ground a character stands on and moves across. */
export interface Terrain {
  /** Ground height under (x, z): 0 on the plain, negative in a pond's basin. */
  heightAt(x: number, z: number): number;
  /** Where a falling thing stops: the water surface over water, otherwise the ground. */
  surfaceAt(x: number, z: number): number;
  /** Fraction of normal walking speed at (x, z): 1 on dry land. */
  speedFactor(x: number, z: number): number;
}

/** Terrain with nothing on it: level ground at y = 0, full speed everywhere. */
export const FLAT_TERRAIN: Terrain = { heightAt: () => 0, surfaceAt: () => 0, speedFactor: () => 1 };
