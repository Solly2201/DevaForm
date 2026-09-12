"""DevaForm canonical GLB export.

Exports the DevaForm_Asset collection with the settings the web engine
expects: glTF 2.0 binary, +Y up, applied modifiers, no cameras/lights, no
animation, embedded buffers.

Usage:
    blender your_asset.blend --background \
        --python tools/blender/devaform_export.py -- out/asset.glb
"""

import sys

import bpy


def output_path():
    argv = sys.argv
    if "--" in argv and len(argv) > argv.index("--") + 1:
        return argv[argv.index("--") + 1]
    return "devaform-asset.glb"


def main():
    path = output_path()
    collection = bpy.data.collections.get("DevaForm_Asset")
    if collection is None:
        raise SystemExit("No DevaForm_Asset collection found")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=True,
        export_morph=True,
    )
    print(f"exported {path}")


if __name__ == "__main__":
    main()
