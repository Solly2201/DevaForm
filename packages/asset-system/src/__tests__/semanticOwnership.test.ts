/**
 * One physical ornament, one place to switch it on.
 *
 * Two defects found by using the editor, with one cause between them.
 *
 * DUPLICATE OWNERSHIP. The Vaijayanti declared both `chest.necklace` and
 * `chest.mala`, so it appeared in the Necklace picker and the Mala picker
 * and either could switch it on — and switching on both drew two of it.
 * Those sockets are LAYERS, not alternatives: they sit at the same joint
 * and the same height because a collar and a longer garland are worn
 * together, which is why Shiva has a serpent at one and rudraksha at the
 * other. The Bead Mala had the same declaration and the same defect.
 *
 * CARDINALITY. Vishnu has four hands and exactly one Sudarshana. Putting
 * the discus in a second hand had been producing a second discus, which
 * is a different god. The same for the Trishul, the Shankha, the Gada and
 * the Padma — these are named divine attributes, not props.
 *
 * Both are now declarations an asset makes, enforced in one place each:
 * the family rule by these tests, the cardinality by the resolver.
 */
import { describe, expect, it } from "vitest";
import {
  socketFamily,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  createDefaultVishnuConfiguration,
  type CharacterConfiguration,
  type SocketId,
} from "@devaform/character-schema";
import { listAssets } from "../registry";
import { resolveCharacterPresentation } from "../resolve";

const ALL = listAssets({ includeDeprecated: true });

/**
 * Assets that genuinely exist in two places at once, with the reason.
 *
 * Named here rather than waved through by a loosened rule, the way the
 * penetration table names its exceptions: an exemption should be a
 * decision somebody made and can be argued with, not a threshold nobody
 * can see.
 */
const TWO_PLACES_ON_PURPOSE: Record<string, string> = {
  "ganesha.item.modak":
    "a sweet in the hand and a sweet the trunk is reaching for are two sweets, and the " +
    "iconography shows both. This is not one object reachable from two pickers",
};

describe("every ornament has one canonical owner", () => {
  /**
   * An attachment may name several sockets only when they are the SAME
   * ornament worn on a different side or limb — two ears, two ankles,
   * four hands. Anything else is one object a customer can reach from two
   * different places in the editor.
   */
  it("no attachment spans two socket families", () => {
    const offenders: string[] = [];
    for (const asset of ALL) {
      if (asset.kind.type !== "attachment") continue;
      const families = new Set(asset.kind.sockets.map((socket) => socketFamily(socket)));
      if (families.size > 1 && !TWO_PLACES_ON_PURPOSE[asset.id]) {
        offenders.push(`${asset.id}: ${[...families].join(" and ")}`);
      }
    }
    expect(offenders, offenders.join("; ")).toEqual([]);
  });

  /**
   * And the consequence a customer would actually meet: the same asset
   * offered in two different pickers.
   */
  it("no asset is offered under two different socket families", () => {
    const seen = new Map<string, Set<string>>();
    for (const asset of ALL) {
      if (asset.kind.type !== "attachment") continue;
      for (const socket of asset.kind.sockets) {
        const families = seen.get(asset.id) ?? new Set<string>();
        families.add(socketFamily(socket));
        seen.set(asset.id, families);
      }
    }
    const doubled = [...seen.entries()]
      .filter(([id, families]) => families.size > 1 && !TWO_PLACES_ON_PURPOSE[id])
      .map(([id, families]) => `${id} in ${[...families].join(", ")}`);
    expect(doubled, doubled.join("; ")).toEqual([]);
  });

  it("the two that were wrong are named, so a regression is recognisable", () => {
    for (const id of ["vishnu.garland.vaijayanti", "ganesha.necklace.mala"]) {
      const asset = ALL.find((candidate) => candidate.id === id);
      expect(asset, `${id} is in the registry`).toBeDefined();
      expect(asset!.kind.type).toBe("attachment");
      const sockets = (asset!.kind as { sockets: readonly SocketId[] }).sockets;
      expect(sockets, `${id} owns exactly one socket`).toHaveLength(1);
      expect(sockets[0], `${id} belongs to the mala`).toBe("chest.mala");
    }
  });
});

