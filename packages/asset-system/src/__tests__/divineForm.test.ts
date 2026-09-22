/**
 * Which divine form is being made is a CHOICE, not an address.
 *
 * The Studio was three editors wearing one name: /studio/<deity>. A
 * customer had to choose a god before they could see the product, and
 * changing their mind meant finding another URL. What that cost was not
 * only navigation — the deity being the route is what made the editor
 * plural, and a plural editor grows a second copy of everything.
 *
 * So the form is a category like any other, filled by the registry. This
 * holds the two halves of that: the category exists and is the same one
 * for everybody, and the registry it reads is complete enough to fill it.
 */
import { describe, expect, it } from "vitest";
import { DIVINE_FORM_CATEGORY } from "../categories";
import { AVAILABLE_DEITIES, DEITIES, getAvailableDeity } from "../deities";

describe("the form is a category", () => {
  it("is one category, not one per deity", () => {
    expect(DIVINE_FORM_CATEGORY.content.type).toBe("form");
    // Declared once and shared. A per-deity copy is how "the same
    // category" quietly becomes three that drift.
    for (const deity of AVAILABLE_DEITIES) {
      expect(
        deity.categories.some((category) => category.content.type === "form"),
        `${deity.id} does not carry its own copy`,
      ).toBe(false);
      expect(deity.categories.some((category) => category.id === DIVINE_FORM_CATEGORY.id)).toBe(
        false,
      );
    }
  });

  it("is filled by the registry rather than by the editor", () => {
    // Everything the panel needs to draw a form comes from the deity's
    // own record: nothing about Shiva or Vishnu is written in the UI.
    for (const deity of DEITIES) {
      expect(deity.name.length).toBeGreaterThan(0);
      expect(deity.epithet.length).toBeGreaterThan(0);
      expect(deity.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof deity.available).toBe("boolean");
    }
    expect(AVAILABLE_DEITIES.length).toBeGreaterThanOrEqual(3);
    expect(DEITIES.length).toBeGreaterThan(AVAILABLE_DEITIES.length);
  });

  it("gives every offered form a configuration of its own", () => {
    // Switching is a NEW creation of that deity, never a translation of
    // the last one: the forms do not share a body, a skeleton or a set
    // of attributes, and a merged configuration is a character neither
    // of them is.
    const configs = AVAILABLE_DEITIES.map((deity) => deity.createDefaultConfiguration());
    for (const [index, config] of configs.entries()) {
      expect(config.deity).toBe(AVAILABLE_DEITIES[index]!.id);
      expect(getAvailableDeity(config.deity)).toBeDefined();
    }
    // And their attributes really are disjoint — an attachment that
    // appeared in two would be one that survived a switch.
    const attachmentsOf = (index: number) =>
      new Set(configs[index]!.attachments.map((entry) => entry.asset.assetId));
    for (let a = 0; a < configs.length; a += 1) {
      for (let b = a + 1; b < configs.length; b += 1) {
        const shared = [...attachmentsOf(a)].filter((id) => attachmentsOf(b).has(id));
        // Shared ORNAMENTS are fine and deliberate — a kundala is a
        // kundala. Shared ATTRIBUTES are not: they are the iconography.
        const attributes = shared.filter((id) => id.includes(".attribute.") || id.includes(".item."));
        expect(
          attributes,
          `${AVAILABLE_DEITIES[a]!.id} and ${AVAILABLE_DEITIES[b]!.id} share attributes`,
        ).toEqual([]);
      }
    }
  });
});
