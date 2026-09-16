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
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
} from "@devaform/character-schema";
import { DEITIES } from "../deities";
import { getPresentation, PRESENTATIONS } from "../stage";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "..", "apps", "web", "public");
const asFile = (url: string) => join(PUBLIC_DIR, url.replace(/^\//, ""));

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

    // A room that goes away when the camera leaves the angle it is true
    // from, and a colour to go away TO.
    expect(stage.backdrop.recedeWithin).toBeGreaterThan(0);
    expect(stage.backdrop.voidColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(stage.backdrop.overscan).toBeGreaterThan(0);
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
      const video = asFile(intro.video);
      const backdrop = asFile(stage.backdrop.image);
      expect(statSync(video).size, "the intro video ships").toBeGreaterThan(10_000);
      expect(statSync(backdrop).size, "so does its final frame").toBeGreaterThan(10_000);
      expect(
        backdrop.slice(0, backdrop.lastIndexOf("\\") + 1) ||
          backdrop.slice(0, backdrop.lastIndexOf("/") + 1),
      ).toBe(
        video.slice(0, video.lastIndexOf("\\") + 1) || video.slice(0, video.lastIndexOf("/") + 1),
      );

      // The record on disk says the same thing the config does. It is the
      // record the poster script reads, so a video swapped there and not
      // here would hand over to a picture of somewhere else.
      const record = JSON.parse(
        readFileSync(join(video.slice(0, video.lastIndexOf("\\")), "asset.json"), "utf8"),
      ) as {
        id: string;
        media: { video: string; backdrop: string };
        timing: { duration: number; startsAt: number; lastFrameAt: number };
      };
      expect(record.id).toBe(intro.assetId);
      expect(record.media.video).toBe(intro.video);
      expect(record.media.backdrop).toBe(stage.backdrop.image);
      expect(record.timing.startsAt).toBe(intro.startsAt);
      expect(record.timing.lastFrameAt).toBe(intro.lastFrameAt);

      // And the timings are a sequence rather than three numbers.
      expect(intro.startsAt).toBeGreaterThanOrEqual(0);
      expect(intro.startsAt).toBeLessThan(intro.lastFrameAt);
      expect(intro.lastFrameAt).toBeLessThanOrEqual(record.timing.duration);
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
