/**
 * The presentation stage, and the one rule that makes it work.
 *
 * THE LAST FRAME IS THE STAGE. The entry sequence ends held on a lit
 * mandala in an empty sanctum, and the interactive stage stands on that
 * same frame — the same file, derived from the video rather than
 * re-created beside it. Everything here exists to keep those two from
 * drifting apart, because the day they do, the handover becomes a cut and
 * nobody will be able to say when it started.
 *
 * And the other rule: a stage is not a character. Nothing about a room,
 * a camera or a light may end up in a saved configuration, or a customer
 * who loads their Shiva a year from now gets a year-old camera angle
 * along with it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
} from "@devaform/character-schema";
import { DEITIES } from "../deities";
import { getPresentation, orbitBounds, PRESENTATIONS } from "../stage";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "..", "apps", "web", "public");
const asFile = (url: string) => join(PUBLIC_DIR, url.replace(/^\//, ""));

/**
 * The customer stays in the room.
 *
 * The orbit's far bound and the colonnade's radius are two numbers that
 * have to agree, and for a while they did not: a maximum of five metres
 * with columns at 3.7 m meant the last stretch of zoom-out carried the
 * camera THROUGH the colonnade, where the nearest pillar stands half a
 * metre from the lens and fills the frame. The statue was hidden behind a
 * column at every azimuth, and the defect was invisible in the source
 * because neither number is wrong on its own.
 *
 * So one of them is derived now, and this is what holds it: whatever a
 * stage authors, the distance the Studio actually hands the controls
 * keeps the camera inside the ring with air to spare.
 */
describe("the orbit stays inside the room it is orbiting in", () => {
  it.each(PRESENTATIONS.map((stage) => stage.id))("%s", (id) => {
    const stage = PRESENTATIONS.find((entry) => entry.id === id)!;
    const bounds = orbitBounds(stage);

    expect(bounds.minDistance).toBe(stage.camera.minDistance);
    expect(bounds.maxDistance).toBeLessThanOrEqual(stage.camera.maxDistance);
    expect(bounds.minDistance).toBeLessThan(bounds.maxDistance);

    const columns = stage.environment?.columns;
    if (!columns) {
      // A stage with no room of its own is bounded only by its author.
      expect(bounds.maxDistance).toBe(stage.camera.maxDistance);
      return;
    }

    // The widest part of a column is its base and capital, at one and a
    // half times the shaft — the same figure the lathe profile uses.
    const innerFace = columns.radius - columns.thickness * 1.5;
    expect(
      bounds.maxDistance,
      "the camera never reaches the colonnade",
    ).toBeLessThan(innerFace);
    expect(
      innerFace - bounds.maxDistance,
      "and keeps clear air between itself and the nearest column",
    ).toBeGreaterThanOrEqual(0.5);

    // And the authored maximum is still reachable — a bound that silently
    // halves the zoom range is as much a defect as one that overshoots.
    expect(
      bounds.maxDistance / stage.camera.maxDistance,
      "the room does not quietly take the zoom range away",
    ).toBeGreaterThan(0.9);
  });

  /**
   * The hero composition is composed INSIDE the same bound.
   *
   * heroFraming clamps the measured distance to the authored maximum; if
   * the room were tighter than that clamp, the opening shot itself would
   * be standing outside the colonnade and no customer input would be
   * needed to break it.
   */
  it.each(PRESENTATIONS.map((stage) => stage.id))(
    "%s: the authored maximum is a distance the room allows",
    (id) => {
      const stage = PRESENTATIONS.find((entry) => entry.id === id)!;
      expect(orbitBounds(stage).maxDistance).toBe(stage.camera.maxDistance);
    },
  );
});

