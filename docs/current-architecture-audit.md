# Current architecture audit

Taken against the local working tree at `6209fbd`, before the presentation
work. It records what the engine actually does today — not what the doc
comments say it intends to do — so the changes that follow can be judged
against a fixed starting point.

Baseline gates at audit time: 158 tests green (19 schema, 41 asset-system,
98 web), typecheck clean, `validate-assets` 0 errors / 0 warnings,
`build-human-base.mjs` reproducible byte-for-byte in ~1.1 s.

---

## 1. What is already correct

**One canonical skeleton, composed from explicit extensions.**
`humanoidJoints({ trunk, backArms, fingers })` and `humanoidSockets({ … })`
are driven by the same `SkeletonExtensions` object through
`defineSkeleton`, so a socket cannot exist without the limb it hangs from.
`HUMAN_SKELETON` declares `{ fingers: true }` and therefore genuinely has
no back-arm joints and no back hand sockets. This is the invariant §4 asks
for and it already holds.

**Finger chains are structural, not cosmetic.** Five named digits, three
segments each, one chirality rule (`fingerJoints` mirrors the thumb by
slot), per-axis limits, and deliberately no `uiGroup` so sixty joints do
not land in the pose UI. `HUMAN_SKELETON` ships measured rest offsets for
all thirty finger joints.

**The engine is deity-agnostic.** A repo-wide search for
`deity === "shiva"`, `'ganesha'` and friends in `apps/web/src` returns
nothing outside tests. Skeletons, pose presets, categories, arm options and
defaults all hang off `DeityDefinition`.

**Relational grip frame exists.** `GripMetadata { origin, axis, roll,
travel }` plus `gripFrameTransform` carries any authored axis onto the
socket's +Y, and `travel` bounds how far a planted staff may slide.
`gripChain.test.ts` holds that chain to account.

**Surface-aware attachment exists.** `walkSurface` evaluates a route
authored in (bearing, height) onto a body's measured torso surface with a
declared clearance, using monotone-limited interpolation. The naga is built
on it. This is the right primitive for §18 and needs no replacement.

**Measured body profiles.** A body asset may ship `bodyProfile`
(scalar surfaces, with per-morph deltas) and `torsoSurface` (a 20×32 radius
map). `deriveBodyProfile` blends by live morph influence. Procedural bodies
restate the constants their generator draws with, so selection is by data,
never by asset id.

**Regression fingerprint.** `sceneRegression.test.ts` hashes every node's
world TRS plus every mesh's vertex count and local bounds, pinned per
character. It has teeth (there is a test proving a 0.01 rad nudge breaks
it).

**Asset registry discipline.** Stable ids, versions, stages, provenance,
printability, `supersedes`, geometry metadata, a filesystem layout check in
`validate-assets.mjs`, and `validateRegistryConformance` checking manifest
claims against the skeleton an asset would actually run on.

**Serialization.** Versioned envelope, migration table keyed by source
version, strict validation after migration. Late-added schema fields
(`hands`, `arms`, the `hair` material zone) default on parse, so pre-field
saves load unchanged.

---

## 2. What is architecturally wrong

### 2.1 Two systems can independently place a held item

