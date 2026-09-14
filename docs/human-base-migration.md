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

---

## Stage 2 — masculine morphology

**Commit:** `8018800` · **Result:** APPROVE STAGE

Build and morphology became separate morph targets, so a deity can ask for
a heroic silhouette without also asking for bulk.

- `bodyHeroic` — V-taper, broad back and deltoids, developed chest, waist
  taken in. Shoulder-to-hip ratio rises from 1.49 to 1.71 with the height
  and the skeleton untouched.
- `bodyAscetic` — the tapasvin: fat removed, stomach toned, chest depth
  reduced.

Both are girth-and-surface only: no modifier that moves a joint is used,
so all variants keep one topology and one skeleton.

One correctness fix fell out of measuring them. The first pass reported
morph deltas that were pure sampling noise — the waist was found by a
coarse scan, so each variant's "waist" landed on a different slice and the
deltas described the scan rather than the anatomy. Both torso volumes are
now bounded by skeletal landmarks and split halfway between the spine and
chest joints. The retarget also measures each variant's vertices from that
variant's own joint cubes before placing them on the shared canonical
joints: broader shoulders sit their cube further out, and rotating those
vertices about the neutral pivot was shearing the morph.

**Judged at** `bodyPowerful 0.35, bodyHeroic 0.85, bodyAscetic 0.3`. At
full heroic the deltoids read as inflated; at 0.85 the figure is strong
and tapered without caricature. That mix is the recommended Shiva build.

---

## Stage 3 — eyes and the divine face

**Commit:** `3ce0b51` · **Result:** APPROVE STAGE

The base mesh has eye sockets but no eyeballs, and a face without eyes
cannot read as an icon. MakeHuman's own CC0 eye proxy is now attached
during the export and refitted for every variant. It is a painted surface
— sclera, iris and pupil differ only by texture, and its outer layer is a
transparent cornea shell — so the export samples the artist's texture per
face and the builder turns those colours into DevaForm's fixed eye
materials, dropping the cornea. The mapping stays the artist's rather than
a guess at where an iris ought to be.

`faceDivine` gives the broad brow, long calm almond eyes, straight nose,
composed mouth, defined cheek and jaw, and the elongated lobes that
iconography gives to gods and ascetics.

Two invariants were fixed here:

- **Height.** The divine brow grew the skull by 9 mm, which would have made
  a customer's statue a different height depending on the face they chose.
  Every variant is now normalised to the canonical metre, and a test reads
  the shipped GLB's crown and sole vertices to prove no morph moves them.
- **Shading.** Vertex normals are angle-weighted rather than area-weighted,
  so the quad triangulation stops showing as faint creases on smooth skin.
  A separate diagonal banding turned out to be shadow-map acne rather than
  geometry; the evaluation routes now set a normal bias.

The base's ethnic mix moved toward South Asian. That belongs in the base,
not in a deity's morph: every deity DevaForm makes is Indian, so a
generically European foundation would be the wrong thing to build on.

---

## Stages 4 and 5 — Shiva's identity and dress on the human body

**Commit:** `71ba2d7` · **Result:** APPROVE STAGE

Putting Shiva's own head assets, ornaments, garment and attributes onto the
human base exposed one architectural gap and a family of sizing
assumptions.

**The gap.** `buildRig` took the skeleton from the deity, so the human mesh
was bound to Shiva's stylised rig — bones up to 139 mm from where the
mesh's own joints are, and a 1.35 m figure. A body asset now names the
skeleton its geometry was built for and the rig follows it. The body IS the
anatomy; the deity's skeleton remains the default for procedural bodies,
which are generated to whatever rig they are given.

**The assumptions.** Ornaments carried the girths of the body they were
first drawn on:

| Ornament | Authored | Measured on the human | Error |
|---|---|---|---|
| Armlet (upper arm) | 43 mm | 27 mm | +59% |
| Bangle (wrist) | 30 mm | 14 mm | +119% |
| Anklet | 43 mm | 20 mm | +113% |
| Jata (cranium) | 67 mm | 40 mm | +67% |

The measured profile now also carries where each band ornament seats on a
limb and how wide the limb is there, the cranium the hair and head
ornaments must fit, and the height at which a wrap ties. Procedural bodies
restate exactly the constants their generators were drawn with, so nothing
that exists today moves.

With that in place: the armlet, bangle and anklet sit on the limb instead
of around it; the jata scales onto the skull it lands on and carries the
crescent's seat with it; kundala and crescent scale with the head; the
rudraksha strand carries as many beads as its own measured length holds
instead of packing a fixed count into a slimmer neck; and the dhoti ties on
the hips and tapers to the hem.

Two socket fixes came out of it. The forehead socket was a fixed offset
above the head joint, which on a human skull put the third eye at the
crown; it is now found from the eyes, which is a landmark. And the jata's
refinement of the crescent socket travels with the jata's own scale.

---

## Stage 6 — hands that hold

**Commit:** `9947c78` · **Result:** APPROVE STAGE

A mesh hand is already modelled, so a mudra cannot build it in the pose it
wants — and a statue rig with fifteen bones per hand would wreck the pose
UI and stop matching the stylised rig the presets are written against.

The fingers are therefore articulated once at build time and shipped as
morph targets: real forward kinematics on MakeHuman's finger joints,
skinned with its own weights, using the same machinery the A-pose retarget
uses. The curl closes to a C, because a grip goes around a shaft rather
than into the palm.

A body that can close its hands declares `grip<ArmSlot>` morph targets, and
the engine dials them from the mudra the gesture system already carries: a
grip closes, a pinch half-closes, a blessing palm stays open. Bodies
without those targets are asked for nothing.

Shiva now holds his trishul and his damaru, and still shows an open palm in
Abhaya.

Also fixed here: the eye mesh shipped its morph targets unnamed, so the
eyes would not have followed the face morph at runtime.

---

## Stage 7 — production migration: NOT DONE, deliberately

**Result:** STOP. The candidate is not yet better than the default in every
way that matters, and the standing rule is that it must win before it takes
over.

Where the candidate is decisively better: anatomy, face, eyes, hands,
deformation under pose, and the fit of every band ornament, the mala, the
earrings and the head pieces. Where it is not yet good enough to be the
default:

1. **Clothing is still procedural cloth on a real body.** The dhoti now
   ties on the hips and tapers, but it is a pleated cylinder. On the
   stylised body that reads as stylisation; against real anatomy it reads
   as a barrel. The lower garment needs to become a fitted mesh, or a
   generator that drapes against the measured surface instead of
   approximating it with a lathe. This is the single biggest remaining
   visual gap.
2. **Hand-held attributes are sized for the old hand.** The damaru is
   visibly too large for a human palm. Attributes need what the band
   ornaments got: a measured hand, and item scale derived from it.
3. **The back arms have no geometry.** The human mesh has two arms; the
   skeleton carries four. Four-armed configurations are a real product
   option and the candidate cannot serve them at all yet.
4. **No print validation.** The asset is `experimental` and declares no
   print source. Migration means the print pipeline has to accept it.

Until those are closed, the procedural Shiva stays the default and the
human base stays compatible with no deity. Both resolve from the registry,
so a saved configuration naming either one still loads.

Compare them directly: `/studio/shiva` is the current default,
`/dev/shiva-human` is the candidate, `/dev/human` is the body on its own.
