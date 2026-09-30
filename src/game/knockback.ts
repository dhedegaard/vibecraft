/** Fraction of a shove covered at progress `k`: fast off the mark, easing out. */
function covered(k: number): number {
  return 1 - (1 - k) ** 3;
}

/**
 * Distance a shove of `distance` over `duration` moves between elapsed `t` and
 * `t + dt`. Differencing the position curve means the steps sum to exactly
 * `distance` at any frame rate.
 */
export function shoveStep(distance: number, duration: number, t: number, dt: number): number {
  const from = Math.min(t / duration, 1);
  const to = Math.min((t + dt) / duration, 1);
  return distance * (covered(to) - covered(from));
}
