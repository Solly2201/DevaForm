"""DevaForm asset thumbnail render.

Renders the DevaForm_Asset collection with the standard look-dev camera
and key light (from the template) to a 512x512 PNG.

Usage:
    blender your_asset.blend --background \
        --python tools/blender/devaform_thumbnail.py -- out/thumb.png
"""

import sys

import bpy


def output_path():
    argv = sys.argv
    if "--" in argv and len(argv) > argv.index("--") + 1:
        return argv[argv.index("--") + 1]
    return "devaform-thumb.png"


def main():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if hasattr(bpy.types, "SceneEEVEE") else "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = True
    scene.render.filepath = output_path()
    if scene.camera is None:
        raise SystemExit("No camera in scene — build the DevaForm template first")
    bpy.ops.render.render(write_still=True)
    print(f"rendered {scene.render.filepath}")


if __name__ == "__main__":
    main()
