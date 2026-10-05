# Facial variants: the architecture, and what has no geometry yet

Audited 2026-10-05 against `76cef75`.

The request was selectable variants for eyes, eyebrows, lips, nose, ears,
hair, facial hair and head shape, for Shiva and Vishnu. The useful answer
is not a list of what to build: it is that **this face is made two
different ways, and only one of them can carry a variant today.**

---

## 1. Two mechanisms, and which feature belongs to which

A mesh-bodied deity's head is **inside the body GLB**. Shiva's and
Vishnu's defaults say so in as many words — `head: null`, `eyes: null`,
`hands: null`, with the comment *"the four-armed mesh: one body, four
arms, its own head, face, eyes and hands — so those slots stay empty"*.

That splits every requested feature in two:

| mechanism | what it can vary | how a variant is expressed |
|---|---|---|
| **added geometry** | things that sit ON a face: brows, hair, facial hair, jewellery, marks | a part in its own `PART_SLOTS` slot, built from the measured skull |
| **morph target** | the face's own SHAPE: lips, nose, jaw, cranium | a named morph on the body GLB, authored upstream and baked at build time |

Nothing in between. A lip variant cannot be added geometry without hiding
the lips already in the mesh, and a brow variant cannot be a morph without
an upstream morph to drive.

## 2. What exists

| feature | assets | mechanism | available to |
|---|---|---|---|
| eyebrows | `humanoid.brows.serene / arched / strong` | added geometry | every human-faced deity — `deityCompatibility: []` |
| hair | `vishnu.hair.flowing / gathered / cropped` | added geometry | Vishnu |
| hair (matted) | `shiva.jata.crown / flowing` | added geometry | Shiva |
| eyes | `shiva.eyes.open / serene`, `ganesha.eyes.lotus / open / serene` | added geometry | the **stylised** body path only; the mesh bodies' eyes are baked in |
| ears, tusks, trunk, head | 4 + 4 + 4 + 5 Ganesha assets | added geometry | Ganesha |
| face shape | `faceDivine` | morph target | every mesh body, as a single slider |

## 3. What has no geometry, and why

Recorded rather than fabricated, which is what the brief asked for:

- **Lips, nose, jaw, cranium shape.** The human base ships **one** face
  morph, `faceDivine`. There is no lip, nose or jaw morph to select
  between. Producing them means authoring targets in MakeHuman, exporting
  through `tools/humanbase/export-makehuman.py`, and re-running
  `build-human-base.mjs` — upstream work on a source asset, not engine
  work. **This is the blocker, and it is a content blocker.**
- **Facial hair.** No asset and no slot. Unlike the four above, this one
  needs no new source geometry: a beard is added geometry built from the
  measured skull, exactly as the brows are, so it is a new slot plus a
  generator plus variants. Buildable today.

  **And deliberately not built.** Checked against the canonical
  references rather than against the request: `ref4.png` shows Shiva
  clean-shaven, and `ref_vishnu.png` shows Vishnu clean-shaven in all
  four views and in the face close-up. Ganesha has an elephant's head.
  So no figure this product ships wants facial hair, and adding a slot
  for it would offer a customer a variant none of the iconography calls
  for — which is the opposite of what the reference sheet is for. This
  stops being a gap and becomes a decision; it changes the day a deity
  who wears a beard is added.
- **Eyes, for the mesh-bodied deities.** The slot exists and the assets
  exist, but a mesh body's eyes are already in its GLB, so selecting one
  would double them. Either the eyes come out of the base mesh, or eye
  variation becomes a morph. Both are upstream decisions.

## 4. The seven properties, verified

| | mechanism | state |
|---|---|---|
| schema representation | `CharacterConfiguration.parts`, keyed by `PART_SLOTS` | ✅ |
| asset identity | `{ assetId, version }` per slot | ✅ |
| compatibility | `deityCompatibility` on the asset; `[]` means any | ✅ |
| variant selection | the Studio's Face and Head panels read the slot's candidates | ✅ |
| deterministic rendering | `sceneRegression.test.ts` pins the built scene; `featureVariants.test.ts` fails when two declared variants build the SAME geometry — a parameter the generator ignored | ✅ |
| save/load compatibility | `parts` is a record, so a creation saved before a slot existed simply does not mention it, and the slot defaults | ✅ |
| graceful fallback | an unresolved `assetId` warns and is skipped rather than throwing; `integratedFeatures` suppresses a slot when the BODY already provides that feature, which is what keeps a mesh body from growing a second set of eyes | ✅ |

The property worth singling out is `featureVariants.test.ts`. The failure
mode of "one generator, a handful of numbers, and the manifest spends
them" is a variant that is declared, listed, selectable and **identical to
its neighbour** — and that test builds each one and measures it against
the others. A catalogue of choices that are not choices is the exact
failure this architecture invites, and it is already guarded.

## 5. Recommendation

The architecture does not need changing. What the request needs is
**source assets**, and the order that costs least:

1. **Facial hair** — no upstream dependency. A new `facialHair` slot, one
   generator fitted to the measured skull, two or three variants. The
   brows are the template.
2. **Face morphs** — `faceNose`, `faceLips`, `faceJaw` authored in
   MakeHuman alongside `faceDivine`, then rebuilt. Each becomes a slider,
   and `BodyProfile` picks up their surface deltas for free because the
   measurement pipeline already carries per-morph deltas.
3. **Eyes on mesh bodies** — only worth doing if 2 does not already cover
   what a customer wants from it.

No placeholder variants were added. A selectable list of three identical
noses would pass every structural check in this document and be worth
nothing.
