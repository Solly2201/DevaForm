/**
 * The resolver, held to the one thing it exists for: given a
 * configuration, there is exactly ONE answer about what each hand is
 * doing and where every attribute goes, and it is reached from data.
 *
 * The matrix at the bottom is the point. Every supported pose is crossed
 * with every attribute, and each cell asserts something a viewer would
 * notice — not that the transform is valid, but that the relationship is
 * one a person could have with the object.
 */
import { describe, expect, it } from "vitest";
import {
  ARM_SLOTS,
  SHIVA_POSE_PRESETS,
  POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  isGestureMudra,
  type ArmSlot,
  type CharacterConfiguration,
  type SocketId,
} from "@devaform/character-schema";
import { GROUND_SOCKET, resolveCharacterPresentation } from "../resolve";
import { isHandheld } from "../presentation";
import { getAsset } from "../registry";

const withPose = (config: CharacterConfiguration, preset: string | null): CharacterConfiguration => ({
  ...config,
  pose: { preset, jointOverrides: {} },
});

const attachmentFor = (
  resolved: ReturnType<typeof resolveCharacterPresentation>,
  assetId: string,
) => resolved.attachments.find((a) => a.asset.id === assetId);

describe("resolution is deterministic", () => {
  it("gives the same answer twice", () => {
    const config = createDefaultShivaConfiguration();
    const a = resolveCharacterPresentation(config);
    const b = resolveCharacterPresentation(config);
    expect(JSON.stringify(a.attachments.map((x) => [x.asset.id, x.socket, x.presentation.id]))).toBe(
      JSON.stringify(b.attachments.map((x) => [x.asset.id, x.socket, x.presentation.id])),
    );
    expect(a.hands).toEqual(b.hands);
    expect(a.issues).toEqual(b.issues);
  });
});

describe("anatomy cannot be exceeded", () => {
  it("never renders an arm the skeleton does not have", () => {
    const config = createDefaultShivaConfiguration();
    const resolved = resolveCharacterPresentation({ ...config, arms: { count: 4 } });
    for (const slot of resolved.armSlots) {
      expect(resolved.skeleton.armSlots).toContain(slot);
    }
  });

  it("rejects an attribute on a hand this body does not have, and says so", () => {
    const config = createDefaultShivaConfiguration();
    // Shiva's default skeleton HAS four arms; the human mesh has two.
    const human = {
      ...config,
      arms: { count: 4 as const },
      parts: { ...config.parts, body: { assetId: "humanoid.body.human", version: 1 } },
      attachments: [
        ...config.attachments,
        {
          socket: "arm.backRight.hand.item" as SocketId,
          asset: { assetId: "shiva.attribute.damaru", version: 1 },
        },
      ],
    };
    const resolved = resolveCharacterPresentation(human);
    expect(resolved.skeleton.armSlots).toEqual(["frontLeft", "frontRight"]);
    expect(attachmentFor(resolved, "shiva.attribute.damaru")?.socket).not.toBe(
      "arm.backRight.hand.item",
    );
    expect(resolved.issues.some((i) => i.message.includes("does not have"))).toBe(true);
  });
});

describe("a gesture hand holds nothing", () => {
  it("stands the trishul instead of carrying it into a blessing", () => {
    const resolved = resolveCharacterPresentation(
      withPose(createDefaultShivaConfiguration(), "shiva.blessing"),
    );
    expect(resolved.hands.frontRight.mudra).toBe("abhaya");
    expect(resolved.hands.frontLeft.mudra).toBe("varada");

    const trishul = attachmentFor(resolved, "shiva.attribute.trishul");
    expect(trishul, "the trishul is still in the scene").toBeDefined();
    expect(trishul!.presentation.mode).toBe("grounded");
    expect(trishul!.socket).toBe(GROUND_SOCKET);
    expect(trishul!.handSlot).toBeUndefined();
  });

  it("never leaves a gesturing hand holding something", () => {
    for (const preset of [...SHIVA_POSE_PRESETS, ...POSE_PRESETS]) {
      for (const makeConfig of [createDefaultShivaConfiguration, createDefaultGaneshaConfiguration]) {
        const config = makeConfig();
        if (preset.id.startsWith("shiva.") !== (config.deity === "shiva")) continue;
        const resolved = resolveCharacterPresentation(withPose(config, preset.id));
        for (const attachment of resolved.attachments) {
          if (!attachment.handSlot) continue;
          expect(
            isGestureMudra(resolved.hands[attachment.handSlot].mudra),
            `${preset.id}: ${attachment.asset.id} in a gesturing ${attachment.handSlot}`,
          ).toBe(false);
        }
      }
    }
  });

  it("explains what happened rather than silently dropping it", () => {
    const config = createDefaultShivaConfiguration();
    // Two arms, both gesturing: the damaru has nowhere to go at all.
    const resolved = resolveCharacterPresentation(withPose(config, "shiva.blessing"));
    expect(attachmentFor(resolved, "shiva.attribute.damaru")).toBeUndefined();
    const said = resolved.issues.map((i) => i.message).join(" ");
    expect(said).toContain("Damaru");
    expect(said).toMatch(/cannot hold it|moved to/);
  });

  it("moves a mobile attribute to a free hand when there is one", () => {
    const config = createDefaultShivaConfiguration();
    const fourArmed = { ...withPose(config, "shiva.blessing"), arms: { count: 4 as const } };
    const resolved = resolveCharacterPresentation(fourArmed);
    const damaru = attachmentFor(resolved, "shiva.attribute.damaru");
    expect(damaru, "a free back hand can take it").toBeDefined();
    expect(damaru!.handSlot).toBeDefined();
    expect(damaru!.handSlot!.startsWith("back")).toBe(true);
    expect(resolved.hands[damaru!.handSlot!].mudra).toBe("pinch");
  });
});

