/**
 * Stage-1 regressions: the human base asset and measured body fitting.
 *
 * Two things are under test. First the shipped artifact itself — the GLB is
 * inspected as a file, so a broken or stale rebuild fails here rather than
 * in a browser. Second the generic capability it needed from the engine: a
 * body asset that carries measurements of its own surfaces, which the
 * fitting code uses in place of formulas it cannot apply to a mesh.
 *
 * Nothing here knows which deity will wear this body — that is Stage 2+.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// The rig's GLB path must stay in its "loading" state: these tests are
// about metadata and fitting, not about geometry the loader cannot fetch
// in Node.
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {}
  },
}));

import {
  HUMANOID_SKELETON,
  HUMAN_SKELETON,
  createDefaultGaneshaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { getAsset, listAssets } from "@devaform/asset-system";
import { deriveBodyProfile } from "../generators";
import { ZoneMaterials } from "../materials";
import { buildRig } from "../rig";
import { boneNameToJointId, socketNameToSocketId } from "../skinning";

const ASSET_ID = "humanoid.body.human";
const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");
const NEUTRAL_PROPORTIONS = { height: 1, bulk: 1 };

const asset = getAsset(ASSET_ID);

/** Minimal GLB reader: the JSON chunk of a binary glTF. */
function readGlbJson(path: string): {
  nodes?: Array<{ name?: string; children?: number[] }>;
  skins?: Array<{ joints: number[] }>;
  meshes?: Array<{
    primitives: Array<{ targets?: unknown[]; attributes: Record<string, number> }>;
    extras?: { targetNames?: string[] };
  }>;
} {
  const buffer = readFileSync(path);
  expect(buffer.toString("utf8", 0, 4)).toBe("glTF");
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.toString("utf8", 16, 20)).toBe("JSON");
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
}

describe("human base asset", () => {
  it("is registered as a mesh body that no deity is offered yet", () => {
    expect(asset).toBeDefined();
    expect(asset!.kind).toEqual({ type: "part", slot: "body" });
    expect(asset!.source.kind).toBe("glb");
    // Registry-resolvable (saved configurations referencing it still load)
    // but absent from every deity's picker until it wins its QA.
    expect(asset!.deityCompatibility).toEqual([]);
    for (const deity of ["ganesha", "shiva"] as const) {
      expect(listAssets({ deity, slot: "body" }).map((a) => a.id)).not.toContain(ASSET_ID);
    }
  });

  it("ships a GLB whose skin, bones and sockets speak the engine's vocabulary", () => {
    const source = asset!.source;
    if (source.kind !== "glb") throw new Error("expected a GLB source");
    const gltf = readGlbJson(join(PUBLIC_DIR, source.path));

    const nodeNames = (gltf.nodes ?? []).map((n) => n.name ?? "");
    const bones = nodeNames
      .map((name) => boneNameToJointId(name))
      .filter((id): id is NonNullable<typeof id> => id !== null);
    // A human has two arms. The skeleton carries four (multi-armed deities
    // are its whole point), so this mesh rigs every joint except the back
    // pair — extra arms are their own asset, not a deformation of this one.
    const expectedBones = HUMAN_SKELETON.joints
      .map((j) => j.id)
      .filter((id) => !id.startsWith("arm.back"));
    expect([...bones].sort()).toEqual([...expectedBones].sort());

    // Socket empties are read exactly the way the rig reads them.
    const socketNames = nodeNames
      .map((name) => name.match(/^SOCKET_(.+)$/)?.[1])
      .filter((name): name is string => name !== undefined);
    expect(socketNames.length).toBeGreaterThan(0);
    const socketIds = new Set(HUMAN_SKELETON.sockets.map((s) => s.id));
    for (const name of socketNames) {
      const id = socketNameToSocketId(name);
      expect(id, `socket empty "${name}" does not name a socket`).not.toBeNull();
      expect(socketIds.has(id!)).toBe(true);
    }

    // One skinned mesh, one topology, the declared morph targets on it.
    expect(gltf.skins?.length).toBe(1);
    expect(gltf.skins![0]!.joints.length).toBe(expectedBones.length);
    const primitive = gltf.meshes![0]!.primitives[0]!;
    expect(primitive.targets?.length).toBe(asset!.morphTargets!.length);
    expect(gltf.meshes![0]!.extras?.targetNames).toEqual([...asset!.morphTargets!]);
  });

  it("keeps the human skeleton pose-compatible with the stylised one", () => {
    // Same joint ids, same parents: every pose preset, mudra and gesture
    // written for the stylised rig applies unchanged. Only the anatomy
    // (where those joints sit) is the human one.
    const asHierarchy = (skeleton: typeof HUMAN_SKELETON) =>
      skeleton.joints.map((j) => `${j.id}<-${j.parent ?? "root"}`);
    expect(asHierarchy(HUMAN_SKELETON)).toEqual(asHierarchy(HUMANOID_SKELETON));
    const moved = HUMAN_SKELETON.joints.filter((joint, i) => {
      const other = HUMANOID_SKELETON.joints[i]!;
      return joint.position.some((v, axis) => Math.abs(v - other.position[axis]!) > 1e-6);
    });
    expect(moved.length).toBeGreaterThan(0);
  });
});

