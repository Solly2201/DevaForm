/**
 * Shared assets — components that belong to no single deity.
 *
 * The human body base lives here because it is exactly that: a human, on
 * which any human-formed deity can be built. Deities adopt it by naming it
 * in their own definition; nothing here knows who will wear it.
 *
 * `deityCompatibility: []` means "no deity offers this yet": the registry
 * resolves it (so a configuration referencing it loads, saves and shares),
 * while no deity's picker lists it. Stage 2+ opens it up deliberately.
 */
import type { AssetDefinition } from "../types";

export const SHARED_ASSETS: readonly AssetDefinition[] = [
  {
    id: "humanoid.body.human",
    version: 1,
    name: "Human Body",
    description:
      "Continuous skinned human male body: one mesh, canonical rest pose, GPU morph targets for build. Derived from an official MakeHuman export (CC0) and retargeted by apps/web/scripts/build-human-base.mjs.",
    kind: { type: "part", slot: "body" },
    deityCompatibility: [],
    stage: "experimental",
    source: { kind: "glb", path: "/assets/humanoid/body/human/1/model.glb" },
    provenance: {
      type: "imported",
      provider: "MakeHuman",
      tool: "MakeHuman Community 1.2.0 official OBJ exporter; apps/web/scripts/build-human-base.mjs",
      references: ["tools/humanbase/exports/neutral.mhm"],
      notes:
        "Characters exported through the export functionality of an official, unmodified MakeHuman build are CC0. The committed .mhm files reproduce this mesh in the MakeHuman GUI. MakeHuman is authoring-time only — no runtime dependency ships.",
    },
    geometry: { triangles: 26756, vertices: 13380, boundsM: [0.34992, 1.0, 0.16504] },
    morphTargets: ["bodyLean", "bodyAthletic", "bodyPowerful"],
    // Measured off model.glb by scripts/build-human-base.mjs — see
    // tools/humanbase/measurements.json. Regenerate, do not hand-edit.
    bodyProfile: {
      base: {
        spineToChestY: 0.11414,
        neckRadius: 0.03237,
        neckBaseOffsetY: 0.01,
        pelvisHalfWidth: 0.08344,
        dhotiRadius: 0.1113,
        bellyCenterY: -0.02453,
        bellyCenterZ: 0.02711,
        bellyRadiusX: 0.08344,
        bellyRadiusY: 0.0816,
        bellyRadiusZ: 0.05722,
        chestCenterY: -0.01354,
        chestCenterZ: 0.04514,
        chestRadiusX: 0.12187,
        chestRadiusY: 0.04354,
        chestRadiusZ: 0.06171,
      },
      morphs: {
        bodyLean: {
          neckRadius: -0.00117,
          pelvisHalfWidth: -0.00153,
          dhotiRadius: -0.00281,
          bellyCenterZ: -0.00345,
          bellyRadiusX: -0.00153,
          bellyRadiusZ: 0.00187,
          chestCenterZ: 0.00035,
          chestRadiusX: -0.00102,
          chestRadiusZ: 0.00018,
        },
        bodyAthletic: {
          neckRadius: -0.00023,
          pelvisHalfWidth: 0.00187,
          dhotiRadius: -0.00132,
          bellyCenterZ: -0.00045,
          bellyRadiusX: 0.00187,
          bellyRadiusZ: -0.00041,
          chestCenterZ: -0.00101,
          chestRadiusZ: -0.00041,
        },
        bodyPowerful: {
          neckRadius: 0.00579,
          pelvisHalfWidth: 0.00368,
          dhotiRadius: 0.00232,
          bellyCenterZ: 0.00048,
          bellyRadiusX: 0.00368,
          bellyRadiusZ: 0.00534,
          chestCenterZ: -0.00071,
          chestRadiusZ: 0.0048,
        },
      },
    },
    materialZones: ["skin"],
    category: "body",
    printability: {
      printSourceAvailable: false,
      notes: "Evaluation asset: not validated for manufacturing.",
    },
  },
] as const;
