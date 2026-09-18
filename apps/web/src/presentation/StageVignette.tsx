"use client";

/**
 * The frame's own edge.
 *
 * A fixed fullscreen layer between the backdrop and the Studio shell —
 * the same stack the entry draws its own copy of, so what the entry
 * shows and what it reveals are graded identically. The hall is lit by a
 * single shaft from its oculus; its corners are not part of the
 * composition, and the statue standing in the middle of it is.
 *
 * It sits UNDER the canvas: the chrome panels are opaque and would be
 * darkened by anything above them, and the statue itself should not be
 * vignetted — it is the subject, not the room.
 */
export function StageVignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        background:
          "radial-gradient(118% 88% at 50% 44%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.42) 72%, rgba(0,0,0,0.72) 100%)",
      }}
    />
  );
}
