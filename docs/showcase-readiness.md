# Showcase readiness

What was measured, what was fixed, what is still short, and what somebody
should do with the product in front of another person.

This is a report on one run, written against the state at `5010fb3`. It
is deliberately specific about numbers: "the belt looked wrong" is not
something a later reader can check, and "the belt stood eighty
millimetres proud of a hundred and eighty-seven millimetres of cloth" is.

---

## 1. The standard applied

A person who knows nothing about the implementation should be able to use
DevaForm for ten to fifteen minutes and meet nothing broken, unfinished,
contradictory or embarrassing.

That is not "the tests pass". Several things fixed in this run had every
test passing while they were plainly wrong in a render, and several
"defects" found by measurement turned out to be the instrument lying
about correct work. Both directions are recorded below, because a report
that only lists wins teaches nothing about where to look next.

---

## 2. The walkthrough

`apps/web/scripts/qa-showcase.mjs` drives the exact path below in a
browser and asserts every step. **It currently reports 0 failures, 0
notes.** Run it before showing the product to anyone.

1. **Open the root.** It resolves to `/studio`.
2. **The entry.** A strip of stills; the customer's own scrolling is its
   clock. Press *Enter*.
3. **Ganesha is standing there.** 290 draw calls, 191k triangles.
4. **Change his head** — Bal Ganesha, Regal, the sculpted and AI variants.
5. **Change his face** — eyes, trunk curl, tusks.
6. **Change a mudra** in the Hands panel. Note that the figure's *pose*
   changes while its geometry does not: mudras move joints.
7. **Give him something to hold** — modak, lotus, parashu, pasha, ankush.
8. **Change the dhoti.**
9. **Orbit** with the camera buttons: Front, Face, Back, Left, Right, ¾.
10. **Switch to Shiva.** The product asks before discarding unsaved
    changes — say yes. The cover lifts in about 2.4 seconds the first
    time, under half a second thereafter.
11. **Pose Shiva** — Meditation, Tandava, and the rest.
12. **Switch to Vishnu.** Four arms, chakra poised on a raised finger.
13. **Change the lighting** from the control at the top right.
14. **Save**, then **Share**, then open the link. The shared page rebuilds
    the creation live and works on a phone.

---

## 3. What was wrong, and is not now

Each of these was found by measurement or by opening a browser, not by a
failing test.

### The waist belt was a flange

Ganesha's kamarband stood **80 mm proud of his dhoti** — a gold disc
wider than his own belly, casting its own shadow on the skirt, visible in
every frame of the 360° sweep. Four independent causes:

- It cleared the **uttariya as well as the dhoti**, though a sash's tail
  falls *across* a belt rather than under it. Worn radii are now kept per
  garment slot and the query names the slots it is worn over.
- Its three front **tassels read the clearance with the walk's own
  parameter** rather than their bearing, so they were seated on cloth
  measured at his back and stood 236 mm out where the dhoti is 187 mm.
- The per-bearing window **maxed a clearance rather than a radius**,
  carrying one bearing's need round to another: at 90° the belt needed
  7 mm and was given the 24 mm that 135° needed.
- A **body-derived floor** sat on top of all of it.

Now a 197–201 mm band on 187 mm of cloth. The 2 mm it beds in is in the
penetration table with its reason.

Two further holes surfaced on the way: a garment mounted to a *socket*
was never recorded as worn at all, and a belt is centimetres tall so
asking only at its centre line let a flare swallow it.

### Ganesha's hands were a moulded toy's

He has a human body and an elephant's head; the hands are the human part
and did not look it. Four near-identical sausages on a slab — each finger
a smooth cone with a ball at its root, which is how plastic hands are
made.

A finger is three bones: widest past the knuckle, waisted through each
phalanx, swelling at each joint, ending in a pad. Wider than deep. And
carrying a **nail**, which at statue distance is worth more than all the
rest. The palm gained the thenar and hypothenar eminences.

It costs **twenty nodes fewer** than before: a hand is one material and
rigid, so everything but the four fingers merges — five meshes where
there were seventeen.

### The picker apologised for every option

`"In preparation"` printed under **82 of 82** selectable assets. A warning
that fires on everything is not a warning; it was a watermark reading
"unfinished" across the whole product, and the first thing anyone opening
the Studio saw. The field had stopped discriminating because nothing was
ever promoted out of `prototype`.

Whether an option is fit to show now lives where the option is offered —
`VISIBLE_STAGES`, plus `showcase.test` holding every asset behind it to
building real geometry. Two tests pin the rule: a badge may mark at most a
minority of the catalogue, and may never print one of the pipeline's own
words.

### Two pickers marked their selection with colour alone

Pose presets and base styles carried no `aria-pressed`, unlike every
other picker. The choice existed for sighted users and nobody else.

### Retired assets were offered

`listAssets()` read `if (!filter) return true` above its deprecation
check, so asking for *every* asset returned the seven kept only so old
saves still resolve. Every caller that passed a filter was safe; every
caller that did not was quietly wrong.