`CharacterRig` carries both `held` (the relational path: turn the HAND onto
the item) and `worldAlignedAttachments` (the override path: overwrite the
ITEM's world rotation). Which one an attachment takes is decided in
`buildRig` by:

```ts
const modelledHand = (bodyAsset?.morphTargets ?? []).includes(`grip${Slot}`);
const solvedByRig = upright && heldBy !== undefined && modelledHand;
```

So the transform pipeline forks on *whether the body is a mesh*. That is an
accident of implementation presented as a semantic rule. The stated
justification — "a procedural hand has its grip channel baked into
geometry, so rotating the wrist would move the fist off the axis its
fingers were built around" — is not true: `makeHand` builds the fist as a
child of the hand joint and curls every finger about `bendAxis = (1,0,0)`
in **hand-local** space. Rotating the wrist rotates the fist and its
channel together. The channel follows.

The real defect is one link lower. `orientGripSockets` aims a hand's item
socket along the grip channel **only for bodies that ship `thumbAxes`**. A
procedural hand never declares its channel, so its item socket keeps the
joint's default orientation, whose +Y runs down the *fingers*. An asset
authored shaft-along-+Y therefore lands with its shaft along the fingers,
sticking out past the fingertips — and the only thing that makes the
picture acceptable is the world override rotating the item back to
vertical, leaving the shaft crossing the fingers rather than passing
through the fist.

That is precisely the defect `references/reference_mid.png` calls out first:
*"Shaft is passing through the fingers. Hand is not actually holding it."*

**Verdict: replace.** One path. Every hand declares its grip channel; the
socket is aimed for every body; the hand is turned onto what it holds;
`worldAlignedAttachments` is deleted.

### 2.2 There is no presentation system, only two booleans

`ItemPresentation { upright?: boolean; grounded?: boolean }` cannot express
what §6 requires: that one asset has several legitimate presentations and
something deterministic chooses between them. The consequences are visible
in `buildRig`:

- The trishul's *second* presentation — standing on the base beside the
  figure when the hand is gesturing — is not declared anywhere. It is
  written inline in the attachment loop, including its own clearance
  constant `bodyProfile.dhotiRadius + 0.045` and its own side-picking rule.
  An unnamed presentation implemented as a renderer special case is exactly
  what §24 forbids.
- The damaru has no second presentation at all, so a blessing pose deletes
  it and logs `"…cannot hold it"`. §14 asks for *present differently / move
  to a compatible hand / release / warn*, chosen deliberately.
- `keepUpright` and `presentation.upright` are two fields for one idea.
  Ganesha's four attributes use the old one, Shiva's two use the new one.

**Verdict: replace** with first-class, versioned, serializable
presentations declared per asset.

### 2.3 No single resolution step

State is reconciled in at least three places, in an order only
`CharacterRoot.tsx` knows:

| Where | What it decides |
|---|---|
| `resolveHands` (schema) | pose gestures override configured mudras |
| `buildRig` (engine) | whether a gesturing hand may hold; grounded fallback placement; which transform path an item takes |
| `applyGestureOrientations` / `applyGripOrientations` (engine) | wrist and forearm |

There is no `resolveCharacterPresentation(config, deity, registry)`
producing `{ pose, hands, attachments, presentations, warnings, conflicts,
rejected }`. The renderer is therefore still making semantic decisions.

**Verdict: add**, and make `buildRig` a consumer rather than a decider.

### 2.4 A fist closes to a fixed radius whatever it holds

`build-human-base.mjs` says so itself:

> this is a fixed pose, not a closure that stops on contact. A hand closes
> to the same radius whatever it holds, which is why fingers still meet a
> drum head. […] Left as a known defect rather than half-built.

This is §12's complaint, and it is measurable: the shipped `gripFrontRight`
morph closes the hand to one tube diameter. A 17 mm trishul shaft and a
12 mm damaru waist get the same fist.

**Verdict: fix structurally.** The item declares the radius it presents at
the grip point; the body measures the radius its fist encloses at each end
of the closure range; the engine dials the morph to the influence that
matches. No per-item fudging.

### 2.5 Shiva's production body is primitives

`shiva.body.classic` → `humanoid.athletic`: lofted torso plus tapered-tube
limbs and sphere joint masses, with `humanoid.hands` rebuilding a
five-primitive hand per mudra. Against `references/ref3.png` — which asks
for adult masculine anatomy, a visible neck, believable clavicle → pec →
ribcage → waist → pelvis flow and believable hands — this cannot pass the
human-observer criterion, and no amount of positional tuning will make it.

The replacement already exists and is already tested: `humanoid.body.human`,
a 27,816-triangle skinned mesh on a measured skeleton with real hands,
fingers, eyes and morphs. `docs/human-base-migration.md` Stage 7 lists four
blockers, of which three are now tractable and one is honest metadata:

1. **Clothing** — procedural cloth on a real body. `humanoid.garment.hideWrap`
   already drapes against the measured profile; the reference wants a cream
   dhoti *under* the hide plus a kamarbandh sash, which is buildable from
   the same measurements.
2. **Item scale** — `handFit` exists; the remaining gap is the closure fix
   in 2.4.
3. **Back arms** — the human mesh has two. Shiva's default is two. The
   honest structural answer is that `armOptions` must be derived from the
   body's skeleton so the UI never offers four arms to a two-armed body.
4. **Print validation** — the asset is `experimental` with no print source.
   That stays true; what must change is that validation *enforces* the
   relationship rather than leaving it to a comment.

**Verdict: migrate**, and close 1–3 structurally.

---

## 3. What is incomplete (not wrong, just unfinished)

- `MIGRATIONS` is empty. The mechanism is right; it has never been
  exercised. Any schema change from here needs a migration and a test.
- Conformance checks manifest claims against skeletons but not grip
  geometry: nothing asserts that a declared grip origin lies inside the
  declared travel, that an axis is non-zero, or that a grounded
  presentation needs no hand.
- No pose × attribute matrix test. `gripChain.test.ts` covers three poses
  by hand.
- No clearance validation. Nothing machine-checks that the naga stays
  outside the torso from every bearing, or that a garment contains the legs.
- Editor communicates nothing about incompatibility: `setMudra` silently
  drops an attachment whose grip the new mudra cannot perform.
- `docs/architecture.md` predates the grip and surface-walk work.

---

## 4. What must be preserved

- **Ganesha, exactly.** Node count and scene digest are pinned. Any change
  must be shown to be intentional, explained in the commit, and looked at.
- **Save/share compatibility.** Every asset id currently resolvable must
  stay resolvable, including ones withdrawn from pickers.
- **The composed-skeleton model** (§2.1 of this document's "correct" list).
- **`walkSurface`** and the measured-profile derivation.
- **Asset versioning, provenance and printability metadata.**
- **MakeHuman as authoring-time only** — a test asserts the engine source
  never mentions it.

---

## 5. What can be deferred

- Finger-bone-driven mudras for procedural hands. The joints exist and the
  contract is defined; driving them would change Ganesha for no visual gain,
  because a procedural hand is rebuilt per mudra anyway.
- Four-armed Shiva on a mesh body. It needs a second pair of modelled arms,
  which is asset work, not engine work. Until then the option must not be
  offered for that body.
- Environment / camera / intro layer beyond keeping it out of deity code.
- A real print pipeline. The data model must stay capable of feeding one;
  building it is out of scope.

---

## 6. Decisions taken

| Decision | Why |
|---|---|
| Presentations live in `asset-system`, not the engine | They are asset data, and the resolver must be testable without THREE |
| One transform pipeline; the world override is deleted | §24; the fork was on body kind, not on meaning |
| Grip channel is declared by the hand that owns it | The hand geometry knows where its own fist hole is; nothing else does |
| Grip closure is driven by the item's declared radius | §12; the alternative is per-item fudging forever |
| Shiva's body variants become morph presets, not separate assets | One mesh, three silhouettes — which is what `references/ref3.png` shows |
| Superseded procedural Shiva bodies become `deprecated`, not deleted | `deprecated` is documented as "kept only so old saved characters still resolve" |
| `armOptions` is intersected with the body's skeleton | §4: it must be impossible to offer a limb the body does not have |

---

## 7. What changed since this audit

This section is the outcome, kept with the audit so the two can be read
together. Section 1–6 above remain as they were written at `6209fbd`; they
are the fixed starting point, not a live document.

**Gates now:** 257 tests green (29 schema, 70 asset-system, 158 web),
`typecheck` clean across all three packages, `lint` clean, `validate-assets`
0 errors / 0 warnings, and `next build` completes — a production build that
had never been run during the audit and which turned out to be broken by the
QA page's unsuspended `useSearchParams`.

### Closed

- **One resolution step.** `resolveCharacterPresentation(config)` in
  `asset-system/src/resolve.ts` returns pose, hands, attachments,
  presentations, warnings, conflicts and rejections. `buildRig` calls it
  once and decides nothing itself.
- **Presentations are first class.** `asset-system/src/presentation.ts`
  models mode, anchor, hand relationship, orientation, support, grip frame,
  stand and mobility. Trishul has `grounded` and `handheldShaft`; damaru has
  `pinchHeld` and `gripHeld`; lotus has `pinchHeld` and `palmHeld`.
- **One transform pipeline.** `worldAlignedAttachments` is gone; every
  attachment reaches the scene through the socket hierarchy.
- **The fist closes on what it holds.** `humanoidHands` builds each hand
  around the radius the held item's presentation declares, measured from
  the body's own `gripApertures`.
- **Anatomical hand solving.** `handSolve.ts` distributes a wrist target
  over shoulder twist, forearm pronation and wrist rotation, with `twist`
  declared per joint and applied about the bone's own axis. A gesture the
  arm cannot show is reverted rather than forced.
- **Conformance has grip and presentation teeth.** `validatePresentations`
  rejects a grounded presentation that names a hand, a handheld one that
  does not, a zero axis, a non-positive radius and negative travel.
- **Clearance and containment are machine-checked.** `shiva-rig.test.ts`
  measures the naga radially on each point's own bearing;
  `garmentFit.test.ts` reads the shipped body GLB, selects leg vertices by
  SKIN WEIGHT, and requires that none stands outside the cloth on its own
  bearing, above the hem on that bearing.
- **The measured body drives the clothes.** A body asset now ships a
  `legEnvelope` (14 rows of half-width, front and back) and the garment is
  cut to it.

### Found while closing it

- `deriveBodyProfile` was never handed the leg envelope, so every wrap was
  still being sized from mean limb radii — a calf came through the back of
  the dhoti in the render while the measurement sat unused in the manifest.
- The neck base was measured at the neck JOINT, which put the collar under
  the jaw. It is now a slab scan downward from above the joint.
- The manifest's copy of the measured numbers had drifted two builds behind
  the asset. `sync-measured-manifest.mjs` rewrites it mechanically and a
  test holds the two together.
- A cloth section is not an ellipse. A lower garment goes round two legs,
  and an ellipse through the same extents cuts the diagonals off.
- Folds that multiply a fitted radius can pull cloth INSIDE the body. They
  only ever add now.

### Still open

- `MIGRATIONS` is still empty — the mechanism is exercised by a test, not by
  a real schema change.
- The torso surface map carries no per-morph deltas (the scalar profile
  does). At the default morph weights the largest body delta is 8 mm on
  `chestRadiusX`, which the ornaments' clearance covers; a body variant
  pushed further would need the map to blend like the profile does.
- Four-armed Shiva on the mesh body still needs a modelled second pair.
- Finger-bone-driven mudras for procedural hands remain deferred, for the
  reason given in section 5.

---

## 8. The engine as it stands

Written at the end of the production run, describing what is actually in
the repository rather than what was intended. Sections 1–6 remain the
audit taken before any of it; section 7 records the first pass.

### One resolution, one pipeline

`resolveCharacterPresentation(config)` is the only place a configuration
is interpreted. It returns the skeleton, the arm slots that exist, what
each hand is doing, every attachment with the presentation it resolved
to, the features a selected part already embeds, and the issues a
customer needs to be told about. `buildRig` consumes that and decides
nothing; the editor renders `customerFacingIssues(resolved)` above the
panel.

Everything reaches the scene through the socket hierarchy. There is no
second transform path.

### What a body knows about itself

A body asset ships measurements, and everything worn on it asks rather
than assumes:

| Measurement | What reads it |
|---|---|
| `bodyProfile` (scalars, per-morph deltas) | every fitted generator |
| `torsoSurface` (20×32 radius map) | `walkSurface` — naga, mala |
| `legEnvelope` (14 rows) | the lower garment's sections |
| `thumbAxes` | which way a grip socket is aimed |
| `gripApertures` | how far a fist closes on a given radius |
| `gripSeats` | where a held object rests: `point + normal × radius` |
| `morphTargets` | the shapes the customer can blend |

The grip seat is the newest and the one that changed the most: a held
object used to sit at the centre of the hole a fist makes, which is a
third of a finger's length off the knuckles, so a staff was pinched in
the fingertips with daylight behind it. Objects rest on the palm now.

### Where the figure stands

`settleOnSupport` puts the lowest point of the body — in the pose it is
actually in, skinned vertices included — on the base. No pose carries a
height. `support.test.ts` holds every pose of both deities to half a
millimetre and loads the real body meshes to do it.

### Materials and pattern

`textures.ts` generates greyscale DataTextures from a seeded field: hide
rosettes, cloth weave, serpent scales. They multiply the zone colour, so
the customer still chooses what a garment is dyed while the texture says
only where the marking falls. `ZoneMaterials` grew `getMapped`,
`getMappedFixed` and `getPatternedFixed` for the three combinations of
(customer colour | fixed colour) × (texture | vertex colours).

This exists because a vertex colour is no smaller than the triangles
carrying it. A tiger's rosettes on a few hundred quads of cloth were
mottling however finely the cells were set.

Vertex colours still carry what geometry knows and a texture cannot: the
serpent's counter-shading (dark along the back, pale beneath, taken from
which way each face points) and the halahala on Shiva's throat, which is
painted into the body mesh and multiplies whatever skin colour is chosen.

### Extensions

`humanoidJoints({ trunk, backArms, fingers })` composes the skeleton, and
a socket cannot exist without the limb it hangs from. Four-armed Shiva is
offered only on a body whose skeleton declares `backArms` — the measured
human mesh does not, so it is not offered there, and a configuration that
asks for four arms on a two-armed body resolves to two without inventing
a socket. Three tests hold that.

### Still open

- `MIGRATIONS` is empty. `SCHEMA_VERSION` is still 1 and nothing in this
  run needed it to change.
- The torso surface map carries no per-morph deltas, unlike the scalar
  profile. `morphSafety.test.ts` covers every combination the editor can
  produce — the named variants, each morph alone at full, the default,
  nothing, and two degenerate corners — and the ornaments stay on the
  surface in all of them. The map should gain deltas before the morph
  range is widened beyond what those variants reach.
- 65 of 73 registry entries have no `provenance`. They are procedural, and
  the field is optional for that reason; a GLB-sourced asset has one.
- Hair and cloth detail is bounded by tessellation where no texture
  applies. The jata is forty-six lofted locks, not shaded strands.