describe("a hand adopts the grip the item declares", () => {
  it("sets the mudra from the chosen presentation, not from the configuration", () => {
    const config = createDefaultShivaConfiguration();
    // The customer left both hands on "grip"; the damaru is pinch-held.
    const resolved = resolveCharacterPresentation(config);
    const damaru = attachmentFor(resolved, "shiva.attribute.damaru")!;
    expect(damaru.presentation.hand).toBe("pinch");
    expect(resolved.hands[damaru.handSlot!].mudra).toBe("pinch");
    const trishul = attachmentFor(resolved, "shiva.attribute.trishul")!;
    expect(resolved.hands[trishul.handSlot!].mudra).toBe("grip");
  });

  it("does not put two things in one hand", () => {
    const config = createDefaultShivaConfiguration();
    const resolved = resolveCharacterPresentation(config);
    const used = resolved.attachments.map((a) => a.handSlot).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe("Ganesha resolves exactly as it always did", () => {
  it("keeps every attribute in the hand it was configured for", () => {
    const config = createDefaultGaneshaConfiguration();
    const resolved = resolveCharacterPresentation(withPose(config, "blessing"));
    for (const attachment of config.attachments) {
      const found = resolved.attachments.find((a) => a.asset.id === attachment.asset.assetId);
      expect(found, attachment.asset.assetId).toBeDefined();
      expect(found!.socket).toBe(attachment.socket);
    }
    expect(resolved.issues.filter((i) => i.severity !== "note")).toEqual([]);
  });

  it("puts the blessing hand into abhaya and leaves it empty", () => {
    const resolved = resolveCharacterPresentation(
      withPose(createDefaultGaneshaConfiguration(), "blessing"),
    );
    expect(resolved.hands.frontRight.mudra).toBe("abhaya");
    expect(resolved.attachments.some((a) => a.handSlot === "frontRight")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

const SHIVA_ATTRIBUTES = ["shiva.attribute.trishul", "shiva.attribute.damaru"] as const;
const SHIVA_ORNAMENTS = [
  ["chest.necklace", "shiva.ornament.naga"],
  ["head.moon", "shiva.crescent.chandra"],
  ["head.forehead", "shiva.thirdeye.trinetra"],
] as const;

describe("pose x attribute matrix", () => {
  const poses = SHIVA_POSE_PRESETS.map((p) => p.id);

  it.each(poses)("%s resolves every attribute to a presentation it can sustain", (poseId) => {
    for (const attributeId of SHIVA_ATTRIBUTES) {
      for (const slot of ["frontLeft", "frontRight"] as const) {
        const base = createDefaultShivaConfiguration();
        const config: CharacterConfiguration = {
          ...withPose(base, poseId),
          attachments: [
            { socket: `arm.${slot}.hand.item` as SocketId, asset: { assetId: attributeId, version: 1 } },
          ],
        };
        const resolved = resolveCharacterPresentation(config);
        const found = attachmentFor(resolved, attributeId);
        const where = `${poseId}/${attributeId}/${slot}`;

        if (!found) {
          // Absent is a legitimate outcome — but only when it was SAID.
          const said = resolved.issues.filter((i) => i.severity === "rejected");
          expect(said.length, `${where}: dropped without saying why`).toBeGreaterThan(0);
          continue;
        }

        // Whatever presentation it landed in must be one the asset declares.
        expect(getAsset(attributeId)!.presentations!.map((p) => p.id), where).toContain(
          found.presentation.id,
        );
        // If a hand holds it, that hand is not making a gesture...
        if (found.handSlot) {
          expect(isGestureMudra(resolved.hands[found.handSlot].mudra), where).toBe(false);
          // ...and it is a hand this body actually has.
          expect(resolved.armSlots, where).toContain(found.handSlot);
        } else {
          // ...and if no hand holds it, it does not claim to need one.
          expect(isHandheld(found.presentation), where).toBe(false);
        }
      }
    }
  });

  it.each(poses)("%s keeps every ornament on a socket the body has", (poseId) => {
    for (const [socket, assetId] of SHIVA_ORNAMENTS) {
      const base = createDefaultShivaConfiguration();
      const config: CharacterConfiguration = {
        ...withPose(base, poseId),
        attachments: [{ socket: socket as SocketId, asset: { assetId, version: 1 } }],
      };
      const resolved = resolveCharacterPresentation(config);
      const found = attachmentFor(resolved, assetId);
      expect(found, `${poseId}/${assetId}`).toBeDefined();
      expect(resolved.skeleton.sockets.map((s) => s.id)).toContain(found!.socket);
      // An ornament is worn; no pose may put it into a hand.
      expect(found!.handSlot).toBeUndefined();
    }
  });

  it.each(poses)("%s leaves no hand both gesturing and holding", (poseId) => {
    const resolved = resolveCharacterPresentation(
      withPose(createDefaultShivaConfiguration(), poseId),
    );
    for (const slot of ARM_SLOTS as readonly ArmSlot[]) {
      const holding = resolved.attachments.some((a) => a.handSlot === slot);
      if (!holding) continue;
      expect(isGestureMudra(resolved.hands[slot].mudra), `${poseId}/${slot}`).toBe(false);
    }
  });
});
