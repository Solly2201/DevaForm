# Common DevaForm skeleton — architectural audit

Written before any code change, against the tree at `2766fcf`. Its purpose
is to establish what is actually true about the current rig architecture,
because the brief that prompted it assumes a situation the code does not
confirm.

---

## A. Current architecture

### A.1 There is already one skeleton contract, and it is honoured

The premise "Ganesha has one skeleton, Shiva another, MakeHuman a third,
and the engine reconciles them" is **not what the repository does.**

- `packages/character-schema/src/skeleton.ts` defines ONE joint vocabulary
  (`JointId`) and ONE hierarchy: `HUMANOID_CORE_JOINTS` (root, pelvis,
  spine, chest, neck, head, four arm chains, two legs) plus `TRUNK_JOINTS`
  as Ganesha's extension.
- `skeletons.ts` composes them: `defineSkeleton(id, joints, sockets)`.
  `HUMANOID_SKELETON` = core. `GANESHA_SKELETON` = core + trunk.
  `HUMAN_SKELETON` = **the same joints, the same hierarchy, the same rest
  orientation** — only the rest POSITIONS are replaced with measurements
  taken from the MakeHuman mesh.
- `apps/web/src/engine/skinning.ts` requires a skinned GLB's bones to be
  named after canonical joint ids, **discards the file's own skeleton**,
  re-binds the mesh to the live rig's joints, and warns when a bone rests
  more than 5 mm from the joint it claims.
- `apps/web/scripts/build-human-base.mjs` maps every MakeHuman bone onto a
  canonical joint (`devaformGroup`) and throws on any bone it cannot map.

So the core of what the brief asks for — one anatomical contract, meshes
conforming to it, deity extensions composed rather than copied — **already
exists, and is enforced at build time and at load time.** The registry is
already the source of truth; filesystem paths appear only as
`source.path`. Morphs are already separate from bones. `BodyProfile` and
`surfaceWalk` already keep surface fitting out of the skeleton.

Building a second "common skeleton" on top of this would be the rewrite
the brief itself warns against.

### A.2 What is genuinely broken

Four real defects, three of them downstream of one omission.

**P1 — The hand is a stub, and there are two incompatible hand models.**

The core rig ends at `arm.<slot>.hand`. There are no finger or thumb
joints. Two unrelated implementations fill the gap:

| | Procedural hands (`generators/body.ts`) | Mesh hands (human base GLB) |
|---|---|---|
| Shape | `MUDRA_SHAPES` table, geometry rebuilt per mudra | one baked `grip<Slot>` morph, fixed curl |
| Grip point | socket refined per mudra by `gripPoint()` | fixed socket plus a runtime frame solve |
| Chirality | `side: 1 \| -1` passed into the generator | `thumbAxes` measured off the mesh |
| Closure radius | implicit in the table | **fixed** — same radius for a shaft and a drum |

`build-human-base.mjs` proves the anatomy is available and then thrown
away: MakeHuman ships `finger1-1 … finger5-4`, `metacarpal1-5`, `jaw`,
`eye` and the facial muscle bones, and `devaformGroup()` collapses all of
them into `arm.*.hand` and `head`. The script says why — *"a statue rig
with 15 bones per hand would make the pose UI unusable"* — and
reintroduces closure as a fixed-pose morph, with a comment naming the
consequence.

This is the root cause of the trishul and damaru problems. Neither hand
model can close to two different radii, so neither can hold two
differently sized objects correctly.

**P2 — A grip resolves through four stacked mechanisms, and world space
wins.**

For one held item, in order:

1. `asset.grip { origin, axis, roll }` → `gripFrameTransform()` — the
   relational part, and the only part that matches the brief's model.
2. `asset.socketTransforms[socketId]` ?? `asset.defaultTransform` —
   **additive** euler and position offsets.
3. `attachment.offset` from the configuration — additive again.
4. `alignUprightAttachments(rig)` — **overwrites the object's world
   quaternion to identity**; `groundedAttachments` **overwrites its
   position** from a world-derived base height.

Step 4 supersedes steps 1–3 for exactly the items that motivated this
work. `GripMetadata`'s own doc comment admits it: *"keepUpright items are
re-verticalized in world space after posing, which supersedes the frame's
world orientation by design."* For the trishul, the declared grip frame is
decoration.

