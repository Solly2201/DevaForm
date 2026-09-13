# Human base migration — stage log

Shiva's geometry is moving from procedural primitive assembly to a real
human mesh. This file records each stage's result and the evaluation it
passed, so the eventual decision to switch the production default is made
against evidence rather than against enthusiasm for the new architecture.

**Standing rule for every stage:** compare against the *best existing
version*, not merely the previous commit. The old system stays available as
the fallback until the new one has objectively won on visual and functional
quality.

---

## Stage 1 — MakeHuman export → production GLB

**Commit:** `f63f7ac` · **Result:** APPROVE STAGE

### What shipped

| | |
|---|---|
| Asset | `humanoid.body.human@1`, stage `experimental`, `deityCompatibility: []` |
| Mesh | 13,380 verts · 26,756 tris · one continuous SkinnedMesh · 1.45 MB |
| Rig | 18 bones, canonical DevaForm joint ids, canonical rest pose |
| Morphs | `bodyLean`, `bodyAthletic`, `bodyPowerful` (GPU targets) |
| Size | 0.350 × 1.000 × 0.165 m — the canonical 1 m statue height |
| Sockets | crown, forehead, both ears, moon, necklace, waist ornament |

### Visual evaluation

Judged first on what it looks like, before any question of how it was
built. In the neutral rest pose the figure reads unmistakably as an adult
human male: correct ~7.5-head proportion, continuous shoulder-to-arm
transition, real hands with separated fingers, anatomical feet, a face with
brow, nose, lips and ears. Deformation was checked at the joints that break
first — elbow at ~115°, shoulder raised overhead, knee bent — and the skin
follows without collapse, pinching or candy-wrapper twisting. The morph
sliders visibly change build (deltoids, arms, thighs, waist) without
disturbing the pose or the silhouette's height.

Against the **best existing version** — the current procedural Shiva — this
is not a close comparison. The existing body is a barrel torso with
detached sphere-and-tube limbs, floating shoulder caps and a cylindrical
skirt; the new one is a human. The old system nevertheless remains the
production default, untouched, until Stage 7.

Known gaps, all owned by later stages: no eyeballs (Stage 3), bald
(Stage 4), naked (Stage 5), and the body is generic rather than
specifically Shiva's morphology (Stage 2). A faint shading seam is visible
along the jaw at close range — MakeHuman's own topology boundary, to be
revisited if it survives the Stage 3 face work.

### Architecture

The engine gained exactly one generic capability: **a body asset may ship
measurements of its own surfaces.** Procedural body profiles mirror the
formulas their generator uses; a mesh body has no formulas to mirror, so
its build script measures the geometry and `deriveBodyProfile` blends those
numbers by the morph influences actually applied to the mesh. Selection is
by asset data (`bodyProfile` present or not), never by asset id, so any
future mesh body — any deity's — gets fitted clothing for free.

Two decisions worth recording:

- **Bulk does not scale a measured profile.** `proportions.bulk` scales
  procedural primitives; a skinned mesh does not respond to it. Reporting a
  bulk-scaled surface for a body that never changed would push ornaments
  off the skin. Girth on a mesh body travels through its morph targets.
- **The rig rebuilds on morph only when something is fitted to the body.**
  Mesh morphs are GPU influences and need no rebuild, but a procedural item
  fitted to measured surfaces bakes that fit at build time. The rebuild
  condition is read from asset metadata.

The human skeleton keeps the stylised rig's joint ids and hierarchy — so
every pose preset, mudra and gesture applies unchanged — while taking its
proportions from the measured anatomy. The A-pose export is retargeted into
the canonical rest pose at build time rather than at runtime, which is why
no pose code needed to change.

MakeHuman is authoring-time only: no runtime dependency, no exposure of its
modifier system to users, and a test asserts the engine source never
mentions it.

### Gates

| Gate | Result |
|---|---|
| Tests | 119 passed (69 web, 31 asset-system, 19 schema), 11 new |
| Typecheck | clean |
| Lint | clean |
| Production build | clean |
| `validate-assets` | 0 errors, 0 warnings |
| Browser QA | 15 screenshots, zero console errors/warnings |
| Ganesha regression | renders, poses and exports unchanged; 0 warnings |
| Shiva regression | unchanged; 0 warnings |

### Performance

One draw call for the whole body. 26,756 triangles is comparable to the
existing AI head asset alone (64,669). Morph changes are GPU influence
updates with no rebuild while nothing is fitted to the body.
