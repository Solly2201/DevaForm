# The DevaForm Artist Asset Contract

Drafted 2026-10-05 against `5ed3be9`. **Not mandatory.** Production
artists continue to deliver against `artist-handoff.md` and
`asset-specification.md`; this adds the half of the contract neither of
them covers and prototypes the gate that would enforce it.

## Why there is a gap at all

`validate-assets.mjs` already checks what an **exporter** can get wrong:
container, bounds, zone names, `JOINT_<id>` groups, skin joints, morph
names, file layout. It is thorough, and every defect this quarter got past
it — because every defect was in the other half.

The other half is what the asset **declares about itself**. A band that
goes round a limb has to say so, or the only thing keeping it on a limb is
whichever generator happened to build it. An earring has to say it passes
through an earlobe, or a containment check reports a correctly made
earring as a defect. Neither of those facts is visible in a GLB and
neither can be inferred from one.

---

## 1. What exactly does an artist receive?

Unchanged from `artist-handoff.md`: this document, `canonical-rig.json`,
`devaform_template.py`, reference boards, and the task — id, version,
category, and either a part **slot** or the attachment **sockets**.

**Added by this contract:** the task also names the asset's **relationship
class**, one of `encircles`, `restsOn`, `drapes`, `appliedTo`,
`piercedThrough`, `held`, or `none`. It is a sentence, not a measurement:
*"this goes round a wrist"*, *"this is painted on a forehead"*. The artist
does not compute anything from it; it tells them what the piece has to be
able to do, and it tells the engine what to hold it to.

## 2. What exactly do they return?

Unchanged: `model.glb` plus the dataset directory
(`asset.json`, source file, references) per `production-asset-pipeline.md`.

**Added:** a one-paragraph **fit note** in the delivery — what the piece
is worn on, what it is worn over, and anything about it that is
intentionally inside the body. That last clause is the one that pays:
without it, an earring's hook and a crown's band are indistinguishable
from defects, and the engine cannot be taught the difference by looking.

## 3. Which fields are mandatory?

Derived from what the asset IS, not from a flat list.
`requirementsFor(asset)` in `ingestion.test.ts` is the executable version.

| when | required | why |
|---|---|---|
| always | `id`, `version`, `name`, `kind`, `source`, `stage`, `deityCompatibility`, `printability` | identity, placement, lifecycle, and which of the three manufacturing states it is in |
| part in `armlets` / `bracelets` / `anklets` | `fit.kind === "encircles"` | a band is sized by what it CONTAINS. Vishnu's armlet sat 16 mm inside his arm while passing every check that existed |
| attachment on `head.forehead` | `fit.kind` of `appliedTo` **or** `restsOn` | paint has no clearance; a jewel does. The asset must say which; the contract does not care which |
| attachment on a `*.hand.item` socket | a presentation carrying a `grip` | a fist closes onto the radius the ITEM declares. Without one it closes to a fixed diameter and meets a drum head as readily as a staff |
| attachment, any | at least one socket | an attachment with nowhere to attach fails as a silent absence rather than an error |
| `stage` of `integration` or `production` | `provenance`, unless procedural | an asset a customer can see must be traceable to a tool, a reference, or a generator |

`materialZones` was a candidate and was **dropped**: an empty list is the
correct answer for a mark made of ash, and nothing distinguishes that from
an oversight. A rule that cannot discriminate is noise.

## 4. Which fields does DevaForm generate?

Everything measured. Artists never type these and should never copy them:

- all of `bodyProfile`, `torsoSurface`, `legEnvelope`, `skullEnvelope` —
  produced by `build-human-base.mjs` and copied into the manifest by
  `sync-measured-manifest.mjs`, mechanically, because a hand-copied
  measurement drifts and a drifted measurement is worse than none;
- `backArmRest` for the four-armed body;
- every per-morph delta of the above.

The sync is one-way and the test suite holds the manifest to the built
asset afterwards.

## 5. Which fields does the artist author?

Identity (`id`, `version`, `name`, `description`), placement intent
(`kind`, sockets or slot, `defaultTransform`, `socketTransforms`),
compatibility, `materialZones`, `presentations` including `grip`, `fit`,
`printability`, `provenance`. All editorial or declarative; none measured.

