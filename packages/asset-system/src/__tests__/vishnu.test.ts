/**
 * Vishnu, as a test of the architecture rather than of Vishnu.
 *
 * He is the first deity added since the engine stopped being Ganesha's
 * engine with a second character in it. If describing a god — his
 * attributes, how each may be held, which hands exist, which poses he
 * stands in — is enough for the existing resolver to place everything
 * correctly and refuse what cannot work, then the foundation is reusable.
 * If it needed a line of Vishnu-specific engine code, it is not.
 *
 * Nothing here renders him. He is not offered and has no body of
 * production quality; see docs/vishnu-direction.md.
 */
import { describe, expect, it } from "vitest";
import {
  VISHNU_POSE_PRESETS,
  type CharacterConfiguration,
  type SocketId,
} from "@devaform/character-schema";
import { getAvailableDeity, getDeity } from "../deities";
import { getAsset, listAssets } from "../registry";
import { resolveCharacterPresentation, customerFacingIssues } from "../resolve";
import { isHandheld } from "../presentation";

const ATTRIBUTES = [
  "vishnu.attribute.gada",
  "vishnu.attribute.chakra",
  "vishnu.attribute.shankha",
  "vishnu.attribute.padma",
] as const;

const HANDS: readonly SocketId[] = [
  "arm.frontRight.hand.item",
  "arm.frontLeft.hand.item",
  "arm.backRight.hand.item",
  "arm.backLeft.hand.item",
];

/** A Vishnu configuration on a given body, with an attribute in each hand. */
function vishnu(bodyId: string, preset: string): CharacterConfiguration {
  return {
    schemaVersion: 1,
    deity: "vishnu",
    arms: { count: 4 },
    parts: {
      body: { assetId: bodyId, version: 1 },
      head: null,
      eyes: null,
      ears: null,
      trunk: null,
      tusks: null,
      hair: null,
      hands: null,
      lowerGarment: { assetId: "vishnu.garment.dhoti", version: 1 },
      upperGarment: null,
      earrings: null,
      armlets: null,
      bracelets: null,
      anklets: null,
    },
    attachments: [
      { socket: "head.crown", asset: { assetId: "vishnu.crown.kirita", version: 1 } },
      { socket: "chest.mala", asset: { assetId: "vishnu.garland.vaijayanti", version: 1 } },
      ...ATTRIBUTES.map((assetId, index) => ({
        socket: HANDS[index]!,
        asset: { assetId, version: 1 },
      })),
    ],
    pose: { preset, jointOverrides: {} },
    hands: {
      frontLeft: { mudra: "open" },
      frontRight: { mudra: "open" },
      backLeft: { mudra: "open" },
      backRight: { mudra: "open" },
    },
    morphs: {},
    proportions: { height: 1, bulk: 1 },
    materials: {
      skin: { color: "#6f8fd0", finish: "satin" },
      skinSecondary: { color: "#5d7cbb", finish: "satin" },
      hair: { color: "#3b2a1e", finish: "matte" },
      garment: { color: "#e8b53c", finish: "satin" },
      garmentAccent: { color: "#b3352f", finish: "satin" },
      metal: { color: "#d8a637", finish: "polished" },
      base: { color: "#c9bda6", finish: "matte" },
    },
    base: { style: "lotus" },
  } as CharacterConfiguration;
}

describe("Vishnu is prepared, and prepared means described", () => {
  it("is registered but not offered", () => {
    const deity = getDeity("vishnu");
    expect(deity, "the deity exists").toBeDefined();
    expect(deity!.available, "and is not offered").toBe(false);
    expect(getAvailableDeity("vishnu")).toBeUndefined();
    // His assets are in the registry — so they are validated — and out of
    // every other deity's pickers.
    for (const other of ["ganesha", "shiva"] as const) {
      const offered = listAssets({ deity: other }).map((asset) => asset.id);
      expect(offered.filter((id) => id.startsWith("vishnu."))).toEqual([]);
    }
  });

  it("describes how each of the four attributes can be held", () => {
    for (const id of ATTRIBUTES) {
      const asset = getAsset(id);
      expect(asset, id).toBeDefined();
      const presentations = asset!.presentations ?? [];
      expect(presentations.length, `${id} declares how it is held`).toBeGreaterThan(0);
      for (const presentation of presentations) {
        if (!isHandheld(presentation)) continue;
        expect(presentation.grip?.radius, `${id}/${presentation.id} declares a radius`).toBeGreaterThan(0);
        expect(presentation.grip?.axis, `${id}/${presentation.id} declares an axis`).toBeDefined();
        expect(presentation.hand, `${id}/${presentation.id} names a hold`).not.toBe("none");
      }
    }
  });

  it("does not ask a hand to close on a discus", () => {
    // A fist round the rim of a blade is the one grip that cannot be
    // made honest, so the chakra is poised rather than gripped and its
    // declared radius is a finger's, not the disc's.
    const chakra = getAsset("vishnu.attribute.chakra")!;
    for (const presentation of chakra.presentations ?? []) {
      expect(presentation.hand).not.toBe("grip");
      expect(presentation.grip?.radius).toBeLessThan(0.01);
    }
  });

  it("gives every attribute a hand on a body that has four", () => {
    // The stylised body is deprecated and kept resolvable; what matters
    // here is that its skeleton HAS four arms, which is the anatomy the
    // iconography asks for.
    const resolved = resolveCharacterPresentation(vishnu("shiva.body.classic", "vishnu.regal"));
    expect(resolved.armSlots).toHaveLength(4);
    const held = resolved.attachments.filter((a) => a.handSlot);
    expect(held.map((a) => a.asset.id).sort()).toEqual([...ATTRIBUTES].sort());
    // Every hand holds exactly one thing.
    expect(new Set(held.map((a) => a.handSlot)).size).toBe(4);
  });

  it("refuses the back pair on a body that has two, and says why", () => {
    const resolved = resolveCharacterPresentation(vishnu("humanoid.body.human", "vishnu.regal"));
    expect(resolved.armSlots).toEqual(["frontLeft", "frontRight"]);
    for (const attachment of resolved.attachments) {
      if (!attachment.handSlot) continue;
      expect(resolved.skeleton.armSlots).toContain(attachment.handSlot);
    }
    const issues = customerFacingIssues(resolved);
    expect(issues.length, "the customer is told").toBeGreaterThan(0);
  });

  it("never leaves a blessing hand holding something", () => {
    for (const preset of VISHNU_POSE_PRESETS) {
      const resolved = resolveCharacterPresentation(
        vishnu("shiva.body.classic", preset.id),
      );
      for (const attachment of resolved.attachments) {
        if (!attachment.handSlot) continue;
        const mudra = resolved.hands[attachment.handSlot].mudra;
        expect(
          ["grip", "pinch", "hold"],
          `${preset.id}: the ${attachment.handSlot} hand holds ${attachment.asset.id} while doing ${mudra}`,
        ).toContain(mudra);
      }
    }
  });
});
