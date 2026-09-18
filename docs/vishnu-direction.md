# Vishnu — direction, and what "prepared" means

Reference: `references/ref_vishnu.png`.

Vishnu is **offered**. Everything below exists in code today — a
four-armed body, assets, presentations, poses, editor panel, a default
configuration — and is validated by the same build gates as Ganesha's and
Shiva's. `available` is true, and the Studio renders him through exactly
the pipeline the other two use.

The sculpt pass that flipped the flag added what "not offered" was
waiting on: the kirita mukuta with its full drum and finial, the urdhva
pundra tilaka on the measured forehead, flowing hair under the crown, the
grounded head-down gada, the standing chakra, and a palette taken from
the reference rather than from defaults. What remains is refinement, not
absence — see *What is deliberately missing*.

This document is the decision record for the next person who picks him up.

## Why he was prepared this way

The brief for this pass was explicit: do not build Vishnu-specific hand
architecture, attachment engine, pose resolver, body system or asset
schema. That is not a limitation on Vishnu — it is the **test**. The
engine spent this whole cycle becoming deity-agnostic: a measured body, a
resolver that decides what each hand can do, a grip solver that closes
fingers on a declared radius, a surface walker that routes things over
real skin. If adding a god is now a matter of *describing* one, the work
landed. If it needed engine code, it did not.

Adding Vishnu needed **no engine code**. Everything in
`packages/asset-system/src/manifests/vishnu.ts` is declaration, and the
only new file under `apps/web/src/engine/` is `generators/vishnu.ts` —
six shapes (mace, discus, conch, lotus, crown, garland) that know nothing
about hands, sockets, poses or bodies. That separation is the result.

One shared change was needed and is not Vishnu's: resolution now asks
`deityRuntime(id)` rather than `getAvailableDeity(id)`, so a deity under
preparation can be resolved and therefore verified. What a customer is
*offered* is unchanged — the editor lists `AVAILABLE_DEITIES`, and a
deity with `available: false` appears in no picker.

## Identity

Four arms, by iconography. The figure the reference shows is calm rather
than dynamic: a king at rest, not a dancer. Where Shiva's silhouette is
asymmetric and vertical, Vishnu's is symmetric and columnar, and the arms
are arranged in a strict hierarchy:

- the **front pair** works at hip height — one hand steadying the mace on
  the ground, the other presenting the lotus;
- the **back pair** is raised beside the head with the discus and conch.

That hierarchy is what makes four arms read as four arms rather than as
two copies of the same pair, and every pose preset keeps it.

`armOptions: [4]`, and there is now a body that has them.

## The four-armed body

`humanoid.body.human4` — the measured human with a second pair of arms,
built by `apps/web/scripts/build-human-base.mjs` alongside the two-armed
one, from the same export, in the same run.

The second pair is **the same arm again**. Four arms are iconography, not
anatomy, and there is no scan of a four-armed man to import; what there
is is a measured human arm, skinned and morphed and fingered and already
correct. So the build copies that arm's vertices, triangles, weights and
morph deltas to a second shoulder and binds them to a second chain of
joints. Everything true of the front pair is true of the back pair,
including whatever nobody would have thought to copy.

It is one skinned mesh, not two bodies touching: one skeleton, one set of
morph targets, one material. A heroic build widens all four shoulders,
and a print is a single object.

Where they go is measured too — behind and below the front shoulder by
about the depth of a deltoid, splayed a little further out. Far enough
that the seam where the copy enters the torso is inside the ribcage and
cannot be seen; close enough that the pair reads as one figure's
shoulders rather than as a second torso.

The rest positions the copy lands on are **emitted by the build** and
pasted into `HUMAN_BACK_ARM_POSITIONS` in the schema, because the rig
places joints from the schema. A joint the schema puts anywhere else is a
hand in the wrong place for every pose ever written; a test holds the two
to each other.

The resolver needed nothing for any of this. Asked for four attributes on
the two-armed mesh it still places the front pair, refuses the back pair
and gives a customer-facing reason — the behaviour `vishnu.test.ts`
pins — and asked for them on this body it places all four.

## The four attributes

Each declares how it may be held, in the shared grip vocabulary. The
interesting part is that all four wanted a *different* answer, and the
vocabulary had all four already:

| Attribute | Held | Why |
|---|---|---|
| **Kaumodaki** (gada) | `grip`, `support: "ground"`, 9 mm shaft, ±60 mm travel | A mace is heavy. Its weight goes on the ground and the hand steadies it — the same problem as the trishul, so the same answer. A second `grounded` presentation takes over automatically when that hand is asked to bless. |
| **Padma** (lotus) | `pinch`, 4 mm stem | The thinnest thing any hand in the product takes. A flower weighs nothing, so no support is declared. A second, non-auto `palmHeld` presentation exists because a lotus lying in an open palm is a *different gesture*, and which one is the customer's choice. |
| **Panchajanya** (shankha) | `hold`, 28 mm body | Not a staff and not a pinch: a fist-sized body cradled with the fingers round its widest part. The solver curls onto a radius rather than closing into a fist. |
| **Sudarshana** (chakra) | `hold`, 6 mm — *the finger's radius, not the disc's* | The one attribute that is **not gripped.** A fist round the rim of a blade puts fingers through the blade, and a disc big enough to read at statue distance has no handle. The reference balances it on a raised finger, so that is what is declared: the hand closes on nothing, the disc sits above it, and no geometry passes through any other. |

