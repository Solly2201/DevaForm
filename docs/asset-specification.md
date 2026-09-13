# DevaForm Asset Specification ("Asset Bible") — v1

Production rules for every 3D asset entering the DevaForm platform. This is a
company production standard for internal and external artists, not developer
documentation. Deviations require sign-off and a spec version bump.

## 1. Units, scale, coordinate system

- **Units: meters.** 1 Blender unit = 1 m. GLB export must keep unit scale 1.0.
- Canonical character height ≈ **1.0 m** (statues are scaled at order time).
- **Y-up, character faces +Z** (glTF convention). In Blender (Z-up), model
  facing −Y and rely on the glTF exporter's +Y-up conversion.
- No non-uniform object scale in exports. Apply all transforms
  (rotation/scale) before export; object scale must be (1, 1, 1).

## 2. Naming conventions

All names are ASCII, camelCase segments, dot-separated namespaces.

- **Asset ids**: `<deity|shared>.<category>.<name>` — e.g.
  `ganesha.crown.kirita`, `shared.item.lotus`.
- **Bones**: exactly the canonical joint ids from `character-schema`
  (`pelvis`, `spine`, `chest`, `neck`, `head`, `trunkBase`, `trunkMid`,
  `trunkTip`, `arm.frontLeft.upper`, `arm.frontLeft.forearm`,
  `arm.frontLeft.hand`, … `leg.right.foot`). No prefixes, no `.L/.R`
  suffixes, no deviation — the engine drives bones by these names.
- **Sockets**: empty transforms named `SOCKET_<socketId>` — e.g.
  `SOCKET_head.crown`, `SOCKET_arm.backRight.hand.item`.
- **Meshes**: `<slot>_<variant>` (e.g. `trunk_leftCurl`).
- **Materials**: `zone:<zoneName>` for user-colorable zones
  (`zone:skin`, `zone:metal`, `zone:gem`, `zone:garment`,
  `zone:garmentAccent`, `zone:skinSecondary`, `zone:base`) or
  `fixed:<name>` for non-configurable materials. The engine remaps
  `zone:*` materials to live user-controlled materials at load.

## 2b. Part GLB joint grouping

A part GLB follows one of two contracts, and `pnpm validate-assets`
requires one of them.

**Rigid parts** — meshes sit inside nodes named `JOINT_<jointId>` (e.g.
`JOINT_head`, `JOINT_chest`). The engine re-parents these groups onto the
live skeleton joints so parts articulate with poses. Attachment GLBs do
not use `JOINT_` groups — they mount on schema sockets with their
attachment point at the origin.

**Skinned parts** — one continuous mesh bound to a skin whose bones are
named after canonical joint ids. The engine discards the file's own bones
and re-binds the mesh to the live rig's joints, so the pose system deforms
it on the GPU. Requirements:

- every skin joint names a canonical joint, and no two bones claim the
  same joint;
- bones rest exactly where the canonical skeleton rests them (the engine
  warns past 5 mm of drift, because the mesh would deform wrongly);
- vertices are authored in character space, at rest;
- ≤ 4 influences per vertex, normalized;
- the skinned mesh node's own transform is ignored, per the glTF spec.

**Name spelling.** glTF/three strip `.` from node names, so a bone cannot
literally be called `arm.frontLeft.upper`. Skinned assets write joint ids
with `_` in place of `.` — `arm_frontLeft_upper` — and the engine accepts
either spelling (joint ids contain no underscores). The same tolerance
applies to `SOCKET_<id>` empties.

## 2c. Morph targets

Morph targets are the parametric-morphology mechanism: named glTF targets
(`mesh.extras.targetNames`) driven at runtime by the weights in
`configuration.morphs`. A mesh applies the weights it exposes, ignores the
rest, and returns un-named targets to neutral — so a configuration stays
loadable as targets are added or removed. Assets declare the targets they
support in the manifest's `morphTargets`; validation fails a declared name
the GLB does not expose. Changing a weight is a GPU update: no geometry is
rebuilt, and no new asset is generated.

## 3. Pivots & placement

- Part meshes are modeled in rest pose at their world location, skinned to
  the canonical armature. Object origin at world origin.
