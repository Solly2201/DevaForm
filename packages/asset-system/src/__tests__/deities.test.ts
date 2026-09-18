import { describe, expect, it } from "vitest";
import { safeValidateConfiguration } from "@devaform/character-schema";
import { AVAILABLE_DEITIES, DEITIES, getAvailableDeity, getDeity } from "../deities";

describe("deity registry", () => {
  it("has unique deity ids", () => {
    expect(new Set(DEITIES.map((d) => d.id)).size).toBe(DEITIES.length);
  });

  it("currently offers exactly ganesha, shiva and vishnu as available", () => {
    expect(AVAILABLE_DEITIES.map((d) => d.id)).toEqual(["ganesha", "shiva", "vishnu"]);
  });

  it("declares the upcoming roadmap deities", () => {
    const upcoming = DEITIES.filter((d) => !d.available).map((d) => d.id);
    expect(upcoming).toEqual(
      expect.arrayContaining(["durga", "krishna", "hanuman", "lakshmi", "saraswati"]),
    );
  });

  it("every available deity is fully specified", () => {
    for (const deity of AVAILABLE_DEITIES) {
      expect(deity.assets.length).toBeGreaterThan(0);
      expect(deity.categories.length).toBeGreaterThan(0);
      expect(deity.posePresets.length).toBeGreaterThan(0);
      expect(deity.armOptions.length).toBeGreaterThan(0);
      const config = deity.createDefaultConfiguration();
      expect(config.deity).toBe(deity.id);
      expect(safeValidateConfiguration(config).success).toBe(true);
    }
  });

  it("getAvailableDeity rejects upcoming and unknown deities", () => {
    expect(getAvailableDeity("ganesha")?.id).toBe("ganesha");
    expect(getAvailableDeity("shiva")?.id).toBe("shiva");
    expect(getAvailableDeity("durga")).toBeUndefined();
    expect(getAvailableDeity("zeus")).toBeUndefined();
    expect(getDeity("durga")?.available).toBe(false);
  });
});
