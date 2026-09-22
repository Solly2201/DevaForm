"use client";

/**
 * The frame's own edge.
 *
 * A lens effect over the viewport — the same edge the entry draws its
 * own copy of, so what the entry shows and what it reveals are graded
 * alike. The hall is lit by a single shaft from its oculus; its corners
 * are not part of the composition, and the statue in the middle of it
 * is.
 *
 * Over the CANVAS and inside it, not fixed over the window: the room is
 * geometry now, so the canvas is opaque and a layer beneath it would
 * never be seen — and the Studio's own panels are not part of the
 * photograph and must not be darkened by it.
 */
export function StageVignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(118% 88% at 50% 44%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.42) 72%, rgba(0,0,0,0.72) 100%)",
      }}
    />
  );
}
