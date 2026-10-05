# Wearable classes: what each one actually needs

Written 2026-10-05 against `3878b6d`, after a measured 360° sweep of all
three shipped figures (`penetration.test.ts`, `bandSeat.test.ts`,
`bodySurface.test.ts`).

The question is not "what is a wearable". It is: **for each class of
thing a figure wears, is the contract it already has sufficient, and if
not, which contract does it need?** The answer differs by class, and the
useful result of this audit is that it differs — several classes need
nothing, one class needs something `WornFit` cannot express, and one has
no asset at all.

The verdicts:

| | meaning |
|---|---|
| **A** | already correctly represented — leave it |
| **B** | needs `WornFit` |
| **C** | needs a different contract family |
| **D** | intentionally procedural — a contract would add nothing |
| **E** | needs a future architectural experiment |

---

## The one rule that produced most of the findings

An ornament is placed against a *summary* of the body — `BodyProfile` —
and summaries have edges. Three defects this quarter were all the same
shape: the summary was asked a question outside what it describes, and
answered anyway.

- `surfaceAt` is a **torso**. Asked at shoulder height it answers for the
  torso, and a garland routed there crosses the **deltoid**, which belongs
  to an arm. (Vishnu's vaijayanti, 7.2 mm.)
- `armBandRadius` is **one bone's girth**. Asked where an armlet should
  go, it cannot see the chest or, on a four-armed figure, the second
  upper arm. (Vishnu's armlet, 16.0 mm, of which 89 of 191 buried
  vertices were inside the *rear* arm.)
- The generated surface mirrored the front through the **chest's** centre
  when the front came from the **belly**. (Ganesha's back, 50 mm.)

So the recurring need is not "more contract on the asset". It is: the
body must be able to say what is in the way, not only how thick one bone
is. That is the finding Phase 2's experiment has to answer to.

---

## Per class

### Rings (finger) — **E, and there is no asset**

No finger ring exists in any manifest. Worth recording rather than
quietly skipping: the class is unrepresented, and it is the one class
whose target (a phalanx) is small enough that the hand's grip morphs
would move it every time a fist closes. A ring is `encircles`, but on a
bone that *deforms by morph*, which nothing else does. Defer until there
is a reason to build one.

### Bracelets (`ganesha.bracelets.kada`) — **A**

Semantic target: distal forearm. Relationship: closed band, limb through
the hole. Frame: the forearm bone, aimed at the hand joint — not the
wrist, deliberately, so a dance gesture cannot drive it through the palm.
Geometry measured: `wristBandRadius`, the 95th percentile girth of that
bone's own skin. Pose: invariant, it rides the bone. Anatomy: follows the
measured radius. Validation: `wornFit` (hole admits limb) and `bandSeat`
(no metal inside the figure). Measured clear on all three figures.

### Armlets (`ganesha.armlets.vanki`) — **A for the contract, C for the seat**

The *fit* is right and declared. What was missing is not a property of
the armlet: it is that nothing could say **where on a limb there is
room**. Added as `BodyProfile.armBandAlong`, a fraction each body states
for itself, because the two bodies genuinely disagree —

- human base: inside the figure to station 60–80 mm, clear from 70–90, so
  0.62, outboard of the second shoulder;
- stylised: clips the torso at **every** station, least of all near the
  shoulder (4 mm at 0.34 rising to 8 mm by 0.75). A thick arm carried
  against a chest that wide has nowhere for a ring to pass.

That second row is why a single constant could not work, and why this is
a *body* property rather than an ornament one.

### Anklets (`ganesha.anklets.payal`) — **A**

As bracelets. Seats square on the foot joint, which already is square —
the foot has no child to aim at, and that is stated rather than assumed.
Bells hang off the band's own outside, not the limb's, which is correct:
they belong to the anklet.

### Kamarbandh (`ganesha.waist.kamarband`) — **A, after a two-layer fix**

This class is the clearest demonstration in the repository that a fix can
be right and still not work. The belt was rebuilt from a scaled torus
into a ribbon walked round the measured waist — correct — and then stood
52–93 mm off Ganesha's back while touching his front, because the surface
it walks was wrong in exactly the way the torus had been. Both layers are
now right; `bodySurface.test.ts` holds the second.

### Necklaces (`ganesha.necklace.haram`, `shiva.ornament.naga`) — **B for the naga**

`haram` declares `restsOn neck, 4 mm` and is measured. `naga` declares a
socket and a `clearanceM` that nothing reads, and measures 13–77 mm clear
of the body all the way round — a serpent that never touches the figure
it is draped on. It needs `restsOn chest` plus a *contact* requirement,
which `restsOn` already implies and no validator yet enforces. Small,
worth doing in Phase 5.

### Malas (`shiva.mala.rudraksha`, `ganesha.necklace.mala`) — **C**

Not `WornFit`. A mala's physical story is **hang**: it leaves the body at
the neck, falls under gravity, and its lowest point is where it stops.
`drapes` carries from/reaches/over, which is the *route*, and that is
most of it — but the thing a mala gets wrong is the fall, and the fall is
a length, not a route. `shiva.mala.rudraksha` measures −3 to −33 mm,
touching at the sternum and standing off below, which is what a hanging
strand should do. The contract it needs is "reaches this far down and
hangs free below the last contact", and `drapes` cannot currently say
*free*. Phase 5.

### Crowns (`vishnu.crown.kirita`, 3 × Ganesha) — **C**

A crown does not rest on a body region. It rests on a **skull envelope**,
over whatever hair is between, and its silhouette is deity-specific by
design. `restsOn head` would be true and useless: the measured thing is
`skullEnvelope`, which exists, and the question is seating depth and
orientation on it. Measured, Vishnu's kirita band is 31.5 mm inside the
scalp, which is correct layering (crown over hair over skull) and a
printability concern rather than a visual one. Its own contract family.

### Earrings (`ganesha.earrings.kundala`) — **A**

Declares `piercedThrough earlobe`, which is the whole point: the overlap
is constitutive and a containment check that reports it is reporting a
correctly made earring. Scales with `headFit` so a smaller head wears
smaller hoops rather than the same ones sticking out.

### Tilaka / bindi — **B, for the two that do not declare it**

`vishnu.forehead.tilaka` declares `appliedTo forehead`. `shiva.tilak.tripundra`
and `humanoid.tilak.tripundra` declare nothing and are the same class.
Converting them is cheap and is the only straightforward B in this table.
`shiva.forehead.trinetra` is the same relationship under a different name.

### Garments — **C, and they are not one class**

The six garment assets use **three different generators**:
`humanoid.dhoti` (Ganesha), `humanoid.hideWrap` (Shiva's dhoti and hide,
Vishnu's dhoti), `humanoid.shawl` (Ganesha's shawl, Shiva's uttariya).
That is visible: from the side, Ganesha's dhoti is a featureless
cylinder, while Shiva's and Vishnu's read as draped cloth.

What garments need that `WornFit` cannot say: **layer order**, coverage,
drape direction, minimum reach, pose-dependent shortening, mutual
exclusion between outer garments, and a hem. Forcing them into `drapes`
would record the least important of those. Phase 4.

One measured result worth keeping: asked the right way round — does the
**body** come out through the cloth — all three figures are clean between
hem and waistband. Everything the depth sweep reports for a garment is
its lining. Visually valid and physically plausible are different states,
and here they diverge.

### Naga (`shiva.ornament.naga`) — **C**

Listed separately from necklaces because it is not one. A serpent is a
*coiled chain* whose route goes round the neck and whose head has its own
orientation; `resolveCharacterPresentation` already calls this `coiled`.
The contract it needs is a route with contact, shared with malas.

### Hair ornaments (`shiva.crescent.chandra`, `ganesha.tikka.chandra`) — **D**

Both are small pieces placed on a head part rather than on the body, and
they move with it. The relationship is "fixed to that part", which the
scene graph already states exactly. A contract would restate the parent
pointer.

### Hair itself (`jata`, `vishnu.hair.*`) — **D**

A hair cap is rooted in the skull it covers; the overlap is constitutive
and already recorded. Measured 37.5 mm (Shiva) and 22.9 mm (Vishnu), both
invisible by construction.

### Held attributes — **A, and this class was never the problem**

`GripFrame` has carried real physics all along: origin, axis, roll,
travel, presented radius, requested hand closure, read field by field by
`rig.ts`. Eleven assets declare one. The only depth the sweep finds for
held items is the grip itself — a conch against a thumb, a drum's waist
against the fingers round it.

---

## What this leaves

- **Two B conversions**: the two undeclared tilaka.
- **Three C families**, each small and each genuinely distinct: hang (malas,
  naga), skull seating (crowns), and garment layering.
- **One E**: finger rings, which have no asset.
- Everything else is A or D: already right, or right because the scene
  graph already says it.

`WornFit` stays at five kinds. The pressure this audit found is not for a
sixth kind — it is for the **body** to be able to answer "what else is
here", which is Phase 2's question, not this one's.

---

## Addendum: crowns, malas, the naga and the marks, measured

Taken 2026-10-05 against `632945b`. Each piece against the figure's own
geometry and, separately, against the hair — because for most of these the
hair is what they actually rest on. Negative means touching or inside.

| piece | vs the body | vs the hair | reading |
|---|---|---|---|
| `vishnu.crown.kirita` | **31.5 mm in** | 8.2 mm in | correct. A kirita's band encircles the head OVER the hair, so it presses 8 mm into the hair and its inner face lies inside the scalp. Invisible; a printability fact, not a visual one |
| `shiva.ornament.naga` | 12.7 mm **clear** | 4.4 mm in | correct, and the reason it looked like floating is that it is not resting on skin. It rests on the jata, and 12.7 mm is the hair's thickness |
| `shiva.mala.rudraksha` | 3.0 mm clear | 1.3 mm in | correct — a bead strand lying on the hair at the nape and 3 mm off the sternum |
| `shiva.crescent.chandra` | 44.7 mm clear | 3.0 mm in | correct. It is set in the hair, not on the head |
| `shiva.forehead.trinetra` | 3.1 mm in | 12.0 mm clear | correct — on the skin, clear of the hairline |
| `vishnu.forehead.tilaka` | 4.6 mm in | 0.1 mm clear | correct, and finely placed: it reaches the hairline and stops |

**So no new contract family is needed here.** Every piece in this group is
either correct or correct for its class, and what made three of them *look*
wrong from the outside is that they are worn on hair rather than on skin.
A "crowns need skull-envelope seating" contract would have been built to
fix a number that was already right.

The one thing worth saying about crowns remains true and belongs to Phase
9 rather than here: a crown band whose inner face is 31.5 mm inside the
cranium is visually perfect and not a solid anyone can print.

### A limitation this exposed

`ganesha.crown.kirita` measures 149 mm from "the body" — which is not a
defect, it is the measurement failing. **Ganesha's head is not in
`rig.bodyMeshes`.** That set is built by `claimFlesh`, which claims only
the `body` slot, because its job is to decide what the statue rests on and
a hem that hangs past the feet must not lift the figure off its base.

The consequence is that nothing can measure anything against Ganesha's
head, ears, tusks, trunk or hands: his crown, his earrings and his tilaka
are unvalidated by every depth check in the suite.

It is the Phase 3 shape again — one name serving two questions. "What does
this statue rest on" and "what counts as the figure" are different sets,
and the second is recoverable without a schema change, because flesh is
exactly the geometry wearing the `skin` zone. Recorded rather than fixed
in this pass: changing what `bodyMeshes` means touches `settleOnSupport`,
and the honest version is a second accessor rather than a redefinition.
