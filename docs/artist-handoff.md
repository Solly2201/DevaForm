# DevaForm Artist Handoff Specification

This document is the complete delivery contract for a professional 3D
artist producing a DevaForm asset. You do not need to understand the web
application — deliver to this specification and the asset drops into the
platform. It applies equally to Blender, ZBrush→Blender, or Maya
workflows, and to cleaned-up AI-generated meshes.

## 1. What you receive

- This document.
- `tools/blender/canonical-rig.json` — the machine-readable skeleton,
  sockets and material zones (never hand-edit it).
- `tools/blender/devaform_template.py` — builds the canonical Blender
  scene (metric units, armature, `SOCKET_*` empties, `zone:*` materials,
  look-dev camera). Run once, save as your working template.
- Reference boards for the deity and the specific asset task.
- The asset task: id, version, category and either a part **slot** or the
  attachment **sockets** (e.g. "Create `ganesha.head.classic` v2 —
  part, slot `head`").

## 2. Scene fundamentals

| Property | Requirement |
|---|---|
| Units | **Metres**, scene scale 1.0 (character stands ≈ 1.0 m) |
| Up / forward | **+Y up, character faces +Z** in the exported glTF (Blender's exporter handles the Z-up→Y-up conversion — model normally) |
| Transforms | All object transforms **applied** (scale 1,1,1; rotation 0) |
| Origin | Parts: world origin (the rig places them). Attachments: origin at the **attachment/grip point** |

## 3. Two asset types

**Part** (head, body, trunk, garment…): replaces a body region.
- Group all meshes under an empty/collection named **`JOINT_<jointId>`**
  (e.g. `JOINT_head`); multi-region parts use one group per joint
  (`JOINT_chest`, `JOINT_arm.frontLeft.upper`, …). Joint ids are in
  canonical-rig.json.
- Model in place, at the joint's rest position, in world coordinates.

**Attachment** (crown, held item, jewellery piece): mounts on a socket.
- No `JOINT_` groups. Origin = mount/grip point, +Y up, business end
  (blade, flower, finial) toward +Y.
- The socket list for the task tells you where it mounts; matching
  `SOCKET_*` empties exist in the template for placement reference.

## 4. Materials — zones

User-recolorable surfaces must use materials named exactly:

`zone:skin` `zone:skinSecondary` `zone:garment` `zone:garmentAccent`
`zone:metal` `zone:gem` `zone:base`

The app replaces these live (color + finish), so author them as flat
placeholders. Anything *not* user-recolorable (a painted tilak, an eye
iris) uses your own descriptively-named material and ships as authored.
One material per zone per asset where possible.

## 5. Geometry budgets & topology

| Component | Max triangles (web asset) |
|---|---|
| Head (incl. integrated features) | 20,000 |
| Body | 25,000 |
| Garment | 10,000 |
| Crown / large ornament | 8,000 |
| Small ornament / hand item | 4,000 |

- Clean, intentional topology; quads preferred in source.
- No non-manifold edges, internal faces, zero-area faces or flipped
  normals. No loose floating vertices.
- Deforming parts (body, trunk) need deformation-friendly edge flow;
  rigid statues prioritize clean static forms.
- Smooth shading with authored hard edges where intended — no faceting.

## 6. UVs & textures

- Optional for zone-only assets (zones are flat-tinted).
- If textured: single UV set, no accidental overlaps, PBR
  metal/roughness, ≤2048² for heads/bodies, ≤1024² for ornaments,
  **embedded in the GLB** (no external files).

## 7. Export & validation

1. In-Blender check: `blender file.blend --background --python
   tools/blender/devaform_validate.py` → must exit clean.
2. Export: `tools/blender/devaform_export.py` (or manually: glTF 2.0
   **GLB**, +Y up, apply modifiers, no cameras/lights/animations).
3. Deliver `model.glb` plus your source file (.blend/.ztl) and the print-
   resolution mesh if the task requests one.

The DevaForm side then runs `pnpm ingest-asset`/`pnpm validate-assets`,
which re-checks container integrity, scale envelope, zone names, JOINT
grouping and budgets — deliveries failing validation come back.

## 8. Versioning & replacement

Your asset ships as `<id>@<version>` (e.g. `ganesha.head.classic@2`).
You never modify a shipped version — revisions are new versions. Your
artist-made version replaces an AI/procedural one simply by referencing
the new version in the dataset; the application does not change. Your
name is recorded in the asset's provenance (`source.type = "artist"`,
`creator = you`) unless you prefer otherwise.

## 9. Cultural & iconographic review

DevaForm assets are devotional statuary. Follow the provided reference
boards for iconography (trunk direction, mudras, attribute placement,
ornament character); where a choice is culturally significant and the
task doesn't specify, ask rather than invent. Every production asset
passes a human iconographic review before release.

## 10. Delivery checklist

- [ ] Metres, transforms applied, correct origin
- [ ] `JOINT_*` grouping (parts) / origin-at-grip (attachments)
- [ ] `zone:*` material names (only for recolorable surfaces)
- [ ] Within triangle budget; clean topology; no non-manifold geometry
- [ ] Textures embedded (if any)
- [ ] `devaform_validate.py` clean; GLB exported via canonical settings
- [ ] Source file + GLB delivered; version number confirmed
