/**
 * Where the product's addresses lead.
 *
 * The Studio is the product, and /studio is its one address. That claim
 * is made in three separate files — the root route, the legacy
 * /studio/<deity> route, and the navigation that links to them — and a
 * claim spread over three files is a claim that drifts. These tests are
 * the one place it is held to account.
 *
 * Deliberately about DESTINATIONS rather than markup: a redirect that
 * lands somewhere else is a broken front door, and no amount of rendering
 * a page correctly makes up for it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const redirected: string[] = [];

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected.push(to);
    // The real one throws to unwind the render; nothing here needs that,
    // and swallowing it would let a route redirect twice unnoticed.
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const src = path.resolve(__dirname, "..");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

async function landing(page: () => unknown | Promise<unknown>): Promise<string> {
  redirected.length = 0;
  // A synchronous route throws before there is a promise to catch on, so
  // both shapes are handled here rather than at each call site.
  const swallow = (error: unknown) => {
    if (!(error instanceof Error) || !error.message.startsWith("NEXT_REDIRECT:")) throw error;
  };
  try {
    await Promise.resolve(page()).catch(swallow);
  } catch (error) {
    swallow(error);
  }
  expect(redirected).toHaveLength(1);
  return redirected[0]!;
}

describe("the product's front door", () => {
  beforeEach(() => {
    redirected.length = 0;
  });

  it("the root is the Studio", async () => {
    const { default: RootRoute } = await import("@/app/page");
    expect(await landing(RootRoute)).toBe("/studio");
  });

  it("an old deity route carries its form into the one Studio", async () => {
    const { default: LegacyStudioRoute } = await import("@/app/studio/[deity]/page");
    expect(
      await landing(() => LegacyStudioRoute({ params: Promise.resolve({ deity: "shiva" }) })),
    ).toBe("/studio?form=shiva");
    expect(
      await landing(() => LegacyStudioRoute({ params: Promise.resolve({ deity: "vishnu" }) })),
    ).toBe("/studio?form=vishnu");
  });

  it("an unknown or unreleased form still opens the Studio", async () => {
    const { default: LegacyStudioRoute } = await import("@/app/studio/[deity]/page");
    // There is always something to make.
    expect(
      await landing(() => LegacyStudioRoute({ params: Promise.resolve({ deity: "nobody" }) })),
    ).toBe("/studio");
    expect(
      await landing(() => LegacyStudioRoute({ params: Promise.resolve({ deity: "durga" }) })),
    ).toBe("/studio");
  });

  /**
   * The root renders NOTHING.
   *
   * A root that both redirects and has a page to show is a second landing
   * page waiting to be re-enabled by anyone who does not read the
   * comment. If this file ever grows markup again, that is the decision
   * being reversed, and it should be reversed deliberately.
   */
  it("the root has no page of its own to fall back to", () => {
    const source = read("app/page.tsx");
    expect(source).not.toMatch(/<(div|section|main|header)[\s>]/);
    expect(source).toMatch(/redirect\("\/studio"\)/);
  });

  /**
   * Nothing navigates a customer back to a landing page that is gone.
   *
   * `href="/"` still WORKS — it redirects — but from inside the Studio it
   * is a full reload of the editor the customer is already in, which
   * discards unsaved work on a click that promised nothing. The Studio's
   * own brand is therefore not a link at all, and every other surface
   * names /studio directly rather than paying for a bounce.
   */
  it("no customer-facing surface links to the old landing page", () => {
    for (const file of [
      "components/site/SiteNav.tsx",
      "components/editor/TopBar.tsx",
      "app/deities/page.tsx",
      "app/library/page.tsx",
      "app/account/page.tsx",
    ]) {
      expect(read(file), file).not.toContain('href="/"');
    }
  });
});
