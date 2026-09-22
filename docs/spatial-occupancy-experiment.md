# Spatial occupancy experiment

A controlled architecture experiment, run 2026-09-22 against baseline
`40cc11508c04253ee3804a59eb7954b50b18f825` (backup branch
`backup-before-spatial-occupancy-2026-09-22`, tag
`backup-before-spatial-occupancy-2026-09-22-tag`). The question: should
DevaForm augment its relational placement system with a generic 3D
occupancy representation — occupied space, forbidden space, legitimate
voids, contact regions — the way a sprite editor reasons about occupied
versus transparent pixels?

The experiment's own rule, stated up front and held to: a result where
spatial occupancy merely reproduces what measured `BodyProfile`,
`walkSurface`, `GripFrame`, `gripSeats` or presentation resolution
already provide is a FAILURE, not a success.

---

## 1. What the current system already is

Three layers, deliberately separate, all left untouched:

- **Semantic** — `resolveCharacterPresentation()` decides what an
  attribute is doing (`handheldShaft`, `grounded`, `pinchHeld`,
  `coiled`…). One resolution step; `buildRig` decides nothing.
- **Relational** — sockets, grip frames, measured body surfaces. An
  ornament's route is authored in surface coordinates and evaluated onto
  whatever body wears it (`walkSurface`); a wrap is cut to the measured
  `legEnvelope`; a fist closes onto the radius the item declares, seated
  at the measured `gripSeats`.
- **Constructive guarantees** — `pushOutsideBody` moves any buried
  vertex radially out to skin + clearance. The serpent CANNOT be inside
  the chest, because it is never expressed in a space where "inside" is
  representable.

The audit's closing observation frames what these layers trust:
declarations (a manifest radius, a clearance constant) and construction
(a walk over a measured surface). **Nothing anywhere measures the
finished geometry back and holds it to what was declared.** That gap is
where this experiment aimed, because everything else was already owned.

## 2. What was built

Validation-only, additive, no runtime path:

- `packages/asset-system/src/spatial.ts` — pure-data vocabulary
  (no THREE): primitives `sphere | capsule | cylinder | annulus | box`,
  region kinds `occupied | void | clearance | contact`,
  `voidOfAnnulus()`, `validateSpatialOccupancy()`. The annulus is the
  point: it is the smallest primitive that KEEPS a hole.
- `AssetDefinition.spatial?` — optional, experimental, read by nothing
  in placement or resolution. No shipped manifest declares one (a test
  asserts this).
- `apps/web/src/engine/spatial/occupancy.ts` — signed distances,
  level-0 AABB broad phase, `passesThroughVoid()` (does a capsule
  genuinely pass through a hole), capsule clearance, and a grid-hashed
  `closestApproach()` for sampled point clouds.
