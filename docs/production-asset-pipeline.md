# DevaForm Production Asset Pipeline

How an asset travels from concept to Divine Studio, and eventually to
manufacturing. This is the operating manual for the pipeline; the Asset
Bible (asset-specification.md) holds detailed authoring rules and
artist-handoff.md is the standalone artist delivery contract.

## Asset dataset layout

Every GLB asset is a versioned dataset directory (source-controlled):

```
apps/web/public/assets/<deity>/<category>/<name>/<version>/
  model.glb            the web runtime asset
  asset.json           machine-readable sidecar (schema: asset-system/src/dataset.ts)
  thumbnail.png        deterministic studio thumbnail (generated)
  manifest-entry.ts.txt  ready-to-commit registry snippet (ingest output)
```

`asset.json` records identity, kind, stage, **provenance** (ai / artist /
procedural / manual / imported — with provider/tool/creator), measured
geometry, units/axes and printability. The TypeScript manifest remains
the curated registry the app ships; ingestion emits the entry but a human
commits it — experimental/AI assets can never silently reach customers.

## Ingestion (AI-first, artist-identical)

```
pnpm ingest-asset <input.(glb|gltf|obj)> --id ganesha.head.classic \
    --name "Classic Head" --joint head --slot head \
    --source ai --provider meshy \
    --zone-map "Skin=skin,Gold=metal" --target-height 0.35 \
    --recenter base --z-up
```

Normalization (baked into geometry): Z-up→Y-up, uniform scale to a target
height, recentering (base/origin), material→zone renaming, mesh renaming,
`JOINT_<id>` wrapping for parts, triangle/vertex/bounds measurement. The
tool writes the dataset directory, sidecar and manifest snippet, then the
flow is: commit entry → `pnpm validate-assets` → `pnpm
generate-thumbnails` (dev server running) → inspect at
`/dev/assets/<assetId>` → Divine Studio QA.

Textured GLBs can't be decoded in Node (no DOM image decoding): ingest
them with `--copy-only` after normalizing in Blender, or via the Blender
scripts. FBX is not supported (no converter available) — export GLB/OBJ
from the DCC instead.

An OBJ fixture (`scripts/fixtures/make-kalash-obj.mjs` — deliberately
Z-up, millimetre-scale, off-center) exercises this pipeline end-to-end
and ships as `ganesha.companion.kalash@1` at stage `integration`.

## Provenance & replacement

Provenance is provider-agnostic metadata, not a parallel architecture:
an AI head and an artist head are both `AssetDefinition`s. Replacement is
purely data: publish `<id>@<version+1>` with new provenance; saved
creations keep resolving their pinned version. This is covered by the
"artist replacement (architecture proof)" test in
`asset-system/src/__tests__/dataset.test.ts`.

## AI generation status (honest)

No AI 3D service (Meshy/Tripo), Blender install, or conversion CLI exists
in the current development environment — verified, not assumed. The
pipeline is therefore built to receive generated files by drop-in: the
moment a Meshy/Tripo GLB exists, `pnpm ingest-asset` takes it to a
registered, validated, thumbnailed, inspectable Divine Studio asset in
minutes.

## The pipeline

```
concept / references
   ↓
sculpt source                 (artist ZBrush/Blender, or AI image-to-3D
   ↓                           via Meshy/Tripo — requires accounts/keys)
Blender template              tools/blender/devaform_template.py
   ↓                          (canonical units, armature, sockets, zones —
   ↓                           generated from the schema, cannot drift)
cleanup + naming              JOINT_<jointId> groups, SOCKET_<socketId>
   ↓                          empties, zone:<zone> materials
in-Blender validation         tools/blender/devaform_validate.py
   ↓
GLB export                    tools/blender/devaform_export.py
   ↓
repo validation               pnpm validate-assets   (fails CI on errors)
   ↓
manifest entry                packages/asset-system/src/manifests/<deity>.ts
   ↓                          (id, version, stage, slot/sockets, zones)
Divine Studio QA              browser matrix, thumbnails are auto-rendered
   ↓
stage: production             after visual + cultural/iconographic review
```

## Lifecycle stages

| Stage | Meaning |
|---|---|
| `source` | Raw sculpt/AI output, not loadable |
| `prototype` | Procedural/placeholder, development quality |
| `experimental` | Scripted or AI sculpt under evaluation — better than prototype, **not** artist-approved |
| `production` | Artist-made or approved; validator applies strict budgets |
| `deprecated` | Kept only so old creations still resolve |

## Part GLB contract (critical)

A **part** GLB (head, body, garment…) must group its meshes under nodes
named `JOINT_<jointId>` (e.g. `JOINT_head`). The engine re-parents those
groups onto the live skeleton joints, at any wrapper depth, so the part
articulates with poses. A part without `JOINT_` groups fails validation
and falls back to the character root with a rig warning.

**Attachment** GLBs (crowns, held items) need no `JOINT_` groups — they
are mounted on schema sockets — but must keep their grip/attachment point
at the origin.

Materials named `zone:<zone>` are remapped to the live user-controlled
materials; any other material ships as authored (e.g. the head's `tilak`).

## The first hero asset — honest status

`ganesha.head.sculpted@1` (`/assets/ganesha/head-classic-sculpt.glb`) is
the pipeline's proof asset: a **scripted SDF sculpt** (smooth-blended
implicit surface, marching cubes, Taubin smoothing — one continuous
organic mesh with carved eye sockets, crown seat, trunk-root boss, tusk
bosses and mouth crease), generated by
`apps/web/scripts/generate-hero-head.mjs` (~83k triangles, 1.5 MB).

It is staged **experimental**: clearly better than the primitive
prototype (which remains available as fallback), but it is *not* an
artist sculpt. The professional Classic Head remains an open asset task:

1. Generate/sculpt source geometry (artist, or Meshy/Tripo with API
   access — none available in the development environment).
2. Open the Blender template, import, clean, decimate to the 20k budget.
3. Name (`JOINT_head`, `zone:skin`), validate, export, register at
   `stage: "production"`, bump the version.

Old creations pin their asset versions, so replacing the head never
mutates saved statues.

## Web asset vs print asset

The editor GLB is the *web representation*: budgeted, zone-materialed,
articulation-ready. Manufacturing uses a separate print representation
produced by the Phase D pipeline (merge → watertight → validate); see
docs/printing.md. Do not treat the editor GLB as print-ready.
