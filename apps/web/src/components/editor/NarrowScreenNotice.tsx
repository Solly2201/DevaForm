"use client";

/**
 * What a narrow screen is told, instead of being shown a broken Studio.
 *
 * MEASURED, not guessed. `scripts/qa-responsive.mjs` opens the Studio at
 * seven sizes and asks four things of each: does the page scroll
 * sideways, does the statue get enough of the window to be worth looking
 * at, are the controls reachable, is anything drawn off the edge. Down to
 * 1024 pixels every answer is yes. At 768 the page gained 47 pixels of
 * horizontal scroll, Save sat off the right-hand edge, and a button was
 * drawn outside the window. At 390 the tool panel was 156 pixels wide and
 * six kinds of element had left the screen.
 *
 * So the Studio is a desktop application, and the honest thing is to say
 * so. It is a three-column layout around a 3D viewport with a 480-pixel
 * tool panel; there is no arrangement of those on a phone that is not a
 * compromise, and a half-working editor with Save off-screen is a worse
 * thing to hand somebody than a sentence explaining what they need.
 *
 * The SHARE page is the one that gets opened on a phone — it is what
 * arrives in a message — and that one is built for it and measured at
 * 390 pixels. This notice points there.
 *
 * It is a last resort rather than a first one: the threshold is below
 * every width that works, so nobody who could have used the Studio is
 * turned away from it.
 */
export function NarrowScreenNotice() {
  return (
    <div
      data-testid="narrow-screen-notice"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface-950 px-8 text-center lg:hidden"
    >
      <span className="font-display text-2xl font-semibold tracking-wide text-saffron-500">
        DevaForm
      </span>
      <h1 className="font-display text-lg text-stone-100">
        The Divine Studio needs a wider window
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-stone-400">
        Sculpting a murti takes a viewport and a tool panel side by side. On a laptop or a
        desktop you get both; here, one of them would be a sliver.
      </p>
      <p className="max-w-sm text-xs leading-relaxed text-stone-500">
        Open this page on a wider screen — about 1024 pixels is enough — and the Studio is
        waiting. A creation someone has shared with you opens fine on this one.
      </p>
    </div>
  );
}
