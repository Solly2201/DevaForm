"""
DevaForm human base — authoring-time export from MakeHuman.

Runs MakeHuman Community 1.2.0's OWN model and export code (unmodified
application files, its bundled Python) to produce:

  exports/<variant>.mhm    the MakeHuman model file — load this in the GUI
                           and press Export to reproduce the mesh by hand
  exports/<variant>.obj    written by plugins/9_export_obj (the exporter the
                           GUI's Export tab calls), via its own ObjConfig
  exports/joints.json      canonical joint positions from the official
                           human.getJointPosition() API, per variant
  exports/weights.json     the CC0 default rig weights + bone hierarchy

Nothing here ships in DevaForm: this is an authoring step, like opening a
DCC tool. The runtime consumes only the built GLB.

Licensing: MakeHuman's application code is AGPL, but characters exported
through the export functionality of an official unmodified build are CC0
(makehumancommunity.org/content/license_explanation.html). This script
drives that same exporter rather than reimplementing it, and the .mhm
files make the result reproducible by hand in the GUI.

Usage (from the repo root, with MakeHuman extracted to MH_DIR):
  <MH_DIR>/../Python/python.exe tools/humanbase/export-makehuman.py <MH_DIR>
"""
import json
import os
import shutil
import sys

MH_DIR = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "exports"))

os.chdir(MH_DIR)
sys.path.insert(0, MH_DIR)

import makehuman  # noqa: E402

makehuman.set_sys_path()

from core import G  # noqa: E402


class _Camera:
    """The save path records the GUI camera; headless has none."""

    def getRotation(self):
        return [0.0, 0.0, 0.0]

    translation = [0.0, 0.0, 0.0]
    zoomFactor = 1.0


class _App:
    def __init__(self):
        self.settings = {"units": "metric", "restposeonly": False}
        self.saveHandlers = []
        self.loadHandlers = {}
        self.modelCamera = _Camera()
        self.selectedHuman = None

    def progress(self, *args, **kwargs):
        pass

    def getSetting(self, name, default=None):
        return self.settings.get(name, default)

    def addLogMessage(self, *args, **kwargs):
        pass

    def addObject(self, *args, **kwargs):
        pass

    def status(self, *args, **kwargs):
        pass


G.app = _App()

import files3d  # noqa: E402
import proxy  # noqa: E402
import getpath  # noqa: E402
import humanmodifier  # noqa: E402
from human import Human  # noqa: E402

sys.path.insert(0, os.path.join(MH_DIR, "plugins", "9_export_obj"))
import mh2obj  # noqa: E402
from mh2obj import exportObj  # noqa: E402  (the GUI's own exporter)

# The exporter plugin's own config class, used exactly as the GUI does.
_plugin = __import__("importlib").machinery.SourceFileLoader(
    "mh_export_obj_plugin", os.path.join(MH_DIR, "plugins", "9_export_obj", "__init__.py")
).load_module()
ObjConfig = _plugin.ObjConfig

# ---------------------------------------------------------------------------
# Variants — macro modifiers only, so every export shares one topology.
# ---------------------------------------------------------------------------

BASE = {
    "macrodetails/Gender": 1.0,
    # A god is depicted in his prime, not in his twenties: the base is a
    # mature adult so the face has structure to be serene with.
    "macrodetails/Age": 0.62,
    # South-Asian-leaning mix. MakeHuman offers only these three axes, and
    # this blend is the usual approximation. It belongs in the base rather
    # than in a deity's morph: every deity DevaForm makes is Indian, so a
    # generically European base would be the wrong foundation to build on.
    "macrodetails/African": 0.12,
    "macrodetails/Asian": 0.30,
    "macrodetails/Caucasian": 0.58,
    "macrodetails-height/Height": 0.68,
    "macrodetails-proportions/BodyProportions": 0.62,
    "macrodetails-universal/Muscle": 0.62,
    "macrodetails-universal/Weight": 0.48,
    "breast/BreastSize": 0.0,
    "breast/BreastFirmness": 0.5,
}

