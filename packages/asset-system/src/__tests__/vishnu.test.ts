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
 * Nothing here renders him — the Studio does that. His attribute and
 * crown sculpts are first-pass and staged as such; what this file pins
 * is the architecture they hang from. See docs/vishnu-direction.md.
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
  it("is offered, on the four-armed body, and stays out of other pickers", () => {
    const deity = getDeity("vishnu");
    expect(deity, "the deity exists").toBeDefined();
    expect(deity!.available, "and is offered").toBe(true);
    expect(getAvailableDeity("vishnu")).toBeDefined();
    // His assets never leak into another deity's pickers.
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
        expect(presentation.grip?.axis, `${id}/${presentation.id} declares an axis`).toBeDefined();
        expect(presentation.hand, `${id}/${presentation.id} names a hold`).not.toBe("none");
        // A held thing says HOW it is held: how thick it is where a hand
        // closes on it, or — when no hand closes on it at all — which of
        // the body's baked hand states presents it.
        const named = presentation.grip?.closure && presentation.grip.closure !== "wrap";
        if (named) {
          expect(
            presentation.grip?.radius,
            `${id}/${presentation.id} is presented by a hand state, not a thickness`,
          ).toBeUndefined();
        } else {
          expect(
            presentation.grip?.radius,
            `${id}/${presentation.id} declares a radius`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("does not ask a hand to close on a discus, or pretend one is thin", () => {
    // A fist round the rim of a blade is the one grip that cannot be made
    // honest. The chakra used to claim a six-millimetre radius so the
    // closure would shut on "a finger", which produced a fist closed on
    // nothing beside a floating wheel: the lie was about the OBJECT, and
    // it showed. It names the hand state instead.
    const chakra = getAsset("vishnu.attribute.chakra")!;
    for (const presentation of chakra.presentations ?? []) {
      expect(presentation.hand).not.toBe("grip");
      expect(presentation.grip?.closure).toBe("poise");
      expect(presentation.grip?.radius).toBeUndefined();
    }
  });

  it("gives every attribute a hand on the body built to have four", () => {
    const resolved = resolveCharacterPresentation(vishnu("humanoid.body.human4", "vishnu.regal"));
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
        vishnu("humanoid.body.human4", preset.id),
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

describe("the body that has four arms", () => {
  const BODY = "humanoid.body.human4";

  it("is a real body with a real second pair", () => {
    const body = getAsset(BODY);
    expect(body, "the four-armed body is registered").toBeDefined();
    expect(body!.skeleton).toBe("human4");
    // The same measurements the two-armed body ships — it IS that body —
    // so every ornament, garment and grip fitted to one fits the other.
    const human = getAsset("humanoid.body.human")!;
    expect(body!.bodyProfile).toEqual(human.bodyProfile);
    expect(body!.gripShapes).toEqual(human.gripShapes);
    // Every SHAPE morph is shared — it is that body. The hand closures
    // are not: this one has four hands, and each needs its own, or the
    // back pair holds its attributes in an open rest palm whatever it is
    // given. One target used to close both left hands.
    const shapes = (asset: { morphTargets?: readonly string[] }) =>
      (asset.morphTargets ?? []).filter((name) => !/(Front|Back)(Left|Right)$/.test(name));
    expect(shapes(body!)).toEqual(shapes(human));
    for (const slot of ["frontLeft", "frontRight", "backLeft", "backRight"]) {
      const suffix = slot[0]!.toUpperCase() + slot.slice(1);
      for (const shape of ["grip", "cradle", "poise"]) {
        expect(body!.morphTargets, `${shape}${suffix}`).toContain(`${shape}${suffix}`);
      }
    }
    // And it is bigger, because it has two more arms in it.
    expect(body!.geometry!.triangles ?? 0).toBeGreaterThan(human.geometry!.triangles ?? 0);
  });

  it("closes four hands, not two", () => {
    const body = getAsset(BODY)!;
    for (const slot of ["frontLeft", "frontRight", "backLeft", "backRight"]) {
      expect(body.gripSeats?.[slot], `${slot} has a measured grip seat`).toBeDefined();
      expect(body.gripAxes?.[slot], `${slot} has a measured grip axis`).toBeDefined();
    }
  });

  it("is offered to Vishnu and to nobody else", () => {
    const body = getAsset(BODY)!;
    expect(body.deityCompatibility).toEqual(["vishnu"]);
    for (const other of ["ganesha", "shiva"] as const) {
      expect(listAssets({ deity: other }).map((asset) => asset.id)).not.toContain(BODY);
    }
  });

  it("ships a default that resolves the whole iconography", () => {
    // Four attributes in four hands, a crown, a garland, a dhoti — the
    // configuration a customer opens the Studio to.
    const deity = getDeity("vishnu")!;
    expect(deity.available).toBe(true);
    const build = deity.available ? deity.createDefaultConfiguration : undefined;
    expect(build, "the configuration he ships with exists").toBeDefined();
    const resolved = resolveCharacterPresentation(build!());
    expect(resolved.armSlots).toHaveLength(4);
    const held = resolved.attachments.filter((a) => a.handSlot);
    expect(held).toHaveLength(4);
    expect(new Set(held.map((a) => a.handSlot)).size).toBe(4);
  });
});