describe("measured body profile", () => {
  const profile = asset!.bodyProfile!;

  it("is shipped with the body and describes a plausible adult male", () => {
    expect(profile).toBeDefined();
    const base = profile.base;
    // Canonical body is 1.0 m tall, so these read as fractions of height.
    expect(base.neckRadius).toBeGreaterThan(0.02);
    expect(base.neckRadius).toBeLessThan(0.05);
    // Shoulders wider than hips, hips wider than the neck; a skirt has to
    // clear the legs, so it wraps wider than the hips themselves.
    expect(base.chestRadiusX).toBeGreaterThan(base.pelvisHalfWidth);
    expect(base.pelvisHalfWidth).toBeGreaterThan(base.neckRadius);
    expect(base.dhotiRadius).toBeGreaterThan(base.pelvisHalfWidth);
    // The two torso volumes are distinct: the ribcage is deeper than the
    // waist, and sits above it.
    expect(base.chestRadiusZ).toBeGreaterThan(base.bellyRadiusZ);
    expect(base.spineToChestY).toBeGreaterThan(0.05);
  });

  it("uses the measurements verbatim when no morph is applied", () => {
    const derived = deriveBodyProfile({}, NEUTRAL_PROPORTIONS, { profile, morphs: {} });
    expect(derived.neckRadius).toBeCloseTo(profile.base.neckRadius, 6);
    expect(derived.pelvisHalfWidth).toBeCloseTo(profile.base.pelvisHalfWidth, 6);
    expect(derived.dhotiRadius).toBeCloseTo(profile.base.dhotiRadius, 6);
    expect(derived.chestRadiusX).toBeCloseTo(profile.base.chestRadiusX, 6);
  });

  it("thickens with the powerful morph and thins with the lean one", () => {
    const at = (morphs: Record<string, number>) =>
      deriveBodyProfile({}, NEUTRAL_PROPORTIONS, { profile, morphs });
    const neutral = at({});
    const powerful = at({ bodyPowerful: 1 });
    const lean = at({ bodyLean: 1 });
    expect(powerful.neckRadius).toBeGreaterThan(neutral.neckRadius);
    expect(powerful.pelvisHalfWidth).toBeGreaterThan(neutral.pelvisHalfWidth);
    expect(powerful.dhotiRadius).toBeGreaterThan(neutral.dhotiRadius);
    expect(lean.neckRadius).toBeLessThan(neutral.neckRadius);
    expect(lean.pelvisHalfWidth).toBeLessThan(neutral.pelvisHalfWidth);
    // Influences are continuous, not switches.
    const half = at({ bodyPowerful: 0.5 });
    expect(half.neckRadius).toBeCloseTo((neutral.neckRadius + powerful.neckRadius) / 2, 9);
  });

  it("separates build from morphology", () => {
    const at = (morphs: Record<string, number>) =>
      deriveBodyProfile({}, NEUTRAL_PROPORTIONS, { profile, morphs });
    const neutral = at({});
    const taper = (p: { chestRadiusX: number; pelvisHalfWidth: number }) =>
      p.chestRadiusX / p.pelvisHalfWidth;

    // Heroic is a silhouette, not bulk: the shoulders take width and the
    // hips give it back, so the V-taper rises.
    const heroic = at({ bodyHeroic: 1 });
    expect(heroic.chestRadiusX).toBeGreaterThan(neutral.chestRadiusX);
    expect(heroic.pelvisHalfWidth).toBeLessThan(neutral.pelvisHalfWidth);
    expect(taper(heroic)).toBeGreaterThan(taper(neutral));

    // Powerful is bulk, not silhouette: everything grows, so the taper
    // does not improve the way the heroic target's does.
    const powerful = at({ bodyPowerful: 1 });
    expect(powerful.pelvisHalfWidth).toBeGreaterThan(neutral.pelvisHalfWidth);
    expect(taper(powerful)).toBeLessThan(taper(heroic));

    // The ascetic loses depth and volume without losing the frame.
    const ascetic = at({ bodyAscetic: 1 });
    expect(ascetic.chestRadiusZ).toBeLessThan(neutral.chestRadiusZ);
    expect(ascetic.dhotiRadius).toBeLessThan(neutral.dhotiRadius);

    // They compose rather than cancel: a heroic ascetic keeps the frame
    // and the taper, but carries less depth than the heroic build alone.
    const both = at({ bodyHeroic: 1, bodyAscetic: 1 });
    expect(taper(both)).toBeGreaterThan(taper(neutral));
    expect(both.chestRadiusZ).toBeLessThan(heroic.chestRadiusZ);
    expect(both.dhotiRadius).toBeLessThan(heroic.dhotiRadius);
  });

  it("ignores bulk, which cannot deform a mesh body", () => {
    const slim = deriveBodyProfile({}, { height: 1, bulk: 0.8 }, { profile, morphs: {} });
    const wide = deriveBodyProfile({}, { height: 1, bulk: 1.3 }, { profile, morphs: {} });
    expect(slim.pelvisHalfWidth).toBe(wide.pelvisHalfWidth);
    expect(slim.dhotiRadius).toBe(wide.dhotiRadius);
  });

  it("uses this body's own spine-to-chest gap when combining torso surfaces", () => {
    const derived = deriveBodyProfile({}, NEUTRAL_PROPORTIONS, { profile, morphs: {} });
    // At the belly's own height the combined torso surface must reach the
    // belly, which only happens if the belly volume was lifted into chest
    // space by the right amount.
    const chestLocalY = profile.base.bellyCenterY - profile.base.spineToChestY;
    expect(derived.torsoSurfaceZAt(0, chestLocalY)).toBeCloseTo(
      profile.base.bellyCenterZ + profile.base.bellyRadiusZ,
      6,
    );
    expect(derived.torsoBackZAt(0, chestLocalY)).toBeLessThan(derived.torsoSurfaceZAt(0, chestLocalY));
  });
});