# Morph sources vary GIRTH AND SURFACE SHAPE ONLY. Height, limb lengths and
# body proportions stay fixed so every variant shares one skeleton: a morph
# that lengthened bones would slide the skin off the joints it is bound to.
#
# Build (macro muscle/weight) and morphology (where that mass sits) are
# deliberately separate targets, so a deity can ask for a heroic taper
# without also asking for bulk.
VARIANTS = {
    # The canonical rest shape every morph target is measured against.
    "neutral": {},
    "lean": {
        "macrodetails-universal/Muscle": 0.40,
        "macrodetails-universal/Weight": 0.33,
    },
    "athletic": {
        "macrodetails-universal/Muscle": 0.82,
        "macrodetails-universal/Weight": 0.46,
    },
    "powerful": {
        "macrodetails-universal/Muscle": 0.96,
        "macrodetails-universal/Weight": 0.66,
    },
    # Heroic: the classical divine male silhouette — shoulders and back
    # carrying the width, waist taken in, chest and limbs developed.
    "heroic": {
        "torso/torso-vshape-decr|incr": 0.75,
        "torso/torso-scale-horiz-decr|incr": 0.30,
        "torso/torso-muscle-dorsi-decr|incr": 0.65,
        "torso/torso-muscle-pectoral-decr|incr": 0.55,
        "hip/hip-scale-horiz-decr|incr": -0.25,
        "stomach/stomach-tone-decr|incr": 0.60,
        "neck/neck-scale-horiz-decr|incr": 0.35,
        "buttocks/buttocks-volume-decr|incr": 0.20,
        "armslegs/l-upperarm-shoulder-muscle-decr|incr": 0.70,
        "armslegs/r-upperarm-shoulder-muscle-decr|incr": 0.70,
        "armslegs/l-upperarm-muscle-decr|incr": 0.55,
        "armslegs/r-upperarm-muscle-decr|incr": 0.55,
        "armslegs/l-lowerarm-muscle-decr|incr": 0.45,
        "armslegs/r-lowerarm-muscle-decr|incr": 0.45,
        "armslegs/l-upperleg-muscle-decr|incr": 0.50,
        "armslegs/r-upperleg-muscle-decr|incr": 0.50,
        "armslegs/l-lowerleg-muscle-decr|incr": 0.45,
        "armslegs/r-lowerleg-muscle-decr|incr": 0.45,
    },
    # Divine face: the serene countenance of the icon — broad brow, long
    # calm almond eyes, straight nose, composed full mouth, defined cheek
    # and jaw, and the elongated lobes that iconography gives to gods and
    # ascetics. Face only; the body is untouched.
    "divine": {
        # Kept small on purpose: a taller brow grows the skull, and every
        # morph has to leave the statue exactly one canonical metre tall.
        "forehead/forehead-scale-vert-decr|incr": 0.22,
        "forehead/forehead-temple-decr|incr": 0.35,
        # A brow that comes forward shades the eyes, which is most of what
        # makes a face read as composed rather than alert.
        "forehead/forehead-trans-backward|forward": 0.40,
        "forehead/forehead-nubian-decr|incr": -0.25,
        "eyebrows/eyebrows-trans-down|up": -0.45,
        "eyebrows/eyebrows-angle-down|up": 0.18,
        "eyebrows/eyebrows-trans-backward|forward": 0.25,
        # Long, level, half-lidded eyes set deep under that brow.
        "eyes/l-eye-scale-decr|incr": 0.26,
        "eyes/r-eye-scale-decr|incr": 0.26,
        "eyes/l-eye-height1-decr|incr": -0.45,
        "eyes/r-eye-height1-decr|incr": -0.45,
        "eyes/l-eye-height2-decr|incr": -0.62,
        "eyes/r-eye-height2-decr|incr": -0.62,
        "eyes/l-eye-height3-decr|incr": -0.35,
        "eyes/r-eye-height3-decr|incr": -0.35,
        "eyes/l-eye-push1-in|out": -0.35,
        "eyes/r-eye-push1-in|out": -0.35,
        "eyes/l-eye-eyefold-concave|convex": 0.40,
        "eyes/r-eye-eyefold-concave|convex": 0.40,
        "eyes/l-eye-eyefold-down|up": -0.30,
        "eyes/r-eye-eyefold-down|up": -0.30,
        "eyes/l-eye-corner2-down|up": 0.30,
        "eyes/r-eye-corner2-down|up": 0.30,
        "eyes/l-eye-bag-decr|incr": -0.40,
        "eyes/r-eye-bag-decr|incr": -0.40,
        "nose/nose-greek-decr|incr": 0.45,
        "nose/nose-hump-decr|incr": -0.20,
        "nose/nose-scale-depth-decr|incr": 0.20,
        "nose/nose-nostrils-width-decr|incr": -0.20,
        "nose/nose-base-down|up": -0.15,
        # A mouth at rest, closed and level, with weight in the lips.
        "mouth/mouth-upperlip-volume-decr|incr": 0.45,
        "mouth/mouth-lowerlip-volume-decr|incr": 0.45,
        "mouth/mouth-angles-down|up": 0.22,
        "mouth/mouth-cupidsbow-decr|incr": 0.35,
        "mouth/mouth-philtrum-volume-decr|incr": 0.30,
        "mouth/mouth-scale-horiz-decr|incr": -0.14,
        "mouth/mouth-laugh-lines-in|out": 0.20,
        # Structure: jaw, chin and cheekbones a young face does not have.
        "chin/chin-bones-decr|incr": 0.55,
        "chin/chin-prominent-decr|incr": 0.30,
        "chin/chin-height-decr|incr": 0.15,
        "cheek/l-cheek-bones-decr|incr": 0.55,
        "cheek/r-cheek-bones-decr|incr": 0.55,
        "cheek/l-cheek-inner-decr|incr": -0.30,
        "cheek/r-cheek-inner-decr|incr": -0.30,
        "cheek/l-cheek-trans-down|up": 0.20,
        "cheek/r-cheek-trans-down|up": 0.20,
        "ears/l-ear-lobe-decr|incr": 0.70,
        "ears/r-ear-lobe-decr|incr": 0.70,
    },
    # Ascetic: the tapasvin — spare, sinewy, no softness, the definition
    # coming from the absence of fat rather than from bulk.
    "ascetic": {
        "macrodetails-universal/Muscle": 0.58,
        "macrodetails-universal/Weight": 0.30,
        "stomach/stomach-tone-decr|incr": 0.85,
        "torso/torso-scale-depth-decr|incr": -0.25,
        "torso/torso-muscle-pectoral-decr|incr": -0.30,
        "torso/torso-muscle-dorsi-decr|incr": -0.20,
        "armslegs/l-upperarm-fat-decr|incr": -0.60,
        "armslegs/r-upperarm-fat-decr|incr": -0.60,
        "armslegs/l-lowerarm-fat-decr|incr": -0.60,
        "armslegs/r-lowerarm-fat-decr|incr": -0.60,
        "armslegs/l-upperleg-fat-decr|incr": -0.50,
        "armslegs/r-upperleg-fat-decr|incr": -0.50,
        "armslegs/l-lowerleg-fat-decr|incr": -0.50,
        "armslegs/r-lowerleg-fat-decr|incr": -0.50,
    },
}