- `apps/web/src/engine/spatial/derive.ts` — occupancy MEASURED from
  built geometry, zero authored constants: `surfacePoints()`,
  `radialBand()` (material thickness where a hand closes),
  `fitAnnulus()` (a ring's hole from its own triangles).
- `apps/web/src/engine/spatial/bodyAdapter.ts` — the body's occupancy
  by DELEGATION to the measured `BodyProfile` (the same radial
  convention as `pushOutsideBody`, read instead of applied). Explicitly
  not a second body representation.
- `apps/web/src/engine/spatial/debug.ts` — dev-only wireframe builder
  (green occupied / red colliding / blue void / yellow clearance).
  Imported by nothing in the Studio.
- Tests: `spatial.test.ts` (asset-system, 4), `spatial.test.ts` (web
  unit, 11), `spatialCoexistence.test.ts` (web integration on the real
  human GLB, 6).

Representation hierarchy investigated: **level 0** AABB (kept, broad
phase only — proven wrong as an occupancy answer, see §4.1), **level 1**
analytic primitives (kept — they answer every hollow/grip case tested),
**level 2** sampled surface points (kept — for forms no primitive
describes: the serpent, the bead strands), **level 3** SDF/voxel
occupancy (NOT built — nothing in the tested cases needed sub-millimetre
volumetric queries that levels 1–2 could not answer; revisit only if a
case appears that they cannot).

## 3. The required test cases, and where each lives

| # | Case | Test | Result |
|---|---|---|---|
| 1 | Non-overlapping assets → valid | web `spatial.test.ts` "clearly separate assets are clear" | pass |
| 2 | Overlapping assets → invalid | "clearly overlapping assets are found overlapping" | pass |
| 3 | Ring containing a compatible object → valid | "a compatible object passes through the void" | pass |
| 4 | Ring containing an oversized object → invalid | same test: oversized, misaligned, and non-through cases | pass |
| 5 | Naga outside body → valid | `spatialCoexistence` naga test: **0.00 mm** worst penetration, 3 217 samples | pass |
| 6 | Naga penetrating body → invalid | same test, cloud displaced 12 mm inward → caught | pass |
| 7 | Trishul intersecting hand incorrectly → invalid | fist-void test: a 20 mm shaft cannot occupy the fist's channel | pass |
| 8 | Trishul correctly occupying grip → valid | measured 7.40 mm shaft passes through the declared+flesh channel | pass |
| 9 | Resolver still makes the semantic decision | "the semantic layer is untouched": blessing → `grounded`, default → `handheldShaft` | pass |
| 10 | Ganesha regression unchanged | `sceneRegression` pin 371 nodes / `11a0733e5c216ec2` — untouched, green | pass |
| 11 | Shiva unchanged unless feature enabled | pin 335 / `183cd2e87fa80b7a` green; there is no runtime path to enable | pass |
| 12 | Old saves continue to load | existing schema/shiva round-trip + pre-field-save tests, green | pass |
| 13 | Spatial metadata serializes | asset-system `spatial.test.ts`: byte-stable JSON round-trip, validation, inert on `AssetDefinition` | pass |

## 4. Findings

### 4.1 The ring question is real, and only the annulus answers it

`fitAnnulus` recovers a bangle's hole (8 mm), rim (14 mm) and depth
(3 mm) from its own triangles with **zero authored constants**, and
`passesThroughVoid` then distinguishes a 6 mm finger (fits) from a
10 mm one (jams), from a 4 mm-misaligned one (jams on the rim), from a
stub resting in the opening (not through). The level-0 test is kept as
evidence, not decoration: the ring's bounding box intersects the finger
that fits and the finger that jams IDENTICALLY. A box, and any convex
representation, is wrong about hollow objects by construction.

Today this capability has no shipped customer: the limb bands are
procedural part slots sized from the measured limb radius, correct by
construction. Its value is for what is coming — an ARTIST-DELIVERED
bangle/ring GLB has no construction to trust, and this is the only
mechanism in the repository that could hold "the wrist fits through it,
on every morph" to account.

### 4.2 The measurement found two real things on the first run

- **The damaru's declaration understates its grip-band material by
  4 mm**: declared 6.20 mm at the waist; measured 10.24 mm within
  ±6 mm of the grip origin, because the waist CORD (a 1.7 mm torus at
  ~9 mm) and the strikers' roots live inside the band the fist closes
  over. The fingers therefore close through cord and knots — absorbed
  today as invisible soft contact, stated by nothing. Whether that gap
  is acceptable is an art-direction judgement; the point is that it is
  now a judgement about a number. (Deliberately NOT "fixed" here — this
  experiment does not modify assets.)
- **The naga and the rudraksha mala are touching — 0.21 mm closest
  approach.** Each is independently guaranteed against the BODY; their
  relationship to EACH OTHER had never been stated or measured anywhere
  (every held-to-account relationship in the audit's table is X↔body or
  X↔hand). Visually it reads as beads lying under a serpent; the test
  now pins the number so a future change that parts them or buries one
  in the other shows up.

This mirrors the repository's own history: the chakra once declared a
6 mm grip radius so the fist would close photogenically, and the render
showed a hand closed on nothing. `grip.test.ts` measures finger skin
against the DECLARED radius, so a lying declaration passes the finger
test for the wrong reason. Declared-versus-measured conformance is the
missing third leg, and it is cheap.

### 4.3 The naga placement verdict is unambiguous: the current system won

The generic validator, knowing nothing about how the serpent was built,
measured its worst torso penetration at **0.00 mm over 3 217 samples**
— the constructive guarantee is not approximately right, it is exactly
right. A spatial system that PLACED the naga would need the route
authored some other way and would re-derive what `walkSurface` already
does better (the route representation makes "inside" inexpressible;
a validator can only complain after the fact). Placement stays.

### 4.4 What the current system was NOT better at

Asked genuinely new questions, the occupancy layer answered where the
current system has no vocabulary at all: through-hole fit (§4.1),
declared-vs-built conformance (§4.2), attribute↔attribute clearance
(§4.2), and a generic "is this cloud outside this body" that needed no
bespoke per-asset loop (the existing checks — `morphSafety`,
`garmentFit`, the shiva-rig naga bearing check — are each hand-written
per case; `worstTorsoPenetration` is the same measurement as an API).

### 4.5 Garment case: not implemented, on purpose

The brief allowed a garment case "only if current scalar/profile
fitting is insufficient". It is not insufficient: sections are cut to
the measured `legEnvelope`, and `garmentFit.test.ts` already
machine-checks containment against skin-weight-selected leg vertices —
a stricter check than any primitive decomposition of cloth could state.
Forcing occupancy onto cloth would be exactly the failure mode the
brief warned about. KEEP CURRENT, no contest.

## 5. Costs

- **Runtime**: zero. Nothing outside tests imports the module; no
  per-frame work exists or is proposed. The rejected alternative —
  live mesh collision per frame — solves no problem the constructive
  placement has.
- **Validation-time**: signed-distance queries ~0.2 µs each (100 k in
  ~20 ms); naga-vs-torso, 3 217 samples: **26 ms**; naga↔mala with the
  grid, 4 832 × 5 714 samples: **19 ms** (brute force would be
  27.6 M pairs). Whole new suite: ~1.5 s of a 13.7 s web test run.
- **Authoring**: zero new constants for everything tested — every
  occupancy used was derived from built geometry or delegated to the
  measured profile. The two thresholds that exist (contact allowances
  of 6 mm body / 4 mm flesh) are the same numbers the existing tests
  already use.
- **Serialization**: plain JSON data, byte-stable, validated by
  sentences not exceptions. One optional field on `AssetDefinition`.
- **Debuggability**: every check answers in millimetres with a labelled
  region; `debug.ts` can draw any occupancy as wireframes (green/red/
  blue/yellow) for a future dev page.

## 6. Decision, per case

| Case | Verdict | Reason |
|---|---|---|
| Naga (and all worn-ornament) placement | **KEEP CURRENT** | Constructive `walkSurface`/`pushOutsideBody` measured exactly clear; a validator cannot improve on "inside is inexpressible" |
| Garment fitting | **KEEP CURRENT** | Measured envelope + skin-weight containment test already stricter than primitives could be |
| Hollow/ring fit | **KEEP SPATIAL** (validation) | No current vocabulary can state a hole; annulus derivation costs nothing to author; needed the day an artist GLB ring/bangle arrives |
| Held-attribute coexistence | **HYBRID** | Placement/closure stays (semantic + relational + baked grips); measured-vs-declared conformance added — found the damaru's 4 mm understatement, would have caught the chakra lie |
| Attribute↔attribute interference | **KEEP SPATIAL** (validation) | The question existed nowhere; first measurement found real contact (naga↔mala 0.21 mm) |
| Body-vs-asset validation API | **HYBRID** | Generic `worstTorsoPenetration` = the bespoke test loops as one mechanism; body occupancy stays an ADAPTER over `BodyProfile`, never a second representation |
| Runtime collision / placement-by-collision | **DEFER (rejected as proposed)** | Solves nothing the constructive systems don't; would create the two-competing-placement-systems failure the brief forbids |
| SDF / voxel occupancy (level 3) | **DEFER** | No tested case needed it; levels 0–2 answered everything |

**Overall: keep the experiment as validation tooling; the experimental
feature stays disabled in the sense that matters — there is no runtime
switch because there is no runtime path.** The architecture lands where
the brief predicted a good outcome would: semantic presentation +
relational attachment + spatial VALIDATION. The original phrasing
("surface area consumed") was evaluated and is the wrong quantity —
surface area cannot say whether a finger fits through a ring; occupied
volume, kept voids, clearance and contact regions can, and that is what
was built.

## 7. What must not change because of this

`presentation.ts`, `resolve.ts`, `GripFrame`, `gripSeats`,
`bodyProfile`, `surfaceWalk`, the measured manifests, the socket
hierarchy, the baked-closure grip architecture, both scene-regression
pins, and the damaru/chakra assets themselves (their discrepancies are
recorded findings, not bugs to silently "fix" in an experiment commit).

## 8. Gates at completion

432 tests green (29 schema / 95 asset-system / 308 web — 21 of them
new), `typecheck` clean in all three packages, `lint` clean,
`validate-assets` 0 errors / 0 warnings, `next build` completes.
Both regression pins unchanged: ganesha 371 / `11a0733e5c216ec2`,
shiva 335 / `183cd2e87fa80b7a`.

## 9. Remaining risks

- The damaru and naga↔mala findings are now PINNED numbers; an
  intentional re-design of either ornament will need those two
  assertions re-read (they are written to describe, not to freeze
  taste).
- `radialBand` conflates all material in the axial window — the
  damaru's strikers count toward its grip band. For validation that is
  conservative (over-reports material); an angular mask is the obvious
  refinement if a case ever needs it.
- Point-cloud approaches cannot SIGN a penetration; below one sample
  step, "touching" and "overlapping" read the same. Fine for
  ornament-scale findings; a case needing signed asset-vs-asset depth
  would need level-1 proxies on both sides.
- `fitAnnulus` needs an axis hint and a reasonably ring-like mesh; a
  gem-heavy ring skews its outer radius (harmless: outer is not the
  fit-critical number — the hole is, and the hole is measured exactly).
