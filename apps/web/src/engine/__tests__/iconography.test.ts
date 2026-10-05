/**
 * What the reference sheet promises, against what the Studio offers.
 *
 * `references/ref2.png` is the project's own target, and it says what it
 * is for in its own margin: "A reference guide for visual quality,
 * component variety and customization depth. Not a single design to copy,
 * but a target for completeness and fidelity." It lays out sixteen
 * numbered categories with the variants each should contain.
 *
 * So this is the completeness half of that, read off the sheet and held
 * against the registry. It is a cheap check and it answers a question
 * nothing else here asks: not "does this asset build" — `showcase.test`
 * covers that for everything — but "is the thing a customer was promised
 * actually there". A picker that silently ships two of five crowns passes
 * every other test in this suite.
 *
 * WHAT IT DOES NOT DO is judge whether a crown looks like a kirita
 * mukuta. That is a human looking at a render, and it is the other half
 * of an iconography review; the orbit scripts exist to produce the
 * pictures for it. This half is the one a machine can keep honest between
 * those reviews.
 *
 * THE TWO SHORTFALLS ARE RECORDED, NOT ROUNDED AWAY. Crowns and lower
 * garments ship three of the five the sheet draws. They are written down
 * here as the numbers they are, so the gap is visible on every run
 * instead of being remembered by whoever last read the sheet — and so
 * that filling one is a one-line change here rather than a discovery.
 * Padding them to five with weak variants would satisfy a count and fail
 * the standard the same brief sets: quality over quantity.
 */
import { describe, expect, it } from "vitest";
import { listAssets } from "@devaform/asset-system";
import {
  baseConfigurationSchema,
  MATERIAL_PALETTES,
  MUDRAS,
  POSE_PRESETS,
  type PartSlot,
  type SocketId,
} from "@devaform/character-schema";

/**
 * One row of the sheet.
 *
 * `promised` is what the reference draws. `offered` counts what the
 * registry will actually put in front of a customer — through the same
 * calls the panel makes, so an asset that stops being selectable stops
 * counting here on the same commit.
 */
interface Row {
  /** The sheet's own number and name, so a reader can find it. */
  sheet: string;
  promised: number;
  offered: () => number;
  /**
   * Set where the product knowingly ships fewer than the sheet draws, with
   * the reason. An absent note means the row is expected to be complete.
   */
  shortfall?: string;
}

const bySlot = (slot: PartSlot) => () => listAssets({ deity: "ganesha", slot }).length;
const bySocket = (socket: SocketId) => () => listAssets({ deity: "ganesha", socket }).length;

const SHEET: readonly Row[] = [
  { sheet: "1. Head variants", promised: 3, offered: bySlot("head") },
  { sheet: "2. Eyes", promised: 3, offered: bySlot("eyes") },
  { sheet: "3. Ears", promised: 4, offered: bySlot("ears") },
  { sheet: "4. Trunk variants", promised: 6, offered: bySlot("trunk") },
  { sheet: "5. Tusks", promised: 4, offered: bySlot("tusks") },
  { sheet: "6. Hands / mudras", promised: 6, offered: () => MUDRAS.length },
  {
    sheet: "7. Handheld items",
    promised: 5,
    offered: bySocket("arm.frontRight.hand.item" as SocketId),
  },
  {
    sheet: "8. Crown / headwear",
    promised: 5,
    offered: bySocket("head.crown" as SocketId),
    shortfall:
      "three of five. The sheet draws Traditional, Ornate, Simple, Regal and Temple Style; " +
      "the Studio offers Kirita, Karanda and Prabha. Two more are wanted, and two weak ones " +
      "would be worse than none",
  },
  {
    sheet: "9. Clothing / dhoti",
    promised: 5,
    offered: bySlot("lowerGarment"),
    shortfall:
      "three of five. The sheet draws Traditional, Ornate, Simple, Royal and With Sash; the " +
      "Studio offers Pleated, Short and Layered, plus the Angavastram as a separate upper " +
      "garment, which covers the sheet's 'With Sash' differently rather than not at all",
  },
  {
    // The sheet draws six KINDS of ornament rather than six of one, so
    // the row is about whether each kind exists at all.
    sheet: "10. Ornaments (six kinds)",
    promised: 6,
    offered: () =>
      [
        bySocket("chest.necklace" as SocketId)(),
        bySlot("armlets")(),
        bySlot("bracelets")(),
        bySocket("waist.ornament" as SocketId)(),
        bySlot("anklets")(),
        bySlot("earrings")(),
      ].filter((count) => count > 0).length,
  },
  { sheet: "11. Body variants", promised: 3, offered: bySlot("body") },
  { sheet: "13. Base", promised: 5, offered: () => baseConfigurationSchema.shape.style.options.length },
  { sheet: "14. Companion", promised: 1, offered: bySocket("base.platform" as SocketId) },
  {
    sheet: "15. Poses",
    promised: 5,
    offered: () =>
      POSE_PRESETS.filter((preset) => preset.id.startsWith("ganesha.") || !preset.id.includes("."))
        .length,
  },
  { sheet: "16. Materials / palettes", promised: 8, offered: () => MATERIAL_PALETTES.length },
];

describe("the reference sheet's own target for completeness", () => {
  it.each(SHEET.map((row) => [row.sheet, row] as const))("%s", (_label, row) => {
    const offered = row.offered();
    if (row.shortfall) {
      /**
       * A KNOWN GAP IS STILL A FLOOR. The count is pinned where it is, so
       * the shortfall cannot quietly deepen, and filling it fails this
       * test loudly enough that somebody updates the row.
       */
      expect(
        offered,
        `${row.sheet}: ${row.shortfall}. If this now reads differently, update the row.`,
      ).toBe(3);
      return;
    }
    expect(
      offered,
      `${row.sheet}: the sheet draws ${row.promised} and the Studio offers ${offered}`,
    ).toBeGreaterThanOrEqual(row.promised);
  });

  it("covers most of the sheet, and says exactly where it does not", () => {
    const short = SHEET.filter((row) => row.shortfall);
    const complete = SHEET.length - short.length;
    expect(
      complete,
      `${complete} of ${SHEET.length} categories meet the reference; short: ` +
        short.map((row) => row.sheet).join(", "),
    ).toBeGreaterThanOrEqual(13);
    // And the gaps stay enumerated rather than growing quietly.
    expect(short.map((row) => row.sheet)).toEqual([
      "8. Crown / headwear",
      "9. Clothing / dhoti",
    ]);
  });
});