os.makedirs(OUT_DIR, exist_ok=True)
for entry in os.listdir(OUT_DIR):
    target = os.path.join(OUT_DIR, entry)
    shutil.rmtree(target) if os.path.isdir(target) else os.remove(target)

human = Human(files3d.loadMesh(getpath.getSysDataPath("3dobjs/base.obj"), maxFaces=5))
G.app.selectedHuman = human
modifiers = humanmodifier.loadModifiers(
    getpath.getSysDataPath("modifiers/modeling_modifiers.json"), human
)
print("modifiers available:", len(modifiers))

# Eyes. The base mesh has eye sockets but no eyeballs — those are a proxy,
# fitted to the face, so they follow every morph. Attaching it adds a second
# object to the export and leaves the body's own geometry untouched.
eyes_proxy = proxy.loadProxy(human, getpath.getSysDataPath("eyes/high-poly/high-poly.mhpxy"), type="Eyes")
eyes_mesh, eyes_object = eyes_proxy.loadMeshAndObject(human)
human.setEyesProxy(eyes_proxy)
EYES_GROUP = eyes_mesh.name

JOINT_NAMES = [name[len("joint-"):] for name in human.getJoints()]

report = {
    "makehumanVersion": makehuman.getVersionStr(),
    "exporter": "plugins/9_export_obj (mh2obj.exportObj) with the plugin's ObjConfig",
    "units": "decimetres (MakeHuman native, scale 1.0)",
    "feetOnGround": False,
    "variants": {},
}

