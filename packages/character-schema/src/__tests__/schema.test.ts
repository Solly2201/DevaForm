import { describe, expect, it } from "vitest";
import {
  ConfigurationParseError,
  MATERIAL_PALETTES,
  SCHEMA_VERSION,
  SKELETON,
  SOCKETS,
  activeArmSlots,
  createDefaultGaneshaConfiguration,
  deserializeConfiguration,
  getJoint,
  getPosePreset,
  isJointId,
  materialsConfigurationSchema,
  POSE_PRESETS,
  serializeConfiguration,
} from "../index";

describe("skeleton", () => {
  it("declares parents before children", () => {
    const seen = new Set<string>();
    for (const joint of SKELETON) {
      if (joint.parent !== null) {
        expect(seen.has(joint.parent), `${joint.id} parent ${joint.parent}`).toBe(true);
      }
      seen.add(joint.id);
    }
  });

  it("has unique joint ids", () => {
    expect(new Set(SKELETON.map((j) => j.id)).size).toBe(SKELETON.length);
  });

  it("includes four arm chains and the trunk chain", () => {
    for (const slot of ["frontLeft", "frontRight", "backLeft", "backRight"]) {
      expect(getJoint(`arm.${slot}.hand` as never).parent).toBe(`arm.${slot}.forearm`);
    }
    expect(getJoint("trunkTip").parent).toBe("trunkMid");
    expect(getJoint("trunkMid").parent).toBe("trunkBase");
  });
});

describe("sockets", () => {
  it("only reference existing joints", () => {
    for (const socket of SOCKETS) {
      expect(isJointId(socket.joint), `${socket.id} -> ${socket.joint}`).toBe(true);
    }
  });

  it("has unique socket ids", () => {
    expect(new Set(SOCKETS.map((s) => s.id)).size).toBe(SOCKETS.length);
  });
});

describe("pose presets", () => {
  it("only pose known joints", () => {
    for (const preset of POSE_PRESETS) {
      for (const jointId of Object.keys(preset.joints)) {
        expect(isJointId(jointId), `${preset.id}: ${jointId}`).toBe(true);
      }
    }
  });

  it("resolves by id", () => {
    expect(getPosePreset("blessing")?.label).toBe("Blessing");
    expect(getPosePreset("nope")).toBeUndefined();
  });
});

describe("arms", () => {
  it("activates the front pair for two-arm forms and all four otherwise", () => {
    expect(activeArmSlots({ count: 2 })).toEqual(["frontLeft", "frontRight"]);
    expect(activeArmSlots({ count: 4 })).toHaveLength(4);
  });
});

describe("material palettes", () => {
  it("every palette is a complete, valid materials configuration", () => {
    for (const palette of MATERIAL_PALETTES) {
      const result = materialsConfigurationSchema.safeParse(palette.materials);
      expect(result.success, palette.id).toBe(true);
    }
  });

  it("has unique palette ids", () => {
    expect(new Set(MATERIAL_PALETTES.map((p) => p.id)).size).toBe(MATERIAL_PALETTES.length);
  });
});

describe("commerce constants", () => {
  it("statue sizes and materials have unique ids", async () => {
    const { STATUE_SIZES, MANUFACTURING_MATERIALS } = await import("../commerce");
    expect(new Set(STATUE_SIZES.map((s) => s.id)).size).toBe(STATUE_SIZES.length);
    expect(new Set(MANUFACTURING_MATERIALS.map((m) => m.id)).size).toBe(
      MANUFACTURING_MATERIALS.length,
    );
  });
});

describe("configuration serialization", () => {
  it("round-trips the default configuration deterministically", () => {
    const config = createDefaultGaneshaConfiguration();
    const json = serializeConfiguration(config);
    const restored = deserializeConfiguration(json);
    expect(restored).toEqual(config);
    // Deterministic: same object serializes identically.
    expect(serializeConfiguration(restored)).toBe(json);
  });

  it("validates the default configuration against the current schema version", () => {
    expect(createDefaultGaneshaConfiguration().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("rejects malformed JSON", () => {
    expect(() => deserializeConfiguration("not json")).toThrow(ConfigurationParseError);
  });

  it("rejects configs newer than the supported schema", () => {
    const config = { ...createDefaultGaneshaConfiguration(), schemaVersion: 999 };
    expect(() => deserializeConfiguration(JSON.stringify(config))).toThrow(
      /newer than supported/,
    );
  });

  it("rejects unknown joint overrides", () => {
    const config = createDefaultGaneshaConfiguration();
    const tampered = {
      ...config,
      pose: { preset: null, jointOverrides: { "arm.fifth.hand": [0, 0, 0] } },
    };
    expect(() => deserializeConfiguration(JSON.stringify(tampered))).toThrow(
      ConfigurationParseError,
    );
  });

  it("round-trips grip mudras (pinch/grip) in hand configuration", () => {
    const config = createDefaultGaneshaConfiguration();
    const custom = {
      ...config,
      hands: { ...config.hands, backLeft: { mudra: "pinch" as const }, backRight: { mudra: "grip" as const } },
    };
    const restored = deserializeConfiguration(JSON.stringify(custom));
    expect(restored.hands.backLeft.mudra).toBe("pinch");
    expect(restored.hands.backRight.mudra).toBe("grip");
  });

  it("fills hands/arms defaults for configurations saved before those fields", () => {
    const config = createDefaultGaneshaConfiguration();
    const legacy: Record<string, unknown> = { ...config };
    delete legacy.hands;
    delete legacy.arms;
    const restored = deserializeConfiguration(JSON.stringify(legacy));
    expect(restored.arms.count).toBe(4);
    expect(restored.hands.frontLeft.mudra).toBe("open");
  });

  it("rejects invalid material colors", () => {
    const config = createDefaultGaneshaConfiguration();
    const tampered = {
      ...config,
      materials: { ...config.materials, skin: { color: "red", finish: "satin" } },
    };
    expect(() => deserializeConfiguration(JSON.stringify(tampered))).toThrow(
      ConfigurationParseError,
    );
  });
});
