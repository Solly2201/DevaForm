/**
 * Every registered asset must agree with the anatomy it will run on.
 *
 * The point of these tests is that an unsupported combination FAILS rather
 * than falling back. Before them, a body could declare a thumb axis for an
 * arm it did not have, or a grip morph for a hand that was never built,
 * and the engine would find nothing at runtime and carry on regardless.
 */
import { describe, expect, it } from "vitest";
import {
  GANESHA_SKELETON,
  HUMANOID_SKELETON,
  HUMAN_SKELETON,
} from "@devaform/character-schema";
import { validateRegistryConformance, validateSkeletonConformance } from "../conformance";
import { getAsset, listAssets } from "../registry";
import type { AssetDefinition } from "../types";

const ALL = listAssets({ includeDeprecated: true });

const report = (issues: ReturnType<typeof validateRegistryConformance>) =>
  issues.map((i) => `${i.severity}: ${i.assetId} ${i.message}`).join("\n");

describe("registry conformance", () => {
  it("every registered asset conforms to the anatomy it runs on", () => {
    const issues = validateRegistryConformance(ALL).filter((i) => i.severity === "error");
    expect(report(issues), "conformance errors").toBe("");
  });

  it("names only skeletons that exist", () => {
    for (const asset of ALL) {
      if (asset.skeleton === undefined) continue;
      const issues = validateRegistryConformance([asset]);
      expect(
        issues.some((i) => i.message.includes("does not exist")),
        `${asset.id} -> ${asset.skeleton}`,
      ).toBe(false);
    }
  });

  it("the human body declares the anatomy it actually has", () => {
    const human = getAsset("humanoid.body.human")!;
    expect(human.skeleton).toBe("human");
    // Two hands measured, two hands gripped — no claim about a third.
    expect(Object.keys(human.gripAxes ?? {}).sort()).toEqual(["frontLeft", "frontRight"]);
    const gripMorphs = (human.morphTargets ?? []).filter((m) => m.startsWith("grip"));
    expect(gripMorphs.sort()).toEqual(["gripFrontLeft", "gripFrontRight"]);
    expect(validateSkeletonConformance(human, HUMAN_SKELETON)).toEqual([]);
  });
});

describe("conformance catches what it is for", () => {
  const body = (over: Partial<AssetDefinition>): AssetDefinition =>
    ({
      id: "test.body",
      version: 1,
      name: "test",
      kind: { type: "part", slot: "body" },
      deityCompatibility: [],
      stage: "experimental",
      source: { kind: "glb", path: "/nowhere.glb" },
      materialZones: [],
      printability: { printSourceAvailable: false },
      category: "body",
      ...over,
    }) as AssetDefinition;

  it("rejects a thumb axis for an arm the skeleton does not have", () => {
    const issues = validateSkeletonConformance(
      body({ gripAxes: { frontLeft: [1, 0, 0], frontRight: [-1, 0, 0], backLeft: [1, 0, 0] } }),
      HUMAN_SKELETON,
    );
    expect(issues.map((i) => i.message)).toContainEqual(
      expect.stringContaining("thumb axis for backLeft"),
    );
  });

  it("rejects a grip morph for a hand that was never built", () => {
    const issues = validateSkeletonConformance(
      body({
        morphTargets: ["gripBackRight"],
        gripAxes: { frontLeft: [1, 0, 0], frontRight: [-1, 0, 0] },
      }),
      HUMAN_SKELETON,
    );
    expect(issues.filter((i) => i.severity === "error").map((i) => i.message)).toContainEqual(
      expect.stringContaining("no backRight arm"),
    );
  });

  it("notices a body that measured one hand and forgot the other", () => {
    const issues = validateSkeletonConformance(
      body({ gripAxes: { frontLeft: [1, 0, 0] } }),
      HUMAN_SKELETON,
    );
    expect(issues.map((i) => i.message)).toContainEqual(
      expect.stringContaining("frontRight"),
    );
  });

  it("warns when a modelled hand has no measured thumb axis to turn on", () => {
    const issues = validateSkeletonConformance(
      body({ morphTargets: ["gripFrontLeft", "gripFrontRight"] }),
      HUMAN_SKELETON,
    );
    expect(issues.filter((i) => i.severity === "warning")).toHaveLength(2);
  });

  it("rejects an attachment that can reach no socket on the skeleton", () => {
    const trunkOnly = {
      ...body({}),
      id: "test.trunk.item",
      kind: { type: "attachment", sockets: ["trunk.tip"] },
    } as AssetDefinition;
    // Fine on Ganesha, who has a trunk...
    expect(validateSkeletonConformance(trunkOnly, GANESHA_SKELETON)).toEqual([]);
    // ...and an error on anyone who does not.
    expect(
      validateSkeletonConformance(trunkOnly, HUMANOID_SKELETON).map((i) => i.message),
    ).toContainEqual(expect.stringContaining("none of which"));
  });

  it("rejects a non-body claiming to define anatomy", () => {
    const issues = validateRegistryConformance([
      {
        ...body({}),
        id: "test.hair",
        kind: { type: "part", slot: "hair" },
        skeleton: "human",
      } as AssetDefinition,
    ]);
    expect(issues.map((i) => i.message)).toContainEqual(
      expect.stringContaining("only a body defines anatomy"),
    );
  });

  it("rejects an unknown skeleton id outright", () => {
    const issues = validateRegistryConformance([body({ skeleton: "imaginary" })]);
    expect(issues[0]?.message).toContain("does not exist");
  });
});