describe("body fitting selects its source from asset data", () => {
  const withBody = (assetId: string): CharacterConfiguration => {
    const config = createDefaultGaneshaConfiguration();
    return { ...config, parts: { ...config.parts, body: { assetId, version: 1 } } };
  };

  it("fits to the measurements when the body ships them", () => {
    const materials = new ZoneMaterials();
    const rig = buildRig(withBody(ASSET_ID), materials);
    expect(rig.body.neckRadius).toBeCloseTo(asset!.bodyProfile!.base.neckRadius, 6);
    materials.dispose();
  });

  it("leaves procedural bodies on their derived profile", () => {
    const materials = new ZoneMaterials();
    const config = createDefaultGaneshaConfiguration();
    const rig = buildRig(config, materials);
    const bodyAsset = getAsset(config.parts.body!.assetId)!;
    const params = bodyAsset.source.kind === "procedural" ? (bodyAsset.source.params ?? {}) : {};
    const expected = deriveBodyProfile(params, config.proportions);
    expect(bodyAsset.bodyProfile).toBeUndefined();
    expect(rig.body.neckRadius).toBeCloseTo(expected.neckRadius, 9);
    expect(rig.body.dhotiRadius).toBeCloseTo(expected.dhotiRadius, 9);
    expect(rig.body.bellyRadiusX).toBeCloseTo(expected.bellyRadiusX, 9);
    materials.dispose();
  });

  it("keeps the authoring tool out of the runtime", () => {
    // MakeHuman is an authoring foundation: it may appear in provenance
    // metadata and in tools/, never in code that ships to the browser.
    const engineDir = join(__dirname, "..");
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "__tests__") scan(path);
        else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
          if (/makehuman/i.test(readFileSync(path, "utf8"))) offenders.push(entry.name);
        }
      }
    };
    scan(engineDir);
    expect(offenders).toEqual([]);
  });
});
