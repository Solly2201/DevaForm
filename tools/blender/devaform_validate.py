"""DevaForm in-Blender asset validation.

Checks the objects in the DevaForm_Asset collection against the asset
contract before export:

- applied scale (1,1,1) and rotation
- triangle budget
- non-manifold edge count and loose vertices (bmesh)
- material naming (zone:* must reference known zones)
- part meshes grouped under JOINT_<id> empties/objects
- bounds within the canonical envelope

Usage:
    blender your_asset.blend --background --python tools/blender/devaform_validate.py
Exit code 1 on errors.
"""

import json
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "canonical-rig.json"), "r", encoding="utf-8") as fh:
    RIG = json.load(fh)

KNOWN_ZONES = set(RIG["materialZones"])
JOINT_IDS = {j["id"] for j in RIG["skeleton"]}
TRIANGLE_BUDGET = 150_000
MIN_SIZE, MAX_SIZE = 0.01, 2.0

errors, warnings = [], []


def check_object(obj):
    if obj.type != "MESH":
        return
    if any(abs(s - 1.0) > 1e-4 for s in obj.scale):
        errors.append(f"{obj.name}: unapplied scale {tuple(round(s, 3) for s in obj.scale)}")
    if any(abs(r) > 1e-4 for r in obj.rotation_euler):
        warnings.append(f"{obj.name}: unapplied rotation")

    mesh = obj.data
    tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    if tris > TRIANGLE_BUDGET:
        errors.append(f"{obj.name}: {tris:,} triangles exceeds {TRIANGLE_BUDGET:,}")

    bm = bmesh.new()
    bm.from_mesh(mesh)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    loose = sum(1 for v in bm.verts if not v.link_edges)
    bm.free()
    if non_manifold:
        warnings.append(f"{obj.name}: {non_manifold} non-manifold edges")
    if loose:
        warnings.append(f"{obj.name}: {loose} loose vertices")

    for slot in obj.material_slots:
        name = slot.material.name if slot.material else ""
        if name.startswith("zone:") and name[5:] not in KNOWN_ZONES:
            errors.append(f"{obj.name}: unknown material zone '{name}'")

    size = max(obj.dimensions)
    if size < MIN_SIZE or size > MAX_SIZE:
        errors.append(f"{obj.name}: dimensions {size:.3f} m outside {MIN_SIZE}-{MAX_SIZE} m")

    # Joint grouping: walk parents looking for JOINT_<id>
    parent = obj.parent
    grouped = False
    while parent is not None:
        if parent.name.startswith("JOINT_"):
            joint = parent.name[len("JOINT_"):]
            if joint not in JOINT_IDS:
                errors.append(f"{obj.name}: parent group references unknown joint '{joint}'")
            grouped = True
            break
        parent = parent.parent
    if not grouped:
        warnings.append(f"{obj.name}: not inside a JOINT_<id> group (attachment assets are exempt)")


collection = bpy.data.collections.get("DevaForm_Asset")
objects = list(collection.all_objects) if collection else list(bpy.context.scene.objects)
for obj in objects:
    check_object(obj)

print("\nDevaForm asset validation")
for message in errors:
    print(f"  ERROR   {message}")
for message in warnings:
    print(f"  warning {message}")
print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
sys.exit(1 if errors else 0)
