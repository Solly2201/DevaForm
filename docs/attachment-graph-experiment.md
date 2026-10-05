# Attachment graph: an architecture experiment

Proposal written 2026-10-05 against `d86c40b`. Inspired by the publicly
described behaviour of Hero Forge's kitbashing — objects attach to
joints, objects attach to other objects, descendants follow their parent,
chains form, some objects serve as anchors, and connected items are
distinguished from free-floating ones. No proprietary implementation was
consulted; the support page returns 403 to automated fetches, so the
behavioural summary used here is the one stated in the brief that
commissioned the experiment.

**The experiment's rule, stated before it runs:** a result where the
attachment graph merely reproduces what the scene graph, sockets, socket
refinements and `GripFrame` already provide is a FAILURE, not a success.
The same rule the spatial-occupancy experiment was held to.

---

## 1. What DevaForm's attachment model is today

Four levels, all real `Object3D` parenting:

```
characterRoot
  └── joint (from the skeleton definition)
        └── socket:<id>            declared by the skeleton
              └── attachment:<id>  one asset
```

Parts attach to joints directly, or to sockets. A part may **refine** a
socket it owns — the trunk's tip moves `trunk.item`, a hand's GLB moves
`arm.*.hand.item` onto the actual palm — so a socket's final place comes
from the geometry that owns that surface rather than from a table.

Three properties follow for free, because it is the scene graph:

- pose propagation (a posed joint carries its sockets and their children);
- morph propagation (a skinned body moves its joints);
- deity change (a rebuild re-creates the whole tree).

**What it cannot express:** an attachment as the parent of another
attachment. The tree is exactly one attachment deep.

## 2. The evidence: where that limit actually bites

Four places in the shipped product where one worn thing needs to know
another worn thing's surface, and uses a proxy derived from the *body*
instead. Each is load-bearing and each carries a comment admitting it.

1. **Crown and hair.** `kiritaBandBottom(body)` exists as a shared
   function solely so the crown and the hair agree on one line. Its own
   comment records why: *when each of them worked it out separately the
   hair was a guess at where a crown it knows nothing about might be, and
   it guessed wrong, which is why it showed through the gold.*

2. **Garland over collar.** The vaijayanti stands off by
   `body.neckRadius * 0.34` — a fraction of the **neck** standing in for
   the **kantha's** gauge, because the garland cannot ask the collar how
   thick it is. The comment states the substitution explicitly.

3. **Belt over cloth.** The kamarbandh clears
   `max(0, dhotiRadius − pelvisHalfWidth) + 6 mm` — the lower garment's
   thickness inferred from two body measurements rather than read off the
   garment.

4. **Garland over garment.** `fit.over` lists what the vaijayanti is worn
   outside of. It is read by validation only; no placement consults it.

## 3. The question the evidence actually asks

All four are **siblings**, not parent and child. The hair is not attached
to the crown; removing the crown must not remove the hair. The dhoti is
not attached to the belt. What each case needs is not "whose child am I"
but **"what is already here, and how thick is it"** — a layering query,
not a parenting edge.

That is the same shape as Phase 1's finding, arrived at from the other
direction: three defects this quarter came from a *summary of the body*
being asked a question outside what it describes. Here it is a *summary
of the body* standing in for a question about another garment.

So the experiment has two hypotheses to separate, and must not assume
either:

- **H1 (the graph)** — an explicit attachment graph with local frames
  makes the system more robust.
- **H2 (the layer query)** — the pressure is for siblings to measure each
  other, and parenting is the wrong shape for it.

## 4. The minimal model under test

Deliberately small, behind `engine/experimental/`, production untouched:

```
AttachmentNode { id, parent: {kind: "joint" | "socket" | "node", id}, frame, inheritPose, inheritScale }
```

No new placement mathematics. The resolver does one thing the current
model cannot: resolve a node whose parent is another node. Everything
else it does, it does by `Object3D.add`, which is what the production
path already does — and that is the point. If the graph's only
contribution is parenting that the scene graph already performs, the
measurement will say so.

`AttachmentFrame` as sketched in the brief (origin, axes, semanticRegion,
surfaceReference, scaleReference, clearance, orientationPolicy) is **not**
adopted wholesale. `semanticRegion` is `WornFit`'s job, `clearance` is a
field four assets already declare and nothing reads, and
`orientationPolicy` is `GripFrame` and `aimSocket`. Taking the fields
that are already owned elsewhere would create the second source of truth
the experiment is supposed to be testing for.

## 5. What is measured

Against real assets — Ganesha's kada and kamarbandh, Vishnu's vaijayanti
and crown, Shiva's naga, one held item, and one synthetic child
attachment, since no shipped asset is a child of another:

| | question |
|---|---|
| 1 | can an ornament attach to a body attachment frame? |
| 2 | can an ornament attach to another ornament? |
| 3 | does a child inherit the parent's pose correctly? |
| 4 | does attachment survive a body morph? |
| 5 | does attachment survive a pose change? |
| 6 | does attachment survive a deity change? |
| 7 | does a child keep a stable local transform when the parent moves? |
| 8 | can measured surface geometry still validate the result? |
| 9 | do old `CharacterConfiguration` saves stay unchanged? |
| 10 | does it coexist with `GripFrame`? |
| 11 | does it coexist with `WornFit`? |
| 12 | does it reduce duplicate transform logic? |
| 13 | does it introduce a new source of truth? |
| 14 | does it make the system harder rather than easier? |

