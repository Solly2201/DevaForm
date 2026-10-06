/**
 * What the picker prints under an asset name, and the rule that keeps it
 * meaningful. Kept apart from the grid component so the rule can be
 * tested without standing up a renderer.
 */
import type { AssetStage } from "@devaform/asset-system";

/**
 * What a customer should be told about an asset's lifecycle — which is
 * almost nothing.
 *
 * The card used to print the stage verbatim: "prototype", "integration",
 * "experimental". Those are the pipeline's words for how far a piece has
 * got through OUR process, and putting them in a picker tells a customer
 * something about us instead of something about the statue. So they were
 * collapsed into one honest phrase, "In preparation".
 *
 * WHY THAT PHRASE IS NOW GONE TOO. Counted across the shipped catalogue,
 * it printed on 81 of the 82 assets a customer can select. A warning that
 * fires on ninety-nine per cent of the options is not telling anyone
 * which option to be careful about; it is a watermark across the whole
 * product reading "unfinished", and it was the first thing anyone opening
 * the Studio saw. The stage field had stopped discriminating because
 * nothing was ever promoted out of `prototype`, not because eighty-one
 * pieces are unfit to show.
 *
 * The decision about whether an option is good enough to offer does not
 * belong on the tile at all — it belongs at the point the option is
 * offered. `VISIBLE_STAGES` is that gate, and `showcase.test.ts` holds
 * every asset behind it to building real geometry with no complaint. An
 * asset that fails that bar must be taken OUT of the picker, which is a
 * decision with teeth; an asset that passes it is simply a choice, and
 * needs no apology printed under its name.
 *
 * What survives is the one label that still discriminates and that a
 * customer actually benefits from: recently added work.
 *
 * `badgeCoverage` below is the regression guard. If someone restores a
 * blanket badge, the test that calls it fails with the count.
 */
/**
 * AND IT IS EMPTY, which is the honest state of it.
 *
 * The one entry was `review: "New"`, and `review` is no longer a stage a
 * customer is shown — it means "not yet approved for production", and the
 * registry now enforces that (see VISIBLE_STAGES). A mapping that cannot
 * fire is worse than no mapping, because the next reader will believe the
 * picker badges something.
 *
 * The mechanism stays, with its guard: when a piece of work is promoted
 * into a stage a customer can see, this is where "New" goes back.
 */
export const STAGE_BADGE: Partial<Record<AssetStage, string>> = {};

/**
 * How much of a set of assets a badge would mark.
 *
 * Exported for the test that pins the rule above: a customer-facing badge
 * is a signal, and a signal that fires on most of the catalogue has no
 * information in it.
 */
export function badgeCoverage(assets: readonly { stage: AssetStage }[]): {
  badged: number;
  total: number;
} {
  return {
    badged: assets.filter((asset) => STAGE_BADGE[asset.stage] !== undefined).length,
    total: assets.length,
  };
}
