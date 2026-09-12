# Blender tooling

Production tooling for the DevaForm asset pipeline (Blender ≥ 4.0).
Blender is not required for the web app — these scripts serve asset
authors. All of them consume `canonical-rig.json`, generated from the
schema with:

```bash
pnpm --filter @devaform/character-schema export-canonical
```

so the DCC rig can never drift from the engine's skeleton/sockets/zones.

| Script | Purpose |
|---|---|
| `devaform_template.py` | Builds the canonical authoring scene: metric units, armature (bone names = joint ids), `SOCKET_*` empties, `zone:*` materials, look-dev camera/light. Save the result as `devaform_template.blend`. |
| `devaform_validate.py` | In-Blender contract checks: applied transforms, triangle budget, non-manifold/loose geometry, zone naming, `JOINT_*` grouping, bounds. Exit 1 on errors. |
| `devaform_export.py` | Canonical GLB export of the `DevaForm_Asset` collection (+Y up, applied modifiers, no cameras/lights/animation). |
| `devaform_thumbnail.py` | 512×512 transparent thumbnail render with the template camera. |

Artist workflow (see docs/production-asset-pipeline.md):

```
template → import/sculpt → clean → JOINT_/SOCKET_/zone naming →
devaform_validate → devaform_export → pnpm validate-assets →
manifest entry → Divine Studio QA
```

Phase D additions (planned): `bake_print_model.py` — resolve a
CharacterConfiguration to a merged watertight print mesh.
