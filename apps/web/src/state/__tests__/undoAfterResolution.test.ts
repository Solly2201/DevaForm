/**
 * Undo takes back what the customer did, including what it caused.
 *
 * There is one Trishul and one Sudarshana: choosing one in a second hand
 * moves it, and the hand it left goes empty. That is a change the
 * customer did not type, made by the resolver on their behalf, and the
 * question they will ask next is whether undo gets it back.
 *
 * It does, and for a reason worth protecting: the CONFIGURATION is what
 * the history holds, and the resolution happens downstream of it. One
 * selection is one entry either way, so one undo is one step back — not
 * two, and not a half-step that leaves the other hand empty.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveCharacterPresentation } from "@devaform/asset-system";
import type { SocketId } from "@devaform/character-schema";
import { useEditorStore } from "@/state/editorStore";

const TRISHUL = "shiva.attribute.trishul";
const RIGHT = "arm.frontRight.hand.item" as SocketId;
const LEFT = "arm.frontLeft.hand.item" as SocketId;

function presentedAt(): string[] {
  const resolved = resolveCharacterPresentation(useEditorStore.getState().config);
  return resolved.attachments
    .filter((entry) => entry.asset.id === TRISHUL)
    .map((entry) => entry.requestedSocket as string);
}

describe("history records decisions and coalesces gestures", () => {
  beforeEach(() => {
    useEditorStore.getState().switchDeity("shiva");
    useEditorStore.temporal.getState().clear();
  });

  /**
   * TWO CLICKS ARE TWO DECISIONS.
   *
   * History throttled every change on a three-hundred-millisecond
   * leading edge, for the sake of slider drags. Picker cards sit next to
   * each other, so two choices made quickly produced one entry and the
   * second could not be undone — and the first choice made within that
   * window of anything else was not recorded at all, which is this test
   * in its simplest form: it runs in one tick.
   */
  it("two choices in the same tick are two steps back", () => {
    const start = useEditorStore.getState().config.attachments.length;
    useEditorStore.getState().setAttachment(RIGHT, TRISHUL);
    useEditorStore.getState().setAttachment(LEFT, "shiva.attribute.damaru");
    expect(useEditorStore.temporal.getState().pastStates.length).toBe(2);
    expect(start).toBeGreaterThan(0);
  });

  /** A drag is one gesture, however many frames it sends. */
  it("a slider drag is one step back", () => {
    for (let i = 1; i <= 12; i += 1) useEditorStore.getState().setMorph("bodyLean", i / 12);
    expect(useEditorStore.temporal.getState().pastStates.length).toBe(1);
  });
});

describe("undo after the resolver moves a singleton", () => {
  beforeEach(() => {
    useEditorStore.getState().switchDeity("shiva");
    useEditorStore.temporal.getState().clear();
  });

  it("there is one of it, and it is where it was last chosen", () => {
    useEditorStore.getState().setAttachment(RIGHT, TRISHUL);
    expect(presentedAt()).toEqual([RIGHT]);

    useEditorStore.getState().setAttachment(LEFT, TRISHUL);
    expect(presentedAt(), "one Trishul, in the hand chosen last").toEqual([LEFT]);
  });

  it("one undo puts it back in the hand it came from", () => {
    useEditorStore.getState().setAttachment(RIGHT, TRISHUL);
    const before = JSON.stringify(useEditorStore.getState().config);

    useEditorStore.getState().setAttachment(LEFT, TRISHUL);
    expect(presentedAt()).toEqual([LEFT]);

    useEditorStore.temporal.getState().undo();
    expect(
      JSON.stringify(useEditorStore.getState().config),
      "the configuration is exactly what it was",
    ).toBe(before);
    expect(presentedAt(), "and so is the figure").toEqual([RIGHT]);
  });

  it("redo puts it back where it was moved to", () => {
    useEditorStore.getState().setAttachment(RIGHT, TRISHUL);
    useEditorStore.getState().setAttachment(LEFT, TRISHUL);
    useEditorStore.temporal.getState().undo();
    useEditorStore.temporal.getState().redo();
    expect(presentedAt()).toEqual([LEFT]);
  });
});