describe("every stage is a complete description of one", () => {
  it.each(PRESENTATIONS.map((stage) => stage.id))("%s", (id) => {
    const stage = PRESENTATIONS.find((entry) => entry.id === id)!;

    // A hero composition that can actually be looked at.
    expect(stage.camera.fov).toBeGreaterThan(10);
    expect(stage.camera.fov).toBeLessThan(80);
    expect(stage.camera.minDistance).toBeLessThan(stage.camera.maxDistance);
    const [hx, hy, hz] = stage.camera.position;
    const [tx, , tz] = stage.camera.target;
    const distance = Math.hypot(hx - tx, hz - tz);
    expect(distance, "the hero camera is inside its own dolly range").toBeGreaterThanOrEqual(
      stage.camera.minDistance,
    );
    expect(distance).toBeLessThanOrEqual(stage.camera.maxDistance);
    expect(hy, "and above the floor").toBeGreaterThan(0);

    // The settle is the END of the entry, not a second animation.
    expect(stage.camera.settleFrom.dolly).toBeGreaterThan(0);
    expect(stage.camera.settleFrom.dolly).toBeLessThan(1);
    expect(Math.abs(stage.camera.settleFrom.azimuth)).toBeLessThan(0.5);

    // A fixed backdrop, and a ground colour behind its edges. The orbit
    // is BOUNDED rather than faded — bounds cannot pop.
    expect(stage.backdrop.voidColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(stage.backdrop.overscan).toBeGreaterThan(0);
    expect(stage.backdrop.aspect).toBeGreaterThan(1);
    expect(stage.camera.minPolarAngle).toBeGreaterThan(0);
    expect(stage.camera.minPolarAngle).toBeLessThan(stage.camera.maxPolarAngle);
  });
});

describe("the last frame is the stage", () => {
  it.each(PRESENTATIONS.filter((stage) => stage.intro).map((stage) => stage.id))(
    "%s: the backdrop is the intro's own final frame",
    (id) => {
      const stage = PRESENTATIONS.find((entry) => entry.id === id)!;
      const intro = stage.intro!;

      // Both files exist, and they are the two halves of ONE asset: same
      // directory, same version, one derived from the other.
      const video = asFile(intro.sourceVideo);
      const backdrop = asFile(stage.backdrop.image);
      expect(statSync(video).size, "the source footage ships").toBeGreaterThan(10_000);
      expect(statSync(backdrop).size, "so does its final frame").toBeGreaterThan(10_000);
      const dirOf = (file: string) =>
        file.slice(0, file.lastIndexOf("\\") + 1) || file.slice(0, file.lastIndexOf("/") + 1);
      expect(dirOf(backdrop)).toBe(dirOf(video));

      // The record on disk says the same thing the config does. It is the
      // record the frame script reads, so footage swapped there and not
      // here would hand over to a picture of somewhere else.
      const record = JSON.parse(
        readFileSync(join(video.slice(0, video.lastIndexOf("\\")), "asset.json"), "utf8"),
      ) as {
        id: string;
        media: { video: string; backdrop: string };
        timing: { duration: number; startsAt: number; lastFrameAt: number };
      };
      expect(record.id).toBe(intro.assetId);
      expect(record.media.video).toBe(intro.sourceVideo);
      expect(record.media.backdrop).toBe(stage.backdrop.image);

      /**
       * THE STRIP ENDS ON THE BACKDROP.
       *
       * Every still but the last is a file of its own; the last one is
       * the stage's own backdrop, which is what makes arriving one
       * picture giving way to itself. A strip whose count does not match
       * what the extractor wrote would either skip a still or reach for
       * one that is not there.
       */
      const frameDir = asFile(intro.frames.dir);
      const stills = readdirSync(frameDir).filter((name) => name.endsWith(".jpg")).sort();
      expect(stills.length).toBe(intro.frames.count - 1);
      expect(stills[0]).toBe("000.jpg");
      for (const still of stills) {
        expect(statSync(join(frameDir, still)).size).toBeGreaterThan(5_000);
      }
      expect(intro.frames.width).toBeGreaterThan(640);
      expect(intro.frames.height).toBeGreaterThan(360);

      // And the approach is a journey with a length, not a number of
      // frames: the customer scrolls it.
      expect(intro.travelPx).toBeGreaterThan(400);
      expect(intro.reducedTravelPx).toBeGreaterThan(0);
      expect(intro.reducedTravelPx).toBeLessThan(intro.travelPx);
      expect(intro.handoverMs).toBeGreaterThan(0);
      expect(intro.settleMs).toBeGreaterThan(0);
    },
  );
});

describe("a stage is chosen, not built", () => {
  it("gives every deity a stage, including ones nobody has made a room for", () => {
    for (const deity of DEITIES) {
      const stage = getPresentation(deity.id);
      expect(stage, deity.id).toBeDefined();
      expect(stage.camera.position, deity.id).toHaveLength(3);
    }
    // Including one that does not exist: a stage is presentation, and
    // presentation has an answer for anything it is asked to show.
    expect(getPresentation("nobody")).toBeDefined();
    expect(getPresentation()).toBeDefined();
  });

  it("answers the same way every time", () => {
    const first = getPresentation("shiva");
    const second = getPresentation("shiva");
    expect(second).toEqual(first);
    // Deterministic across deities that share the generic stage, too.
    expect(getPresentation("ganesha")).toEqual(getPresentation("vishnu"));
  });

  it("is not part of the character, and does not touch it", () => {
    for (const build of [createDefaultShivaConfiguration, createDefaultGaneshaConfiguration]) {
      const config = build();
      const before = JSON.stringify(config);
      const stage = getPresentation(config.deity);
      expect(JSON.stringify(config), "resolving a stage changed the character").toBe(before);
      // And nothing in the stage names a part, a morph, a pose or a
      // material: those are the character's, and a stage that carried
      // them would be a second place to change them.
      const text = JSON.stringify(stage);
      for (const word of ["morphs", "pose", "attachments", "materials", "parts"]) {
        expect(text, `a stage must not carry ${word}`).not.toContain(word);
      }
      // The one id a stage does carry is its own media's, which lives in
      // the presentation tree and describes no deity.
      if (stage.intro) {
        expect(stage.intro.assetId).toMatch(/^presentation\./);
        expect(stage.deityCompatibility).toBe("any");
      }
    }
  });
});
