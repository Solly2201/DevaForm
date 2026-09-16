"use client";

/**
 * The frame's own edge, over everything.
 *
 * Above the video AND the stage, because both are the same picture and
 * anything applied to one of them alone is a step the eye catches exactly
 * where there must not be one. It is also the right place for it: the
 * hall is lit by a single shaft from its oculus, so its corners are not
 * part of the composition, and the statue standing in the middle of it is.
 */
export function StageVignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30"
      style={{
        background:
          "radial-gradient(118% 88% at 50% 44%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.42) 72%, rgba(0,0,0,0.72) 100%)",
      }}
    />
  );
}