The chakra is the honest case worth keeping in mind. It would have been
easy to declare `grip` and let the solver produce a plausible-looking
fist that intersects the disc. Declaring what is actually true — that the
hand supports rather than encloses — costs one word, and is the
difference between a statue that survives being looked at and one that
does not.

## Crown, jewellery, garment

- **Kirita mukuta** — the tall royal crown, on `head.crown`: a band that
  GRIPS the head, ribs up a tapering tower, stones round the band and a
  bud at the top. The band is sized by what contains the skull, not by
  `headRadius` — that is a mean, the skull is an ovoid, and a band built
  at the mean cuts through the temples. (The same lesson the limb bands
  learned.)
- **Vaijayanti** — the long forest garland, on `chest.mala`, falling past
  the knees: five-petalled blooms with pale hearts, threaded on a route
  walked over the measured torso by the shared surface walker. Blooms
  rather than beads, because Shiva already wears two rows of beads and
  because a vaijayanti is flowers. Petals need VOLUME — flattened to a
  third of their width they render as red dashes painted on the chest.
- **Golden dhoti** — the **shared** `humanoid.hideWrap` generator with
  Vishnu's parameters (`{ length: 1, hide: 0, dhoti: 1, drape: 1 }`). A
  dhoti is a dhoti: same measured legs, same gathering, different dye.
  Writing a second one would be writing the same file twice with
  different numbers in it.
- Earrings, armlets, bracelets and anklets use the **existing slots**.
  Vishnu is heavily jewelled in the reference and will want denser
  ornament than Shiva, but that is asset authoring, not new structure.

## Colour and material

| | |
|---|---|
| Skin | Deep blue — `#6f8fd0` primary, `#5d7cbb` in shadow. Satin, not gloss; polished blue reads as plastic. |
| Garment | Golden yellow `#e8b53c` with a deep red border `#b3352f`. |
| Metal | Warm gold `#d8a637`, polished — crown, mace head, discus, conch mount. |
| Base | Pale stone, lotus. |

The palette is the one place Vishnu differs sharply from both existing
deities (grey-blue ash and elephant grey), and it is worth checking the
skin against the gold ornament under the product's lighting before
committing: blue and gold at equal saturation fight.

## Poses

`VISHNU_POSE_PRESETS` — three, all standing:

- **Regal** — upright and symmetrical, all four attributes presented.
- **Blessing** — the front right hand raised in abhaya. The mace it was
  steadying grounds itself beside the figure; the resolver does this, and
  the customer is told in words.
- **Serene** — weight on one foot, shoulders soft; the same attributes at
  rest.

Seated (on Garuda, or on the coiled Shesha) is the obvious fourth and is
deliberately absent: both need geometry that does not exist.

## Garuda is a companion, not a body part

Explicitly out of scope, and out of Vishnu's mesh. Garuda is a **second
figure**, and a statue containing two figures is a different product
shape from a statue containing one: separate model, separate print
considerations, separate price. The correct place for him is alongside
the base system as a companion, not welded to a deity's body. Nothing in
the current preparation assumes him, and nothing blocks him later.

## What is deliberately missing

Everything left is **sculpting**. Rendered in the Studio today, the
figure is correct and unfinished: four arms with four attributes in four
hands, a crown that grips the head, a garland of blooms, a dhoti, no
holes, nothing floating, no intersections. And:

1. **The conch is a white vase.** The spiral is there; the shape is not.
2. **The discus is a plate with flame points.** It stands upright and
   clears the fingers, which is the hard part; it does not yet read as
   the Sudarshana.
3. **The dhoti is a smooth column.** The same defect the tiger hide
   replaced on Shiva: a surface of revolution round both legs reads as a
   tube, and what makes cloth read as cloth is the wrap — an overlapping
   edge, a pleated fan, a hem that is not level.
4. **The face and hair.** He wears the shared human head and no hair
   asset, so he is bald under the crown.
5. **Ornament density.** The reference is far more jewelled; the slots
   all exist and are filled with Ganesha's pieces.
6. **Seated poses** (on Garuda, or the coiled Shesha), per above.

## How to finish him

None of it should require engine work:

1. Replace the prototype generators — conch, discus, crown, garland —
   with production geometry. They are shapes and nothing else; no other
   system knows what they look like.
2. Give the dhoti the wrap that the tiger hide got: an overlap, a
   cascade, and a hem with a shape.
3. Author hair, and the ornament density the reference shows.
4. Add seated poses once there is something to sit on.
5. Flip `available` to `true` and move the `preparing` block's contents
   into the definition. It is a few lines, and they are already written:
   `preparing.defaultConfiguration` is the configuration he will ship
   with, and it resolves and renders today.

That step 5 is a few lines is the point of steps 1–4 being the work.