## 6. Discrete variants or morph targets?

Decided by **what the thing is attached to**, not by preference:

- **Added geometry → a discrete variant.** Anything that sits ON a face
  or body: brows, hair, facial hair, ornaments, marks. It gets a slot and
  as many assets as there are choices.
- **Part of the base mesh → a morph target.** Anything that changes the
  face or body's own SHAPE: lips, nose, jaw, cranium, build. There is
  nothing to swap, so the variation has to be baked as a target on the
  GLB and exposed as a weight.

The test is simple: if the feature's geometry is inside
`humanoid.body.*`, it is a morph. See `docs/facial-variants.md`, where
this is the finding that decides what can and cannot be built today.

## 7. Which assets require a rig?

Only those whose geometry must **deform** with a joint: bodies, and any
part skinned across more than one joint. Everything else is rigid and
rides its parent — a crown does not bend, so it needs a socket rather
than a skin. `validate-assets.mjs` already enforces that a skinned
primitive's joints name joints of the skeleton the asset declares.

## 8. Which assets require an AttachmentFrame?

**None.** The attachment-graph experiment measured this and the answer is
in `docs/attachment-graph-experiment.md`: all three shipped figures build
a tree exactly one attachment deep, no asset in the catalogue is a child
of another, and where the model was used it placed things within a micron
of what production already does. The trigger for revisiting is the first
asset that is genuinely a **component** of another — a jewel a customer
swaps on a crown they also chose. Until one exists, an artist is never
asked for a frame.

## 9. Which assets require a `WornFit`?

Anything whose correctness depends on a relationship a depth check would
otherwise misread. Concretely: bands, marks, collars, garlands, and
anything deliberately inside the body. The five kinds are deliberately
few and `wornFit.test.ts` **fails if a sixth appears**.

## 10. Which assets require neither?

Held attributes (`GripFrame` already carries their physics), hair and
hair ornaments (the scene graph already states their one relationship),
body parts, and anything whose only placement fact is "it is attached
here". Roughly half the catalogue. See `docs/wearable-classes.md`, where
each class carries its verdict and the measurement behind it.

## 11. How are Blender → GLB exports validated?

Two passes, already built:

1. **`pnpm validate-assets`** — the file. Container, geometry, transform
   envelope, material zones, joint groups, skins, morphs, manifest
   cross-reference, layout. Severity scales with `stage`: a problem on a
   production asset is an error, the same problem on a prototype may be a
   warning.
2. **the TypeScript suite** — the declarations. Sockets, grips,
   exclusions, categories, and now `requirementsFor` in
   `ingestion.test.ts`.

## 12. How are bad assets rejected before production?

By `stage`, which is a gate rather than a label. An asset moves
`concept → source → prototype → experimental → integration → production`,
and the severity of every check rises with it. A piece can sit at
`prototype` with known problems and ship nothing; it cannot reach
`production` with them.

**What this contract adds:** the gap between what the catalogue declares
and what it should is now a NUMBER, pinned in `ingestion.test.ts`. It was
four when first measured — two assets on a forehead that had not said
whether they were paint or a jewel — and is zero now. A new asset may not
raise it. That is how a non-mandatory contract becomes mandatory without a
flag day: the gate cannot be made worse while it is being adopted.

## 13. How are versions and provenance recorded?

`version` is a monotonically increasing integer per asset id; a
configuration stores `{ assetId, version }`, so a saved creation names
exactly what it was built from. `provenance` records `type`, `tool`,
`references` and `notes` — for procedural assets, the generator file and
the reference board it was drawn against.

The dataset directory is the other half:
`assets/<deity>/<category>/<name>/<version>/` holds the GLB, its
`asset.json` and its source, under version control, so a published version
is never overwritten in place.

---

## The prototype

`packages/asset-system/src/__tests__/ingestion.test.ts`.

**Enforced for three** representative assets, one of each shape the
contract has to describe — `ganesha.bracelets.kada` (a band),
`vishnu.forehead.tilaka` (a mark), `vishnu.attribute.gada` (a held
attribute) — with a test that fails if those three ever become three of
the same thing.

**Measured for the rest**, as a budget that may fall and may not rise.

What it deliberately does not do: block a build, gate a deploy, or ask any
artist to change anything they are currently doing.