**P3 — Extra limbs live in the core and fall back silently.**

`HUMANOID_CORE_JOINTS` always builds four arm chains; `arms.count` only
decides which are *rendered*. `HUMAN_JOINT_POSITIONS` measures the front
pair only, so on a mesh body the back pair keeps stylised offsets.
Measured on the current tree:

```
arm.frontLeft.upper   human  [0.105, 0.057,  0.037]   measured
arm.backLeft.upper    human  [0.175, 0.110, -0.045]   stylised, unmeasured

hand item socket, human-bodied Shiva, arms.count = 4:
  frontRight  x = -0.127
  backRight   x = -0.195      <- 7 cm out, no arm geometry, no warning
```

`rig.warnings` is empty. An item attached to a back hand on a mesh body
floats beside the ribs.

**P4 — Nothing validates conformance.**

A body asset declares `skeleton: "human"`, `morphTargets`, `thumbAxes` and
`bodyProfile` as four independent facts. Nothing checks that they agree
with each other, or with the skeleton they name. The only runtime check is
`skinning.ts`'s rest-drift warning, and a warning is not a failure.

**P5 — Facial articulation does not exist.** Jaw and eye bones are
collapsed into `head`; faces vary by morph (`faceDivine`) only. For static
murti that is defensible, and this audit does not propose changing it —
recorded so the decision is explicit rather than accidental.

### A.3 Responsibility map as it stands

| Concern | Lives in | Verdict |
|---|---|---|
| Joint vocabulary and hierarchy | `skeleton.ts` | correct |
| Skeleton composition / extensions | `skeletons.ts` | correct, under-used |
| Rest proportions per body | `HUMAN_JOINT_POSITIONS` | correct, incomplete (P3) |
| GLB to rig binding | `skinning.ts` | correct |
| Sockets | `sockets.ts` plus asset refinement | correct |
| Hand shape | two places | **duplicated (P1)** |
| Grip resolution | four places | **conflicting (P2)** |
| Surface fitting | `bodyProfile.ts`, `surfaceWalk.ts` | correct, keep |
| Morphs | `morphs.ts`, `skinning.ts` | correct, keep |
| Registry | `registry.ts` | correct, keep |

---

## B. Proposed architecture

Not a new skeleton. Four changes to the one that exists.

### B.1 Hands become part of the core rig

Add a finger and thumb chain to `HUMANOID_CORE_JOINTS`, following the
existing naming convention:

```
arm.<slot>.hand
├── arm.<slot>.hand.thumb.01 / .02 / .03
├── arm.<slot>.hand.index.01 / .02 / .03
├── arm.<slot>.hand.middle.01 / .02 / .03
├── arm.<slot>.hand.ring.01 / .02 / .03
└── arm.<slot>.hand.little.01 / .02 / .03
```

15 joints per hand. They are **not** exposed in the pose UI: `uiGroup` is
omitted, which is the mechanism `computeJointUiGroups` already uses to
hide the root. The pose UI is unchanged; mudras and grips drive the
fingers programmatically.

This makes the hand chiral by anatomy rather than by an axis constant, and
lets a closure stop where the object is instead of at a baked radius.

### B.2 Extra arms become an extension

`HUMANOID_CORE_JOINTS` keeps the front pair. `BACK_ARM_JOINTS` becomes an
extension alongside `TRUNK_JOINTS`, and a skeleton that does not declare
it has no back arm joints and no back hand sockets — so P3 becomes
structurally impossible rather than a silent 7 cm error.

`activeArmSlots()` and `arms.count` stay exactly as they are, for
configuration compatibility; the skeleton simply stops offering joints the
body cannot fill.

### B.3 One grip pipeline, relational end to end

```
hand rig  ->  hand grip frame (from the finger chain)
                     ^  solved
attribute grip frame (declared)  ->  attribute
```

`ItemPresentation.upright` and `.grounded` stay — they are a real and
separate statement about iconography — but they must be expressed as
**constraints solved into the joint chain**, not as post-hoc world-matrix
overwrites. Practically: `alignUprightAttachments` stops writing the
attachment's world quaternion and becomes an input to the arm solve, which
is already where `applyGripOrientations` operates.

