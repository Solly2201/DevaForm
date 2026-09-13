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

No paid AI 3D service (Meshy/Tripo API keys), Blender install, conversion
CLI or authenticated browser session exists in the current development
environment — re-verified each phase, not assumed. What DOES work, verified
2026-09-12, is free generation through public Hugging Face Space APIs — see
the next section. The pipeline also still receives generated files by
drop-in.

## Free AI generation routes (verified, with licenses)

`pnpm ai:generate-head` (tools/ai3d/generate_head.py, needs Python +
`pip install gradio_client`) calls a provider's public HF Space and writes
GLBs to `tools/ai3d/out/` (git-ignored). Provider truth table, tested from
this machine:

| Provider | Space | Model license | Free access | Quality |
|---|---|---|---|---|
| `triposr` | stabilityai/TripoSR | MIT (code + weights) | dedicated hardware, anonymous, no quota, ~40 s | coarse draft — silhouettes only |
| `triposg` | VAST-AI/TripoSG | MIT | ZeroGPU: anonymous quota ~3 min/day/IP; free HF token lifts it | good sculptural geometry |
| `trellis2` | microsoft/TRELLIS.2 | MIT | ZeroGPU: jobs request ≥120 s GPU — effectively needs a free HF token | best: sharp geometry + PBR textures |

Hosted commercial free tiers were investigated and rejected: Tripo's free
plan publishes outputs under CC BY 4.0 **non-commercial** (unusable for
DevaForm); Meshy's free tier has comparable export/licensing restrictions.
Local inference was audited too: this machine (RTX 2050, 4 GB VRAM, 8 GB
RAM, CPU-only torch) cannot run TRELLIS (~16 GB VRAM) or Hunyuan3D-2
(~5 GB+ shape model); TripoSR could run locally but its HF Space gives the
same model without setup.

`HF_TOKEN` is read from the environment only (or `hf auth login`'s local
token cache) — never commit it. Outputs from all three providers are
MIT-model outputs with no provider usage restriction found (checked
2026-09-13); record the check date in provenance notes when ingesting.

**The free trellis2 quota is ~1 useful generation/day.** Spend it well:
`--seeds 12345,777,2024` generates several genuinely different candidates
in one run (the model is seed-sensitive) and stops the moment the ZeroGPU
quota is spent, keeping whatever it already produced — it never hammers
the service. Compare the candidates and ingest only the best.

**Textured GLBs and cleanup.** `tools/ai3d/clean_mesh.py` (needs
`pip install trimesh`) does what Node cannot on textured GLBs: TRELLIS
outputs the head *plus four flat backdrop reference sheets and stray
floaters*, which it removes by connected-component analysis; it also
computes missing normals, names the baked material, normalizes
scale/orientation/seat and wraps the mesh in `JOINT_head`. Optional
`--decimate-faces N` quadric-decimates to a real-time budget, but it is
**geometry-only**: a baked-UV texture does not survive it (verified — the
mesh turns untextured and multi-component sculpts crack at seams), so use
it on clean untextured base heads, not on a mesh whose look depends on
baked UVs.

The first real AI asset produced this way is `ganesha.head.aidraft@1`
(TripoSR, stage `review`): honest draft quality, below the SDF sculpt —
kept as pipeline proof and comparison baseline at
`/dev/assets/ganesha.head.aidraft?compare=ganesha.head.sculpted`.
AI meshes often ship without normals and with baked vertex colors — the
ingest normalizer now computes missing normals and drops vertex colors on
zone-mapped meshes (a normal-less mesh renders black under PBR zone
materials), and `--offset "x,y,z"` seats a head part so the joint origin
lands inside the neck (the sculpted head spans y −0.157…+0.229 around
JOINT_head).

## Runbook: generate → clean → ingest an AI head

The end-to-end zero-cost path, as actually run for `ganesha.head.aidraft@2`:

1. **Generate.** With a free HF token in place:

   ```
   pnpm ai:generate-head -- --provider trellis2 \
       --ref tools/ai3d/refs/classic-head-bust-v2.png --seeds 12345,777,2024
   ```

   `classic-head-bust-v2.png` is the prepared reference: full curling
   trunk, both tusks, serene face, alpha-matted background. Raw GLBs land
   in `tools/ai3d/out/` (git-ignored). Compare seeds; keep the best.
2. **Clean + normalize** (TRELLIS bakes textures + emits backdrop sheets):

   ```
   python tools/ai3d/clean_mesh.py tools/ai3d/out/trellis2-seed12345-0.glb \
       tools/ai3d/out/clean.glb --joint head --target-height 0.41 --seat-y -0.145
   ```

   Seat-y −0.145 lands the neck origin where the SDF head sits around
   `JOINT_head`.
3. **Ingest** the cleaned, already-normalized GLB (copy-only — the mesh is
   textured and Node cannot decode it):

   ```
   pnpm ingest-asset tools/ai3d/out/clean.glb --id ganesha.head.aidraft \
       --version <next> --name "Classic (AI)" --joint head --slot head \
       --copy-only --source ai --provider trellis2 \
       --tool "microsoft/TRELLIS.2 HF Space (authenticated free account)" \
       --notes "…generation command, license check date, honest limits…"
   ```

   Copy-only still measures triangles/vertices/bounds, lists materials and
   embedded texture sizes, and flags missing JOINT_head groups.
4. Add the emitted manifest entry (stage `review`), run
   `pnpm validate-assets`, then `pnpm generate-thumbnails` (dev server up).
5. Judge it: `/dev/assets/ganesha.head.aidraft?compare=ganesha.head.sculpted`
   renders it side-by-side with the SDF hero (the compare view auto-frames
   by the larger asset). Promote to the default head in
   `character-schema/src/defaults.ts` only if it visually wins AND is
   architecturally acceptable; the SDF head stays the fallback either way.
6. Full Divine Studio QA: body integration, poses, item attachment,
   palettes, save/reload, library, head switching.

**Integrated features.** A complete sculpt (AI or artist) that bakes in its
own eyes/ears/trunk/tusks/crown declares them in `integratedFeatures` on the
manifest entry; the rig then suppresses the matching standalone parts and
attachments so the head doesn't grow duplicate ears or wear a second crown.
Declare only what is *actually* baked into the geometry — never fake
modularity in metadata.

**Promotion & versioning.** `ganesha.head.classic@4` is reserved for a
promotion-worthy head; an inferior candidate stays under `ganesha.head.aidraft`
at stage `review`. Either id can later be superseded (artist sculpt, better
generation) with only a manifest/dataset change — the replacement-architecture
test in asset-system guards this.

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
