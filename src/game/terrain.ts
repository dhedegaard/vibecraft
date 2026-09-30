/** Ground that changes how fast a character can move. */
export interface Terrain {
  /** Fraction of normal walking speed at ground position (x, z): 1 on dry land. */
  speedFactor(x: number, z: number): number;
}

/** Terrain with nothing on it: full speed everywhere. */
export const FLAT_TERRAIN: Terrain = { speedFactor: () => 1 };