### Ganesha's head was not part of the figure

Fixed earlier in the run: the head is in `bodyMeshes`, so the crown and
earrings are validated against it, and `measureCranium` reads the skull
the figure is actually wearing rather than the one the table describes.

---

## 4. What is still short

Stated plainly, because a report that hides these is worth nothing.

### Two of sixteen reference categories are under-filled

`references/ref2.png` is the project's own completeness target.
`iconography.test.ts` holds the registry against it. **Fourteen of
sixteen rows meet or exceed the sheet.** Two do not:

| Category | Sheet draws | Studio offers |
|---|---|---|
| 8. Crown / headwear | 5 | 3 — Kirita, Karanda, Prabha |
| 9. Clothing / dhoti | 5 | 3 — Pleated, Short, Layered |

Both are pinned at their current numbers, so the gap is visible on every
run and cannot quietly deepen. They were **not** padded to five: weak
variants would satisfy a count and fail the standard.

### The crown is the weakest shipped asset

The procedural `Kirita Mukuta` reads as a smooth gold cone with a finial.
It is correctly placed, correctly scaled to the skull it sits on, and
correctly lit — and it is a cone. It is the first thing a person's eye
goes to on a Ganesha. This is the highest-value next piece of modelling
work in the product.

### The Studio is desktop-only, and says so

Measured at seven widths. Sound down to **1024 px**; at 768 the page
gained 47 px of horizontal scroll and Save sat off the edge. Below the
threshold the Studio is not laid out at all and shows an honest notice
pointing at the share page, which **is** built for a phone and measured
at 390 px.

This is a decision, not a fix. A three-column layout around a 3D viewport
with a 480 px tool panel has no good phone arrangement, and a
half-working editor is worse to hand somebody than a sentence.

### Facial hair is not built

Shiva and Vishnu have no beard or moustache variants. The analysis
(`docs/facial-variants.md`) was that building them risks a weak variant
for little gain; verifying the existing variants was the better use of
the time. This remains an open choice rather than an oversight.

---

## 5. What is measured, and how

| Gate | State |
|---|---|
| `pnpm -r test` | **824 passing** (679 web, 113 asset-system, 32 schema) |
| `pnpm -r typecheck` | clean |
| `pnpm -r lint` | 0 errors |
| `pnpm build` | succeeds |
| `qa-showcase.mjs` | 0 failures, 0 notes |
| `qa-interactions.mjs` | 0 bugs, 0 polish notes; 91 picker clicks all changed the configuration |
| `qa-responsive.mjs` | 0 failures across 7 widths |
| Browser console | no unexplained errors; only Next's own router prefetch aborts |

### The audits added this run

- **`showcase.test.ts`** — every option the Studio offers builds real
  geometry, or the product explains why it cannot. 155 cases.
- **`jointAudit.test.ts`** — every joint the editor exposes moves, moves
  the way it was asked, clamps to its stated limits, carries its
  dependents, and restores exactly over three adjust-and-clear cycles.
- **`gripSurvival.test.ts`** — every mudra against every item each deity
  offers, plus survival through every pose and across a rebuild, because
  a share link *is* a rebuild.
- **`oldSaves.test.ts`** — the six retired assets still build, and a
  creation saved before the body changed opens as a whole statue standing
  on its base.
- **`beltStandoff.test.ts`** — a belt is wound on cloth, not hung off it.
- **`iconography.test.ts`** — the reference sheet's own completeness
  target.

Every one was verified by **deliberate reversion**: the fix was undone
and the test confirmed to fail, with the failure recorded in the commit.

### Performance

Under SwiftShader software rendering in headless Chrome — a floor, not a
representative number, since a real machine has a GPU.

| Figure | Draw calls | Triangles |
|---|---|---|
| Ganesha | 290 | 191k |
| Shiva | 207 | 131k |
| Vishnu | 184 | 163k |

Deity switch: **2.4 s** the first time a figure is built, **420–630 ms**
once its shaders are compiled.

---

## 6. The thing worth knowing about this run

Six of the fourteen commits fix a **measurement**, not the product. In
every case the instrument accused correct work:

- The joint audit called the wrists dead — a hand holding an axe is aimed
  by what it holds, and the panel says so.
- It called the clamp broken, reading a forearm at 1.28 rad against a
  limit of 0.3 — which is the mudra solve's rotation, not the customer's.
- The grip audit measured to the hand that was *asked* for, not the one
  the resolver chose; and to the wrist, when Vishnu's discus is poised on
  a raised fingertip.
- The walkthrough searched the page for a deity name and found the first
  *card*, reporting a working switch as broken, twice.
- The old-save audit dropped retired parts onto today's body, whose
  single mesh already provides a head, and called four of six broken.
- `qa-perf` opened a panel and searched it in the same synchronous pass,
  so the first deity switch was never measured at all.

The lesson that keeps repeating: **a failing measurement is a claim about
two things, and the instrument is the one to doubt first.** Every one of
these was resolved by making the measurement ask the question the product
actually answers — and each left the harness sharper than a real bug
would have.
