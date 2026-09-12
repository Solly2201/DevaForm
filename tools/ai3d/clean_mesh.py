"""DevaForm — AI mesh cleanup + normalization for textured GLBs.

Node tooling cannot decode textured GLBs, so this trimesh-based step covers
the gap for AI outputs: drop disconnected junk components (backdrop panels,
floaters), normalize scale/orientation/position, and wrap the result in a
``JOINT_<joint>`` node so the part contract holds. Output goes to
``pnpm ingest-asset <file> --copy-only``.

    python tools/ai3d/clean_mesh.py in.glb out.glb --joint head \
        --target-height 0.385 --seat-y -0.157 [--keep-ratio 0.25] [--yaw 180]

Requires: pip install trimesh
"""
from __future__ import annotations

import argparse
import sys

import numpy as np
import trimesh


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--joint", default="head")
    parser.add_argument("--target-height", type=float, default=None)
    parser.add_argument("--seat-y", type=float, default=None,
                        help="after recentering, translate so min-y sits at this height")
    parser.add_argument("--keep-ratio", type=float, default=0.25,
                        help="drop components with fewer faces than ratio × largest component")
    parser.add_argument("--yaw", type=float, default=0.0, help="rotate about +Y in degrees")
    args = parser.parse_args()

    loaded = trimesh.load(args.input, force="scene")
    meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
    if not meshes:
        print("no meshes in input", file=sys.stderr)
        return 1
    merged = trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]

    # memory-light component filter: label faces on the adjacency graph and
    # mask in place instead of materializing every submesh (8 GB machines).
    # Junk backdrops sit AWAY from the model core, so the rule is spatial:
    # anchor on the largest component near the scene center, then keep every
    # component whose AABB intersects the anchor's AABB (slightly expanded).
    labels = trimesh.graph.connected_component_labels(
        merged.face_adjacency, node_count=len(merged.faces))
    counts = np.bincount(labels)
    order = np.argsort(counts)[::-1]

    centers = merged.triangles_center
    scene_span = float(np.max(merged.bounds[1] - merged.bounds[0]))

    def component_aabb(label):
        pts = centers[labels == label]
        return pts.min(axis=0), pts.max(axis=0)

    # Backdrop panels are large flat sheets: near-zero thickness on one axis
    # while spanning a large portion of the scene on the other two.
    keep_labels = []
    dropped_sheets = 0
    for label in range(len(counts)):
        if counts[label] == 0:
            continue
        lo, hi = component_aabb(label)
        dims = np.sort(hi - lo)
        is_sheet = dims[0] < 0.005 * scene_span and dims[1] > 0.2 * scene_span
        if is_sheet:
            dropped_sheets += 1
        else:
            keep_labels.append(label)
    for label in order[:8]:
        lo, hi = component_aabb(label)
        tag = "KEEP" if label in keep_labels else "drop"
        print(f"  [{tag}] {counts[label]:6,} faces  aabb {np.round(lo, 3).tolist()} … {np.round(hi, 3).tolist()}")
    print(f"dropped {dropped_sheets} flat backdrop sheet(s)")

    # Second pass: the model core is the union AABB of the largest surviving
    # components; drop frame edges / dust that lie entirely outside it.
    core = sorted(keep_labels, key=lambda l: counts[l], reverse=True)[:20]
    core_lo = np.min([component_aabb(l)[0] for l in core], axis=0)
    core_hi = np.max([component_aabb(l)[1] for l in core], axis=0)
    pad = 0.10 * (core_hi - core_lo)
    core_lo, core_hi = core_lo - pad, core_hi + pad
    survivors = []
    stray = 0
    for label in keep_labels:
        lo, hi = component_aabb(label)
        if np.all(hi >= core_lo) and np.all(lo <= core_hi):
            survivors.append(label)
        else:
            stray += 1
    keep_labels = survivors
    print(f"dropped {stray} stray component(s) outside the core AABB")
    mask = np.isin(labels, keep_labels)
    print(f"components: {int((counts > 0).sum())} → kept {len(keep_labels)} "
          f"({int(mask.sum()):,}/{len(merged.faces):,} faces)")
    merged.update_faces(mask)
    merged.remove_unreferenced_vertices()
    mesh = merged

    if args.yaw:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(
            np.radians(args.yaw), [0, 1, 0]))

    bounds = mesh.bounds
    if args.target_height:
        height = bounds[1][1] - bounds[0][1]
        mesh.apply_scale(args.target_height / height)
        bounds = mesh.bounds
        print(f"scaled to {args.target_height} m height")

    # recenter XZ, then seat vertically
    center = (bounds[0] + bounds[1]) / 2
    ty = -bounds[0][1] + (args.seat_y or 0.0)
    mesh.apply_translation([-center[0], ty, -center[2]])
    bounds = mesh.bounds
    print(f"bounds: {np.round(bounds[1] - bounds[0], 4).tolist()} m, "
          f"y {bounds[0][1]:.3f}…{bounds[1][1]:.3f}")
    print(f"{len(mesh.faces):,} faces, {len(mesh.vertices):,} vertices")

    # PBR zone/standard materials need normals; AI meshes often omit them.
    mesh.fix_normals()
    _ = mesh.vertex_normals  # force lazy computation so the exporter embeds NORMAL
    if getattr(mesh.visual, "material", None) is not None and not getattr(mesh.visual.material, "name", None):
        mesh.visual.material.name = "aihead_baked"

    scene = trimesh.Scene()
    joint_node = f"JOINT_{args.joint}"
    scene.graph.update(frame_to=joint_node, matrix=np.eye(4))
    scene.add_geometry(mesh, node_name="mesh_0", geom_name="mesh_0",
                       parent_node_name=joint_node)
    scene.export(args.output)
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