describe("a singleton attribute is presented once", () => {
  const SINGLETONS = [
    ["shiva", createDefaultShivaConfiguration, "shiva.attribute.trishul"],
    ["vishnu", createDefaultVishnuConfiguration, "vishnu.attribute.chakra"],
    ["vishnu", createDefaultVishnuConfiguration, "vishnu.attribute.shankha"],
    ["vishnu", createDefaultVishnuConfiguration, "vishnu.attribute.gada"],
    ["ganesha", createDefaultGaneshaConfiguration, "ganesha.item.axe"],
  ] as const;

  it("the named divine attributes declare it", () => {
    for (const [, , assetId] of SINGLETONS) {
      const asset = ALL.find((candidate) => candidate.id === assetId);
      expect(asset, `${assetId} exists`).toBeDefined();
      expect(asset!.cardinality, `${assetId} is a singleton`).toBe("singleton");
    }
  });

  it.each(SINGLETONS.map(([deity, make, assetId]) => [assetId, deity, make] as const))(
    "%s cannot be put in two hands at once",
    (assetId, _deity, make) => {
      const base = make();
      const asset = ALL.find((candidate) => candidate.id === assetId)!;
      const hands = (asset.kind as { sockets: readonly SocketId[] }).sockets.filter((socket) =>
        socket.startsWith("arm."),
      );
      expect(hands.length, `${assetId} is a hand attribute`).toBeGreaterThan(1);

      /**
       * BOTH HANDS GRIPPING, because a hand giving abhaya is refused the
       * item in the first place and the test would then be measuring the
       * gesture rule rather than the cardinality rule.
       */
      const gripping = Object.fromEntries(
        Object.keys(base.hands).map((slot) => [slot, { mudra: "grip" as const }]),
      ) as typeof base.hands;
      const config: CharacterConfiguration = {
        ...base,
        hands: gripping,
        attachments: [
          ...base.attachments.filter(
            (entry) => !hands.includes(entry.socket as SocketId),
          ),
          { socket: hands[0] as SocketId, asset: { assetId, version: asset.version } },
          { socket: hands[1] as SocketId, asset: { assetId, version: asset.version } },
        ],
      };
      const resolved = resolveCharacterPresentation(config);
      const presented = resolved.attachments.filter((entry) => entry.asset.id === assetId);
      expect(
        presented.length,
        `${assetId} is presented ${presented.length} times — there is one of it`,
      ).toBe(1);

      /**
       * AND THE LAST ONE WINS, which is what makes it read as moving
       * rather than as being refused. The store appends on selection, so
       * the hand just chosen is the hand it goes to.
       */
      expect(presented[0]!.requestedSocket, "it moved to the hand chosen last").toBe(hands[1]);

      // And the customer is told where it went rather than left wondering.
      const explained = resolved.issues.filter((issue) => issue.assetId === assetId);
      expect(explained.length, `${assetId} explains the one it dropped`).toBeGreaterThan(0);
      expect(explained[0]!.message).toMatch(/already presented by/i);
    },
  );
});

describe("an old save holding duplicates still opens", () => {
  /**
   * Nobody could have made one of these in the editor since the rule
   * landed, but a configuration saved before it can hold two Sudarshanas.
   * It has to resolve to one figure rather than to an error.
   */
  it("normalises rather than failing", () => {
    const base = createDefaultVishnuConfiguration();
    const chakra = ALL.find((a) => a.id === "vishnu.attribute.chakra")!;
    const config: CharacterConfiguration = {
      ...base,
      attachments: [
        ...base.attachments.filter((entry) => !entry.socket.startsWith("arm.")),
        {
          socket: "arm.frontRight.hand.item" as SocketId,
          asset: { assetId: chakra.id, version: chakra.version },
        },
        {
          socket: "arm.backRight.hand.item" as SocketId,
          asset: { assetId: chakra.id, version: chakra.version },
        },
        {
          socket: "arm.backLeft.hand.item" as SocketId,
          asset: { assetId: chakra.id, version: chakra.version },
        },
      ],
    };
    const resolved = resolveCharacterPresentation(config);
    const discs = resolved.attachments.filter((entry) => entry.asset.id === chakra.id);
    expect(discs, "three were saved; one is presented").toHaveLength(1);
    expect(resolved.issues.filter((i) => i.assetId === chakra.id).length).toBe(2);
  });
});