# Detail modifiers default to 0 and are NOT part of BASE, so each variant
# must clear the previous one's — otherwise the shapes accumulate down the
# list and every target after the first is measured against the wrong body.
DETAIL_KEYS = sorted(
    {key for overrides in VARIANTS.values() for key in overrides} - set(BASE)
)

for name, overrides in VARIANTS.items():
    settings = dict.fromkeys(DETAIL_KEYS, 0.0)
    settings.update(BASE)
    settings.update(overrides)
    for modifier, value in settings.items():
        human.getModifier(modifier).setValue(value)
    human.applyAllTargets()
    # Refit the eyes to the morphed face, exactly as the GUI's proxy
    # chooser does after a change.
    eyes_proxy.update(eyes_object.getSeedMesh(), False)
    eyes_object.getSeedMesh().update()

    mhm_path = os.path.join(OUT_DIR, name + ".mhm")
    human.setName("devaform-human-" + name)
    human.save(mhm_path)

    config = ObjConfig()
    config.setHuman(human)
    config.feetOnGround = False   # one shared origin across variants
    config.scale = 1.0
    config.unit = "dm"
    config.hiddenGeom = False     # skin only; joint/helper geometry excluded
    config.useNormals = True
    obj_path = os.path.join(OUT_DIR, name + ".obj")
    exportObj(obj_path, config)

    if name == "neutral":
        # The exporter writes a mask-filtered clone; parent_map[i] is the
        # base-mesh vertex that OBJ vertex i came from, which is how the
        # rig's weights (indexed on the base mesh) reach the exported skin.
        clone = human.meshData.clone(scale=1.0, filterMaskedVerts=True)
        report["parentMap"] = [int(v) for v in clone.parent_map]
        report["baseVertexCount"] = int(human.meshData.getVertexCount())

    joints = {}
    for joint in JOINT_NAMES:
        try:
            joints[joint] = [float(v) for v in human.getJointPosition(joint)]
        except Exception as error:  # noqa: BLE001
            print("  joint %s unavailable: %s" % (joint, error))

    report["variants"][name] = {
        "modifiers": settings,
        "joints": joints,
        "vertices": int(human.meshData.getVertexCount()),
        "faces": int(human.meshData.getFaceCount()),
    }
    print("exported %-9s verts=%d faces=%d" % (name, human.meshData.getVertexCount(), human.meshData.getFaceCount()))

# The eye proxy is painted, not modelled: sclera, iris and pupil are one
# surface distinguished only by its texture. DevaForm has no textures, so
# record what colour the artist put on each face and let the builder turn
# that into material zones — the mapping stays the artist's, not a guess.
def eye_face_colours(mesh):
    import image as mhimage  # MakeHuman's own image loader

    texture = str(mesh.material.diffuseTexture)
    pixels = mhimage.Image(texture)
    width, height = pixels.width, pixels.height
    data = pixels.data
    colours = []
    for face in range(len(mesh.fvert)):
        total = [0.0, 0.0, 0.0]
        corners = mesh.fuvs[face]
        for corner in corners:
            u, v = mesh.texco[corner]
            x = min(width - 1, max(0, int(u * width)))
            y = min(height - 1, max(0, int((1.0 - v) * height)))
            pixel = data[y, x]
            for channel in range(3):
                total[channel] += float(pixel[channel])
        colours.append([int(round(c / len(corners))) for c in total])
    return os.path.basename(texture), colours


eyes_seed = eyes_object.getSeedMesh()
texture_name, face_colours = eye_face_colours(eyes_seed)
report["eyes"] = {
    "group": EYES_GROUP,
    "proxy": "data/eyes/high-poly (MakeHuman system asset, CC0)",
    "texture": texture_name,
    "faces": len(face_colours),
    "faceColours": face_colours,
}
print("eyes: %d faces sampled from %s" % (len(face_colours), texture_name))

with open(os.path.join(OUT_DIR, "joints.json"), "w", encoding="utf8") as handle:
    json.dump(report, handle, indent=1)

# The CC0 default rig: bone hierarchy + skin weights on the base topology.
shutil.copyfile(getpath.getSysDataPath("rigs/default.mhskel"), os.path.join(OUT_DIR, "default.mhskel"))
shutil.copyfile(
    getpath.getSysDataPath("rigs/default_weights.mhw"), os.path.join(OUT_DIR, "default_weights.mhw")
)

print("wrote", OUT_DIR)