### B.4 Conformance is validated, not assumed

A `validateSkeletonConformance(asset, skeleton)` check, run by
`scripts/validate-assets.mjs` and by a test: the declared skeleton exists;
every declared morph target is present in the GLB; `thumbAxes` covers
exactly the arm slots that skeleton has; a body claiming a skeleton with
back arms actually has bones for them. Unsupported combinations fail
loudly instead of falling back.

### B.5 Filesystem

`apps/web/public/assets/` currently holds three directories. The proposed
`foundations / features / clothing / ornaments / attributes / characters`
layout is right, but moving three folders is not where the value is, and
every move invalidates a `source.path` in a manifest. Proposal: adopt the
layout for **new** assets, and move existing ones only when their version
is bumped for another reason. The registry stays authoritative; paths stay
opaque.

---

## C. Migration plan

Each step is independently shippable and independently revertable.

| # | Step | Touches | Ganesha risk |
|---|---|---|---|
| 1 | `BACK_ARM_JOINTS` extension; Ganesha and the stylised humanoid declare it, `HUMAN_SKELETON` does not | `skeleton.ts`, `skeletons.ts`, `sockets.ts` | none — Ganesha keeps four arms by declaring the extension |
| 2 | Conformance validation and tests; fix whatever it surfaces | `asset-system`, `validate-assets.mjs` | none — additive |
| 3 | Finger chain in the core (hidden from the pose UI); `build-human-base.mjs` stops collapsing finger bones; human GLB rebuilt | `skeleton.ts`, builder, human GLB | none — Ganesha's body is procedural and gains unused joints |
| 4 | Mudras and grips drive the finger chain; retire the `MUDRA_SHAPES` bend tables and the `grip<Slot>` morph | `body.ts`, `pose.ts`, `poses.ts` | **HIGH — this is where Ganesha's hands could change visually** |
| 5 | Grip constraints replace the world-matrix overwrites | `rig.ts`, `pose.ts` | medium |
| 6 | Filesystem layout for new assets | paths only | none |

Steps 1–3 are foundation and safe. Step 4 is the one with teeth: Ganesha's
hands are currently *generated geometry per mudra*, so driving fingers by
bones means regenerating that geometry. If it cannot be made
pixel-identical, the correct outcome is that **Ganesha keeps the
procedural hand generator** and only mesh bodies use the finger chain —
the extension mechanism supports exactly that, and the protection of
Ganesha outranks uniformity.

## D. Risks

1. **Ganesha's hands (step 4).** The only place the migration can cause a
   visual regression. Mitigated by keeping the procedural generator as the
   Ganesha path if pixels move.
2. **Human GLB rebuild (step 3).** Adding 30 bones changes skin weights,
   vertex influence counts (the spec caps them at 4 per vertex) and file
   size. The current collapse guarantees that cap; per-finger weights may
   not.
3. **Pose UI.** 30 hidden joints rely on `uiGroup` being optional. That is
   already true, but `JOINT_UI_GROUPS` and any consumer iterating all
   joints needs checking.
4. **Save compatibility.** `jointOverrides` is keyed by `JointId` and
   validated against the union of all skeletons, so new joints widen the
   union and stay forward-compatible. Removing back arms from
   `HUMAN_SKELETON` does not remove them from the union, so old saves
   still validate. Read from `configuration.ts`; to be proven by test.
5. **Scope.** Steps 4 and 5 together are the real work. Steps 1–3 could
   ship on their own and still deliver most of the structural benefit.

## E. What must remain unchanged

- Ganesha: procedural body, gestures, attachments, rendering, pixel
  baseline.
- `/studio/shiva`: the procedural Shiva default.
- `CharacterConfiguration` v1: every existing save, share and order must
  load and render identically. New joints may be added to the union; none
  may be removed from it.
- `BodyProfile` and `surfaceWalk` surface fitting — a serpent around a
  neck is not a bone problem and must not become one.
- Morph-driven morphology (`bodyAthletic`, `faceDivine`, …) stays separate
  from articulation.
- MakeHuman stays an authoring-time source with no runtime dependency.
