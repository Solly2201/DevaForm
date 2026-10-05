# What the Studio costs, measured

Taken 2026-10-05 against `23dadf8`, with `scripts/qa-perf.mjs`.

**Two kinds of number, and they are not interchangeable.** Shader
programs, geometries, textures, draw calls and triangles are properties of
the *scene*: the same on any machine, so they can be compared, pinned and
argued about. Wall-clock milliseconds here come through **SwiftShader**,
which rasterises on the CPU — they say something about how much work is
being asked for and nothing reliable about a customer's GPU. Every timing
below is labelled. Nothing in this document recommends a change on the
strength of a timing alone.

---

## Cold start, whole Studio

| deity | programs | geometries | textures | draw calls | triangles | SwiftShader ms |
|---|---|---|---|---|---|---|
| Ganesha | 33 | 321 | 5 | 312 | 183 204 | 25 188 |
| Shiva | 51 | 217 | 17 | 207 | 130 714 | 29 550 |
| Vishnu | 45 | 193 | 14 | 184 | 162 738 | 27 817 |

Ganesha is the heaviest to **draw** — 312 calls over 321 geometries, every
one a separate object. Shiva is the heaviest to **compile** — 51 shader
programs and 17 textures, which is the hide's mapped materials and the
rosette and weave maps.

Draw calls and triangles are already pinned per figure and per piece by
`renderBudget.test.ts`, which exists because Vishnu once cost 699 calls
and 559 of them were three attachments. That guard stays the real one: a
total can be met by making everything slightly worse, and what actually
went wrong was one crown costing 191 meshes.

## Changing deity, which is the thing a customer does

Measured by clicking the real control and waiting for the figure to
change, not for a timer:

| switch | programs after | new programs | geometries | SwiftShader ms |
|---|---|---|---|---|
| arrive at Ganesha | 33 | — | 321 | — |
| → Vishnu | 49 | **+16** | 197 | 5 251 |
| → Ganesha | 52 | +3 | 325 | 2 548 |
| → Shiva | 62 | **+10** | 226 | 4 789 |

**The first visit to each deity compiles new shader programs.** Sixteen
for Vishnu, ten for Shiva. `ZoneMaterials` is built once and kept, but its
mapped and patterned variants are created on demand, so the first figure
that needs a hide's rosettes pays for them — at the moment of a click.

Returning to Ganesha afterwards cost three, not thirty-three: the cache
works. The programs accumulate and are never released (33 → 62 across one
session), which is the intended trade and worth knowing about rather than
changing.

### The recommendation, and what kind of claim it is

> **Measured:** 16 and 10 new shader programs are compiled during a deity
> change. That count is machine-independent.
>
> **Architectural estimate, NOT measured:** on a real GPU this is a visible
> stall at the click, and `renderer.compileAsync(scene, camera)` run while
> the transition veil is up would move it out of the interaction.

It is deliberately left unimplemented. The benefit cannot be measured on
this harness — SwiftShader's compile cost is not a GPU's — and the veil is
on the protected-from-regression list. The right order is: instrument the
switch on a real GPU, confirm the stall, then compile under the veil.

What makes it worth doing at all is that the cost is known, bounded and
happens at a moment the product is *already* covering with a veil.

## Rebuilds, which turned out to be fine

`CharacterRoot.tsx` rebuilds the rig only when structure changes, and the
dependency list is argued rather than guessed: `proceduralMorphKey` makes
a morph change rebuild **only** when a procedural asset consumes the
weights parametrically, or when a mesh body's morphs move the surfaces
some procedural item was fitted against. Pose, morph influence and
material changes are all applied in place.

There is one duplicated build, and it is in the test harness rather than
the product: every measurement in this run builds the rig twice, because
the mocked GLTFLoader resolves on the next tick and the first build gets a
figure with pieces missing. Worth knowing when reading a profile; not a
product cost.

## Not measured here, and why

- **Frame time.** SwiftShader. `renderBudget.test.ts` says the same thing
  and says it deterministically.
- **Shadow cost.** Depends on the rasteriser and on shadow-map resolution;
  the two-pass stage render is the structure to measure, on a GPU.
- **First meaningful render.** The entry sequence has its own harness
  (`qa-entry.mjs`) which checks that it *completes*; how long it takes is
  a GPU question.

## What would be worth doing next, in order

1. **Instrument a real GPU.** Everything above that is a timing is
   provisional until then. One session with `performance.now()` around the
   switch on real hardware settles the prewarming question.
2. **Ganesha's 321 geometries.** He costs 60 % more draw calls than Vishnu
   for 12 % more triangles. His body is a union of overlapping spheres and
   tubes, each its own object. Merging them would break material swapping
   and per-part customisation, so the question is not "merge" but "which
   of these are never customised separately" — and that is an asset
   question, not a renderer one.
3. **Texture count.** Shiva carries 17. They are small and procedural;
   whether they could be shared across the mapped variants is a
   `ZoneMaterials` question with a measurable answer.