- Attachment assets are modeled with their **origin at the socket point**,
  +Y up, facing +Z. The default offset lives in the asset manifest
  (`defaultTransform`), not baked into geometry, unless anatomically fixed.
- Hand-held items: origin at grip center.

## 4. Skeleton & skinning

- Rig against the canonical armature only (distributed as
  `tools/blender/canonical_rig.blend`, generated from the schema).
- Max **4 bone influences** per vertex, normalized weights.
- No additional deformation bones without a spec update. Helper/twist bones
  must be baked out before export.
- Rest pose = the schema rest pose (arms slightly lowered; see rig file).

## 5. Morph targets (shape keys)

- Naming: camelCase semantic names (`trunkLength`, `trunkCurve`, `earSize`,
  `eyeSize`, `cheekVolume`, `browHeight`…). Basis shape = neutral.
- Range convention: weight 0 = neutral, 1 = full effect. Bidirectional
  morphs ship as two targets (`trunkCurlLeft` / `trunkCurlRight`).
- Declare every exported morph name in the asset's manifest entry.
- Morph deltas must remain manifold-safe (no self-intersection at weight 1
  in rest pose).

## 6. Topology & polygon budgets (web/editor LOD)

| Component | Max triangles |
|---|---|
| Body | 25,000 |
| Head (incl. trunk) | 20,000 |
| Garment | 10,000 |
| Crown / large ornament | 8,000 |
| Small ornament / hand item | 4,000 |
| Full assembled character target | ≤ 120,000 |

- Quads preferred in source; triangulated on export is fine.
- Watertight where physically solid. No internal faces, no n-gons > 4 in
  source, no zero-area faces, no flipped normals.
- **Print source** is a separate high-resolution mesh (no budget, must be
  manifold); the editor GLB is its decimated sibling. Both share the asset
  id; the manifest links both.

## 7. UVs & textures

- Editor assets: single UV set, no overlaps outside mirrored islands.
- Textures: PNG or KTX2 (preferred, BasisU), power-of-two, max 2048² for
  body/head, 1024² for ornaments.
- PBR metallic-roughness workflow only. No baked lighting.
- User-colorable zones must be flat-tintable: albedo near-white detail maps
  so zone colors multiply cleanly.

## 8. GLB export requirements

- glTF 2.0 binary (`.glb`), embedded buffers, no external files.
- Include: meshes, armature+skin, shape keys, materials, sockets (empties).
- Exclude: animations, cameras, lights, custom properties except
  `devaform:*`.
- Compression: Draco or Meshopt allowed once the loader pipeline lands
  (Phase B); until then uncompressed.
- +Y-up, apply modifiers, tangents exported where normal maps exist.

## 9. Print asset requirements

- Manifold, watertight, self-intersection free at all shipped morph
  extremes and across the supported pose envelope.
- Minimum feature thickness 0.8 mm at the smallest sold statue size;
  ornaments that fail must declare `minStatueHeightMm` in the manifest.
- No floating geometry; every shell must connect or be declared as a
  separate assembly part.

## 10. Hand-held attribute (item) authoring rules

- Model with the **grip point at the origin**; shaft along +Y, business end
  (blade, flower, loop) toward +Y.
- Declare `grip.mudra` in the manifest (`hold` cradle, `pinch` stem,
  `grip` fist) — the studio auto-applies it on attach.
- Provide `defaultTransform` for the in-fist position and
  `socketTransforms` overrides for non-hand sockets (e.g. `trunk.tip`).
- Shafted items should set `keepUpright: true`; the engine keeps them
  world-vertical through every pose. Cradled items must not.

## 11. Versioning & lifecycle

- Asset versions are integers, bumped on any geometry/material/socket
  change. Old versions are never mutated — saved characters and orders pin
  them.
- Lifecycle stages: `source` → `prototype` → `production` → `deprecated`.
  Only `production` assets are sellable; `deprecated` assets stay loadable
  for old saves.

## 12. Delivery checklist (per asset)

1. GLB passes `tools/blender/validate_asset.py` (naming, scale, budget,
   manifold, socket presence).
2. Manifest entry (id, version, kind, sockets/slot, zones, morphs,
   printability) submitted alongside.
3. Thumbnail render 512×512, neutral studio lighting, transparent bg.
4. Print-source mesh archived in asset storage under the same id+version.
