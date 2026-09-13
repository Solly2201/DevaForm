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

    def status(self, *args, **kwargs):
        pass


G.app = _App()

import files3d  # noqa: E402
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
    "macrodetails/Age": 0.55,          # mature adult
    "macrodetails/African": 0.0,
    "macrodetails/Asian": 0.35,
    "macrodetails/Caucasian": 0.65,
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

with open(os.path.join(OUT_DIR, "joints.json"), "w", encoding="utf8") as handle:
    json.dump(report, handle, indent=1)

# The CC0 default rig: bone hierarchy + skin weights on the base topology.
shutil.copyfile(getpath.getSysDataPath("rigs/default.mhskel"), os.path.join(OUT_DIR, "default.mhskel"))
shutil.copyfile(
    getpath.getSysDataPath("rigs/default_weights.mhw"), os.path.join(OUT_DIR, "default_weights.mhw")
)

print("wrote", OUT_DIR)
