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
