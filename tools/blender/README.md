# Blender tooling

Automation for the asset pipeline (Blender ≥ 4.0, Python API).

Planned scripts (Phase B):

- `generate_canonical_rig.py` — builds `canonical_rig.blend` (armature with
  bone names/positions generated from `packages/character-schema`'s skeleton
  JSON export) so the rig can never drift from the schema.
- `validate_asset.py` — CI gate for delivered GLBs: naming conventions,
  unit scale, triangle budgets, manifold checks, socket presence, material
  zone names, declared morph targets.
- `export_editor_glb.py` — standardized editor-LOD export settings.
- `bake_print_model.py` — Phase D: resolve a CharacterConfiguration JSON to
  a posed, merged, watertight print mesh (STL/3MF).

`validate_asset.py` currently performs schema-driven checks that don't need
Blender-side data; it will grow with the first real asset deliveries.
