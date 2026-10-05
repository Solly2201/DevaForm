# Visually valid, physically plausible, printable

Three different states, measured 2026-10-05 against `23dadf8`. The point
of writing them down separately is that DevaForm is currently in the
first, mostly in the second, and nowhere near the third — and the honest
version of a manufacturing audit is to say which failures belong to which.

| state | the question | how to tell |
|---|---|---|
| **visually valid** | does it look right from every angle a customer can reach? | render it and look; `penetration.test.ts`, `bandSeat.test.ts`, `garmentLayer.test.ts` |
| **physically plausible** | could this object exist as described — nothing occupying another thing's space in a way matter cannot? | signed depth against the drawn geometry |
| **printable** | is this a watertight manifold solid, thick enough, connected, and supported? | boundary-edge count, wall thickness, connectivity, overhang |

A piece can be in the first and not the second — a crown band whose inner
face is 31.5 mm inside a cranium looks perfect and is two solids in one
place. A piece can be in the second and not the third — a correctly placed
sash with no thickness at all is physically sensible and has nothing to
print.

---

## Where the product actually stands

### Visually valid — yes, and now measured

The 360° sweep classifies every intersection on all three figures with a
reason, and four open defects are named rather than hidden. See
`penetration.test.ts`.

### Physically plausible — mostly, with four known exceptions

All four are recorded as `lining` or `constitutive` in the penetration
table and all four are invisible:

- garment inner walls inside the legs (37.8 / 25 / 42 mm) — deliberate, and
  what stops a gap showing at the hem;
- `vishnu.crown.kirita` 31.5 mm inside the cranium — how a kirita is worn
  over hair;
- hair caps rooted in the skull (37.5 / 22.9 mm);
- `ganesha.earrings.kundala` through the earlobe — which a printed statue
  would actually want, since a hook that merely touches would not join.

### Printable — no, and the measurement says how far

Boundary edges (an edge used by exactly one triangle; a closed solid has
none), counted over the built scene:

| figure | pieces | fully closed |
|---|---|---|
| Ganesha | 22 | **0** |
| Shiva | 15+ | **0** |

Nothing in the product is a watertight solid. That is not a surprise and
not a regression — every asset in the catalogue declares
`printSourceAvailable: false`, and thirteen declare `minStatueHeightMm:
150` with notes like *"Ash relief under 2 mm at 1 m scale; needs a minimum
print size to survive."* The geometry was built to be looked at.

Two of this run's fixes were nevertheless real printability fixes, because
they were *also* visual ones:

- every band ornament's lathe profile now closes, so an armlet, a bangle
  and an anklet have an inner wall. They were C-sections with no inside:
  nothing to print, and a cut edge visible wherever the limb did not fill
  the ring.
- the cloth zones draw from both sides, which is a render fix and a
  statement that cloth is a surface — a surface that will need thickness
  before it can be printed.

---

## The warnings a customer should eventually see

Ordered by how cheaply each can be computed from geometry that already
exists. None is implemented; this is the specification, not a claim.

| warning | detectable by | cost |
|---|---|---|
| **not watertight** | boundary edges > 0 per piece | already measured above |
| **zero-thickness surface** | a piece whose boundary edges are most of its edges | same pass |
| **thin ornamental relief** | smallest wall thickness vs `minStatueHeightMm` | needs a thickness probe; the assets already declare the threshold |
| **self-intersection that matters** | signed depth between two pieces that are NOT declared `lining`, `constitutive`, `seam` or `grip` | `penetration.test.ts` already computes exactly this; the table already says which are intended |
| **unsupported floating geometry** | a piece with no connected path to the body or to something that has one | connectivity over the scene graph plus a contact test; `support.test.ts` is the start |
| **dangerously thin connection** | cross-section area at the narrowest point of a connection | needs a thickness probe |
| **impossible attachment** | a declared `WornFit` whose geometry contradicts it | `wornFit.test.ts` and `bandSeat.test.ts` already do this for bands |
| **unsupported pose/attribute combination** | `rig.poseWarnings` — a hand that cannot reach what it holds, a staff whose butt left the ground | already produced, not surfaced to the customer |

The last row is worth noticing: the engine **already computes** pose
warnings and keeps them on the rig for whoever is building the product.
Half of a manufacturing warning system is reporting what is already known.

---

## What this does NOT recommend

Changing runtime placement to satisfy a printability warning. The two are
different states on purpose: a garment lining inside a leg is correct for
the first two and wrong for the third, and the resolution is a thickened
shell at export time, not a lining moved out of the leg where it would
show a gap. Export is the right place for every fix in the third column.
