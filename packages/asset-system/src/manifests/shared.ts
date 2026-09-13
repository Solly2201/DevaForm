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
    geometry: { triangles: 27816, vertices: 14444, boundsM: [0.34979, 1.0, 0.16544] },
    morphTargets: ["bodyLean", "bodyAthletic", "bodyPowerful", "bodyHeroic", "faceDivine", "bodyAscetic"],
    // Measured off model.glb by scripts/build-human-base.mjs — see
    // tools/humanbase/measurements.json. Regenerate, do not hand-edit.
    bodyProfile: {
      base: {
        spineToChestY: 0.11426,
        neckRadius: 0.03237,
        neckBaseOffsetY: 0.01,
        pelvisHalfWidth: 0.08352,
        dhotiRadius: 0.11133,
        bellyCenterY: -0.02443,
        bellyCenterZ: 0.02706,
        bellyRadiusX: 0.08352,
        bellyRadiusY: 0.08156,
        bellyRadiusZ: 0.05727,
        chestCenterY: -0.01356,
        chestCenterZ: 0.04514,
        chestRadiusX: 0.12186,
        chestRadiusY: 0.04356,
        chestRadiusZ: 0.0617,
      },
      morphs: {
        bodyLean: {
          neckRadius: -0.00122,
          pelvisHalfWidth: -0.00169,
          dhotiRadius: -0.00292,
          bellyCenterZ: -0.0034,
          bellyRadiusX: -0.00169,
          bellyRadiusZ: 0.00174,
          chestCenterZ: 0.00034,
          chestRadiusX: -0.00114,
          chestRadiusZ: 0.00006,
        },
        bodyAthletic: {
          neckRadius: -0.00029,
          pelvisHalfWidth: 0.00177,
          dhotiRadius: -0.00123,
          bellyCenterZ: -0.00061,
          bellyRadiusX: 0.00177,
          bellyRadiusZ: -0.00054,
          chestCenterZ: -0.00128,
          chestRadiusX: -0.00014,
          chestRadiusZ: -0.00052,
        },
        bodyPowerful: {
          neckRadius: 0.00572,
          pelvisHalfWidth: 0.00353,
          dhotiRadius: 0.00229,
          bellyCenterZ: 0.00041,
          bellyRadiusX: 0.00353,
          bellyRadiusZ: 0.00515,
          chestCenterZ: -0.00086,
          chestRadiusX: -0.00013,
          chestRadiusZ: 0.00465,
        },
        bodyHeroic: {
          neckRadius: 0.00185,
          pelvisHalfWidth: -0.00294,
          dhotiRadius: 0.00298,
          bellyCenterZ: 0.00158,
          bellyRadiusX: 0.00764,
          bellyRadiusZ: -0.00139,
          chestCenterZ: 0.00072,
          chestRadiusX: 0.00799,
          chestRadiusZ: 0.00375,
        },
        faceDivine: {
          neckRadius: -0.00119,
          pelvisHalfWidth: -0.00048,
          dhotiRadius: -0.00049,
          bellyCenterZ: 0.00052,
          bellyRadiusX: -0.00048,
          bellyRadiusZ: -0.00031,
          chestCenterZ: 0.00021,
          chestRadiusX: -0.00063,
          chestRadiusZ: -0.00063,
        },
        bodyAscetic: {
          neckRadius: -0.00057,
          pelvisHalfWidth: -0.00166,
          dhotiRadius: -0.00682,
          bellyCenterZ: -0.0071,
          bellyRadiusX: -0.00166,
          bellyRadiusZ: -0.00386,
          chestCenterZ: -0.00161,
          chestRadiusX: -0.00094,
          chestRadiusZ: -0.00326,
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
