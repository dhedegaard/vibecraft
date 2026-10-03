# Day/night cycle — design

Status: approved 2026-09-10. Visual only; no gameplay coupling yet.

## Goal

Replace the fixed sun with a 2½-minute day/night cycle: the sun and moon arc
across the sky, sky, fog and light colours follow, stars come out at night.
Night is moonlit and fully playable. Days are longer than nights.

## Time model

- New module `src/game/daycycle.ts` exporting `DayCycle` plus the pure
  functions `sunElevation(t)` and `lightingAt(elevation)`.
- Phase `t ∈ [0, 1)`, advanced by `dt / CYCLE_SECONDS` (`CYCLE_SECONDS = 150`),
  wrapped with a modulo. `t = 0` is sunrise, `t = DAY_FRACTION = 0.6` is
  sunset: 90 s day, 60 s night.
- `sunElevation(t)`: half-sine from 0 at `t = 0` to +1 at `t = 0.3` back to 0
  at `t = 0.6`, then a mirrored negative half-sine over the night. Elevation is
  a unitless −1..1 value.
- Sun path: a tilted plane through the noon direction. With
  `N = normalize(40, 60, 20)` (today's fixed sun) and `E` the horizontal unit
  vector perpendicular to `N`, the sun direction is `d(θ) = cos θ · N + sin θ · E`
  where `θ` runs −π/2 → π/2 across the day (`θ = π · t / 0.6 − π/2`) and
  π/2 → 3π/2 across the night. The sun rises on one horizon and sets on the
  opposite one; its true elevation is `cos θ · N.y`, i.e. `sunElevation(t) · N.y`.
  Light position is `d · LIGHT_DISTANCE` (`LIGHT_DISTANCE = 75`, the length of
  `(40, 60, 20)`). The moon is the antipode `−d`.
- Start phase `START_PHASE = 0.4` (14:00 on the in-game clock); first sunset 30 s in.
- Fast-forward: holding `T` (new `Action` `'fastForward'`, polled with
  `isHeld`) multiplies the time step by `FAST_FORWARD = 40`, a whole cycle in
  3.75 s. At 40× one 60 Hz frame advances the phase by 1/450 of a cycle, above
  the 1/600 render step below, so every fast-forward frame renders.
- Public read-only `phase` getter so a later feature (night spawns) can read
  the time of day.

## Lighting and colours

`DayCycle` takes ownership of the lights `world.ts` creates today (directional
sun, hemisphere fill, `scene.background`, `scene.fog`) and adds a second
directional light for the moon at the antipode.

`lightingAt(elevation)` returns a palette by linear interpolation between
rows keyed on elevation; dawn and dusk share the table:

| Elevation | Sky/fog colour | Sun colour, intensity | Hemisphere sky/ground, intensity | Moon colour, intensity | Fog near/far | Stars | Unlit brightness |
|---|---|---|---|---|---|---|---|
| 1.0 noon | `0x87ceeb` | `0xffffff`, 1.2 | `0xffffff` / `0x3fa34d`, 0.6 | –, 0 | 60 / 200 | 0 | 1.0 |
| 0.05 horizon | `0xf08a5c` | `0xffa050`, 0.2 | `0xffc8a0` / `0x3f6a3d`, 0.35 | –, 0 | 50 / 170 | 0 | 0.7 |
| −0.05 just below | `0x1c1f4f` | –, 0 | `0x6070b0` / `0x1e3a2a`, 0.2 | `0x8fa8d8`, 0.1 | 40 / 140 | 0.4 | 0.35 |
| −1.0 deep night | `0x070a1e` | –, 0 | `0x3a4a80` / `0x101c18`, 0.15 | `0x8fa8d8`, 0.3 | 30 / 120 | 1 | 0.2 |

`Stars` is the star field's opacity. `Unlit brightness` scales materials that
ignore lighting: the ground `GridHelper` lines (`LineBasicMaterial`) would
otherwise glow at their daytime green on a dark ground, so `DayCycle` receives
the grid and multiplies its two colours by this factor each step.

The noon row equals the current `world.ts` constants so the daytime look is
unchanged. Colours interpolate in RGB via `Color.lerpColors`; the hexes may be
tuned later, the structure is what the tests pin down.

Shadows: exactly one light has `castShadow` at a time. Casting moves from sun
to moon when elevation crosses 0 downward and back on the way up; at the
crossing the sun is at 0.1 and the moon at 0.05, so there is no pop. The
shadow camera keeps its ±70 m box and the light stays `LIGHT_DISTANCE = 75 m`
from the origin. The moon light copies the sun's shadow camera box but uses a
1024² map: night shadows are soft and toggling `castShadow` leaves both maps
allocated, so the second one is kept small.

## Sky objects

A `Group` repositioned to the camera each frame (no parallax):

- Sun disc: `SphereGeometry`, `MeshBasicMaterial` warm white, `fog: false`,
  150 m along the sun direction; hidden below the horizon.
- Moon disc: pale `MeshBasicMaterial`, 150 m along the moon direction; hidden
  below the horizon.
- Stars: ~400 `Points` on a 160 m sphere, one shared `PointsMaterial`
  (`transparent`, `fog: false`, `sizeAttenuation: false`) whose opacity is the
  palette's `Stars` column. The star group rotates with the sun so the sky
  turns.

None of these cast or receive shadows or react to lighting.

## Render gating

The main loop skips `renderer.render` unless a system reports activity.
`DayCycle` therefore steps its visible state coarsely: it accumulates phase and
only applies a new palette, light positions and sky-object transforms when
`t` has advanced ≥ `1 / 600` of a cycle since the last applied step (every
0.5 s at normal speed, every frame while fast-forwarding). `animating` is true
only on a frame where a step was applied. `DayCycle` joins the `scenery` list
in `main.ts`.

## Wiring

- `createWorld` constructs `DayCycle`, passing the scene, the sun, the
  hemisphere light, the `Fog` instance (typed as `Fog`, not read back from
  `scene.fog`, which is `FogBase | null`) and the `GridHelper`, and returns it
  on `World` as `dayCycle`. `DayCycle` creates the moon light and sky objects
  itself and adds them to the scene.
- `main.ts`: `dayCycle.update(dt, input.isHeld('fastForward'), followCamera.camera.position)`
  after `followCamera.update` and before the render decision.
- `input.ts`: `KeyT: 'fastForward'` in the key map, `'fastForward'` added to
  `Action`. `FakeInput` in tests needs no change (it already implements
  `isHeld` over a `Set<Action>`).

## Testing (`src/game/daycycle.test.ts`, headless)

- `sunElevation`: 0 at `t = 0` and `t = 0.6`, positive strictly between,
  negative on (0.6, 1), maximum at 0.3, minimum at 0.8; the fraction of
  samples with positive elevation is 0.6 ± one sample.
- `lightingAt`: noon row equals the current world constants; sun intensity is
  non-increasing as elevation decreases; sun intensity is 0 for elevation
  ≤ −0.05 and moon intensity is 0 for elevation ≥ 0.05 (both are 0.1 and
  0.05 at the horizon crossing); fog near/far, unlit
  brightness are non-increasing and star opacity non-decreasing as elevation
  decreases; stars are 0 at noon and 1 at −1.
- Sun path: `d(θ)` at noon equals `N`; at sunrise and sunset it is horizontal
  and the two differ by sign; at midnight it is `−N`.
- `DayCycle` driven at `dt = 1/60`: over 10 simulated seconds `animating` is
  true on about 20 frames (±2) and false otherwise; while fast-forwarding it
  is true every frame; at any sampled time exactly one of sun/moon has
  `castShadow`; the casting light swaps only on a step where both intensities
  are ≤ 0.2; `phase` wraps past 1 and stays in [0, 1).
- Sky objects: the sun disc is hidden when elevation ≤ 0 and visible above,
  the moon disc the reverse.

## Error handling

No runtime input or external data. Phase is wrapped each update so
fast-forward cannot overflow it.

## Docs

CLAUDE.md: `daycycle.ts` in Layout, `T` in Controls, the coarse-stepping rule
for slowly changing systems in Conventions, intro sentence updated. README
controls updated.

## Out of scope

Skeleton spawning or behaviour by time of day, torches, health-regen changes,
a HUD clock, pausing on blur. The `phase` getter is the hook for the first
of these.
