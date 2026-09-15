# Vishnu — direction, and what "prepared" means

Reference: `references/ref_vishnu.png`.

Vishnu is **registered and not offered**. Everything below exists in code
today — assets, presentations, poses, editor panel, a skeleton with four
arms — and is validated by the same build gates as Ganesha's and Shiva's.
No customer can select him, because he has no body, face or crown of
production quality, and a rushed one would be worse than none.

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

`armOptions: [4]`. Note what this does *not* mean: a configuration can
only render the arms the **selected body** has, and the measured human
mesh has two (`armOptionsFor` narrows iconography to anatomy). A
four-armed Vishnu therefore waits on a four-armed body. The resolver
already handles the mismatch honestly today — asked for four attributes
on a two-armed mesh it places the front pair, refuses the back pair, and
returns a customer-facing reason, which is the behaviour
`vishnu.test.ts` pins.

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

- **Kirita mukuta** — the tall royal crown, on `head.crown`, worn with
  clearance over the measured head. Vishnu's crown is his most
  recognisable feature after the four arms; the current generator is a
  placeholder silhouette and is the single biggest piece of remaining
  modelling work.
- **Vaijayanti** — the long forest garland, on `chest.mala`, falling past
  the knees. Routed over the measured torso by the shared surface walker,
  like Shiva's rudraksha.
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

1. **A body.** `humanoid.body.human` is the measured two-armed mesh
   shared with Shiva. Vishnu needs a four-armed one before he can be
   offered, and building it is the gating item.
2. **A face and crown of production quality.** The current generators are
   prototypes and are marked `stage: "prototype"` accordingly.
3. **Seated poses**, per above.
4. **A default configuration.** `createDefaultConfiguration` belongs to
   `AvailableDeity` and is written when he becomes one.

## How to finish him

In order, and none of it should require engine work:

1. Model the four-armed body against `HUMAN_FOUR_ARM_SKELETON`, and run
   the same measurement pass that produced `bodyProfile`, `torsoSurface`,
   `legEnvelope` and `gripSeats` for the human base. Everything
   downstream — garment fit, ornament clearance, grip seating — reads
   those measurements and nothing else.
2. Replace the six prototype generators with production geometry.
3. Author the ornament density the reference shows, using existing slots.
4. Add seated poses once there is something to sit on.
5. Promote him: give him `createDefaultConfiguration`, flip `available`
   to `true`, and move his `preparing` block into the main definition.

Step 5 is a few lines. That it is a few lines is the point of steps 1–4
being the hard part.
