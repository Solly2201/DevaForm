/**
 * PROTOTYPE — the ingestion gate an artist's delivery would have to pass.
 *
 * `validate-assets.mjs` already checks the FILE: container, bounds,
 * material zone names, joint groups, skin joints, morph names, layout.
 * That is the half an exporter can get wrong. This is the other half, and
 * nothing checks it today: whether the asset's manifest entry DECLARES
 * what its own kind requires.
 *
 * The distinction matters because the defects this quarter were all of
 * the second sort. A band that goes round a limb has to say so, or the
 * only thing holding it to a limb is whichever generator happened to
 * build it. The earring had to say it passes through an earlobe, or a
 * containment check reports a correctly made earring as a defect. Nothing
 * about either is visible in a GLB.
 *
 * DELIBERATELY NOT MANDATORY YET. Production artists are not being asked
 * to satisfy this. Three representative assets are ENFORCED — one band,
 * one applied mark, one held attribute — and the rest of the catalogue is
 * measured and reported, so the size of the gap is a number rather than a
 * guess. See `docs/artist-asset-contract.md` for the contract this
 * implements and for what each requirement is for.
 */
import { describe, expect, it } from "vitest";
import { listAssets } from "../registry";
import type { AssetDefinition } from "../types";

/** What an asset of this kind has to declare, derived from the asset. */
interface Requirement {
  field: string;
  why: string;
  met: (asset: AssetDefinition) => boolean;
}

const SOCKETS_OF = (asset: AssetDefinition): readonly string[] =>
  asset.kind.type === "attachment" ? asset.kind.sockets : [];

const SLOT_OF = (asset: AssetDefinition): string | null =>
  asset.kind.type === "part" ? asset.kind.slot : null;

/**
 * The requirements this asset must meet, read off what it IS.
 *
 * Nothing here is a style rule. Each entry exists because a real defect
 * was possible without it and the measurement that found that defect is
 * named in `why`.
 */
export function requirementsFor(asset: AssetDefinition): Requirement[] {
  const required: Requirement[] = [];
  const slot = SLOT_OF(asset);
  const sockets = SOCKETS_OF(asset);

  // A band round a limb.
  if (slot === "armlets" || slot === "bracelets" || slot === "anklets") {
    required.push({
      field: "fit.kind === 'encircles'",
      why: "a band is sized by what it CONTAINS, and `bandSeat.test` can only hold it to that if it says so. Vishnu's armlet was sixteen millimetres inside his arm while passing every check that existed",
      met: (a) => a.fit?.kind === "encircles",
    });
  }

  // A mark on skin.
  if (sockets.includes("head.forehead")) {
    required.push({
      field: "fit.kind of 'appliedTo' or 'restsOn'",
      why: "paint on a forehead has no clearance and a jewel on one does, and a depth check that cannot tell them apart reports a correctly made tilaka as a defect. Which of the two is a decision the asset has to make; this does not care which",
      met: (a) => a.fit?.kind === "appliedTo" || a.fit?.kind === "restsOn",
    });
  }

  // Something a hand closes on.
  if (sockets.some((socket) => socket.endsWith("hand.item"))) {
    required.push({
      field: "a presentation with a grip",
      why: "a fist closes onto the radius the ITEM declares; without one it closes to a fixed diameter and meets a drum head as readily as a staff",
      met: (a) => (a.presentations ?? []).some((p) => p.grip !== undefined),
    });
  }

  // Anything a customer can actually be shown.
  if (asset.stage === "integration" || asset.stage === "production") {
    required.push({
      field: "provenance",
      why: "an asset a customer can see has to be traceable to what made it: a tool, a reference, or a generator",
      met: (a) => a.provenance !== undefined || a.source.kind === "procedural",
    });
    required.push({
      field: "at least one socket, for an attachment",
      why: "an attachment with nowhere to attach cannot be placed, and the failure is a silent absence rather than an error. `materialZones` was tried here first and dropped: an empty list is a correct answer for a mark made of ash, and nothing distinguishes that from an oversight",
      met: (a) => a.kind.type !== "attachment" || a.kind.sockets.length > 0,
    });
  }

  // Anything at all.
  required.push({
    field: "deityCompatibility",
    why: "an empty list means ANY deity, which is a decision; it should be a decision somebody made rather than a field nobody filled",
    met: (a) => Array.isArray(a.deityCompatibility),
  });
  required.push({
    field: "printability",
    why: "the manufacturing audit distinguishes visually valid from printable, and an asset that says nothing about which it is cannot be sorted",
    met: (a) => a.printability !== undefined,
  });

  return required;
}

/**
 * The three the gate is ENFORCED for.
 *
 * One of each shape the contract has to describe: a band that goes round
 * something, a mark applied to skin, and an attribute a hand closes on.
 * Between them they exercise every requirement above except the
 * stage-gated pair, which every integration asset exercises anyway.
 */
const ENFORCED = [
  "ganesha.bracelets.kada",
  "vishnu.forehead.tilaka",
  "vishnu.attribute.gada",
] as const;

describe("the ingestion gate, on the assets it is enforced for", () => {
  it.each(ENFORCED)("%s declares everything its kind requires", (id) => {
    const asset = listAssets({}).find((candidate) => candidate.id === id);
    expect(asset, `${id} is in the catalogue`).toBeTruthy();
    const unmet = requirementsFor(asset!)
      .filter((requirement) => !requirement.met(asset!))
      .map((requirement) => `${requirement.field} — ${requirement.why}`);
    expect(unmet, unmet.join("; ")).toEqual([]);
  });

  it("covers more than one shape of asset", () => {
    const shapes = new Set(
      ENFORCED.map((id) => {
        const asset = listAssets({}).find((candidate) => candidate.id === id)!;
        return `${asset.kind.type}:${SLOT_OF(asset) ?? SOCKETS_OF(asset)[0] ?? ""}`;
      }),
    );
    expect(shapes.size, "the three are not three of the same thing").toBe(3);
  });
});

describe("the rest of the catalogue, measured rather than enforced", () => {
  /**
   * The size of the gap, as a number.
   *
   * It fails only if the gap GROWS, which is the useful property while
   * the gate is still optional: new assets may not make it worse, and
   * every one that is brought up to the contract lowers the pin.
   */
  it("has a known number of unmet requirements", () => {
    const report = new Map<string, number>();
    let total = 0;
    for (const asset of listAssets({})) {
      const unmet = requirementsFor(asset).filter((requirement) => !requirement.met(asset));
      if (unmet.length === 0) continue;
      total += unmet.length;
      for (const requirement of unmet) {
        report.set(requirement.field, (report.get(requirement.field) ?? 0) + 1);
      }
    }
    const summary = [...report.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([field, count]) => `${field}: ${count}`)
      .join(", ");
    // Measured 2026-10-05 and brought to zero in the same pass, because
    // the gap turned out to be two assets on a forehead that had not said
    // whether they were paint or a jewel. It stays written as a budget
    // rather than as `toEqual(0)`: the point of the number is that a new
    // asset may not raise it, and the contract is not mandatory yet.
    expect(total, `unmet requirements across the catalogue — ${summary}`).toBeLessThanOrEqual(0);
  });
});
