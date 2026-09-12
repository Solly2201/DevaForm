# AI-Assisted Ganesha Asset Workflow

How we intend to produce production Ganesha assets with an AI-assisted/hybrid
pipeline. AI output is raw material — every asset still passes human cleanup
and the Asset Specification before it ships. The engine never assumes
AI-generated meshes are clean.

## Pipeline

```
1. Concept        2. Multi-view       3. Image-to-3D      4. Blender
   generation  ->    references    ->    generation    ->    cleanup
                                                              |
8. Sockets    <-  7. Rigging      <-  6. Modularize   <-  5. Retopo/
   & export        (canonical rig)     (split parts)       sculpt fix
```

### 1. Concept generation
- Image models (any provider) for iconography exploration: silhouette,
  crown style, ornament density, pose language.
- Ground concepts in traditional references (dhyana shlokas, classical
  murti proportion systems / Shilpa Shastra tala measurements) — review with
  a domain-knowledgeable stakeholder before production.

### 2. Multi-view references
- Lock a concept, generate consistent front / side / back / ¾ turnarounds.
- Neutral A-pose-equivalent (arms clear of torso, trunk uncurled variant
  too) — massively improves image-to-3D and rigging quality.

### 3. Image-to-3D
- Candidate tools: **Meshy**, **Tripo** (experimental; evaluate per asset).
  The platform does not hard-depend on any provider — output is just a mesh
  file entering the same cleanup path as a manual sculpt.
- Generate at highest available resolution; texture output optional (we
  often re-texture).

### 4. Blender cleanup
- Remove floaters, close holes, fix non-manifold edges, correct scale to
  the canonical 1 m body (`docs/asset-specification.md` §1).
- Separate fused anatomy (trunk vs face, arms vs torso).

### 5. Retopology & sculpt fixes
- Retopo to animation-friendly topology for deforming parts (body, trunk,
  garments); decorative rigid parts may keep decimated topology within
  budget.
- Sculpt pass to restore iconographic details AI flattens (nail lines,
  ornament engraving, modak texture).

### 6. Modularization
- Split into the platform's part slots: body, head, ears, trunk variants,
  tusks, garments — each a separately swappable asset.
- Attachments (crowns, jewellery, hand items) become independent assets
  with socket-origin pivots.

### 7. Rigging
- Bind to the canonical armature (bone names = schema joint ids). Weight
  paint; verify the full pose-preset envelope and joint limits.
- Author shape keys for the declared morph set (trunkLength, earSize…).

### 8. Sockets, materials, export
- Add `SOCKET_*` empties, assign `zone:*` materials, UV/texture per spec.
- Export editor GLB + archive print-resolution source.
- Run `tools/blender/validate_asset.py`; submit manifest entry + thumbnail.

## Browser optimization
- Meet triangle budgets (spec §6), KTX2 textures, later Draco/Meshopt.
- One material per zone per asset where possible (draw-call hygiene).

## Print optimization
- Print source stays high-res and manifold; thickness rules per spec §9.
- Pose baking and boolean assembly happen in the Phase D pipeline, not in
  the asset itself.

## Cultural review gate
Every Ganesha asset (and future deity assets) passes an iconography review
before `production` stage: attribute correctness (which hand holds what),
trunk direction symbolism, ornament appropriateness. This is a hard gate,
same weight as technical validation.