Questions 3–7 are measured in millimetres against the production path
doing the same job. A difference of zero is the result that matters: it
would mean the graph is correct and contributes nothing.

Comparison axes recorded alongside: transform correctness, pose and morph
propagation, frame stability, test complexity, special cases, hardcoded
constants, source-of-truth count, code complexity, runtime cost,
serialization complexity, backwards compatibility.

## 6. Decision rule, fixed in advance

- If the graph is **worse**, document and leave production alone.
- If **better**, do not migrate. Identify the smallest slice where it
  demonstrably wins, and migrate only that.
- If **orthogonal** — correct, but solving a problem DevaForm does not
  have — say so plainly and name what the evidence actually asks for
  instead.

---

## 7. Results

Measured 2026-10-05, `attachmentGraph.test.ts`, seven cases, all passing.

### The number the decision turns on

**Every one of the three shipped figures builds a tree exactly one
attachment deep.** `describeRigAsGraph` walks the built scene and finds no
asset parented to another asset, on Ganesha, Shiva or Vishnu. The graph's
single capability beyond production — the `node` anchor — is used by
**zero assets in the catalogue**.

And where it is used, it changes nothing. The same sub-attachment placed
twice, once by the graph as a child of Vishnu's crown and once by
production's own mechanism, lands **within a micron** of itself — at rest
and after posing into `shiva.tandava`. Both are `Object3D.add` underneath.
That is precisely the failure condition fixed in section 1: the model
reproduces what the scene graph already provides.

### The fourteen questions

| | question | answer |
|---|---|---|
| 1 | attach to a body attachment frame? | yes — and so can production |
| 2 | attach to another ornament? | yes, and **no shipped asset wants to** |
| 3 | child inherits parent's pose? | yes, identically — both are the scene graph |
| 4 | survives body morph? | yes; a morph moves joints, which carry their children |
| 5 | survives pose change? | yes; under a micron from production after `tandava` |
| 6 | survives deity change? | as far as its anchors exist. A graph naming `trunk.tip` resolves on Ganesha and reports it missing on Vishnu — the same outcome production gives, by the same mechanism |
| 7 | stable local transform when the parent moves? | yes, for the same reason as 3 |
| 8 | measured geometry still validates? | yes, unchanged. `skinDepth`, `wornFit` and `bandSeat` read built objects and do not care how they were parented |
| 9 | old saves unchanged? | **only while it stays experimental.** Adopting it means attachments gain a parent reference, and `CharacterConfiguration` has no field for one. Every existing save would need a default, and that default is "hangs off its socket" — which is what the file already means |
| 10 | coexists with `GripFrame`? | yes, by not touching it. A held item is already a chain — body, arm, hand, item socket, item — and `GripFrame` owns the last link |
| 11 | coexists with `WornFit`? | yes, by not touching it. The frame here carries position and rotation only; region, clearance and orientation were deliberately left where they already live |
| 12 | reduces duplicate transform logic? | **no.** It removes nothing. `applyAttachmentTransforms`, socket refinement and the grip chain all remain, and the graph sits beside them |
| 13 | new source of truth? | **yes, demonstrably.** The test re-parents Vishnu's crown onto his left foot through the graph and nothing objects. The graph and the scene can disagree, and nothing reconciles them |
| 14 | harder rather than easier? | about 190 lines added, nothing removed, one more place a transform can be decided. On the current catalogue: harder |

### Comparison

| axis | production | graph |
|---|---|---|
| transform correctness | exact | identical, under a micron |
| pose propagation | free (the scene graph) | free (the same scene graph) |
| morph propagation | free | free |
| frame stability | socket refinement lets the owning geometry move its own socket | no equivalent; the frame is authored |
| test complexity | — | seven more cases, to hold a model nothing uses |
| special cases | ground sockets parent to the statue root | plus cycles, ordering, unresolved anchors |
| hardcoded constants | unchanged | unchanged |
| sources of truth | one — the scene | two, and they can disagree |
| code complexity | — | +190 lines, zero removed |
| runtime cost | — | one extra pass; negligible, and negligible is not a reason |
| serialization | an attachment carries a socket id | would need a parent reference and a migration |
| backwards compatibility | — | breaks unless defaulted, and the default is today's behaviour |

### Verdict: orthogonal — deferred, with the trigger written down

The graph is correct. It is also a solution to a problem DevaForm does not
have: the catalogue contains no chains, and the four places that hurt are
not chains either.

All four — crown and hair, garland and collar, belt and cloth, garland and
garment — are **siblings**. The hair is not a component of the crown;
parenting it there would delete it when the crown came off. What they need
is not an edge saying *whose child am I* but an answer to **"what is
already here, and how thick is it"**. Each of them currently substitutes a
measurement of the BODY for a measurement of the GARMENT: a fraction of the
neck's radius standing in for a collar's gauge, two hip measurements
subtracted to guess a dhoti's thickness, and a function both the crown and
the hair call because neither can ask the other.

That is the same finding `docs/wearable-classes.md` reached from the other
direction, and it is a **layering** problem, not a parenting one.

**The trigger for revisiting this:** the first shipped asset that is
genuinely a component of another — a jewel a customer can swap on a crown
they also chose, a banner on a staff, a finial on a trident. That is a real
product capability and the graph is the right shape for it. None exists,
and building the machinery before the asset buys the second source of truth
measured in row 13 for nothing.

The experimental module stays, unimported, with its measurements, so whoever
asks this next starts from numbers.
