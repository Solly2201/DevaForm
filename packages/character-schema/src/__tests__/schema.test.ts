import { describe, expect, it } from "vitest";
import {
  ConfigurationParseError,
  SCHEMA_VERSION,
  SKELETON,
  SOCKETS,
  createDefaultGaneshaConfiguration,
  deserializeConfiguration,
  getJoint,
  getPosePreset,
  isJointId,
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
