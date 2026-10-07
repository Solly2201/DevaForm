/**
 * A deployment does not serve the QA harness.
 *
 * `/dev/qa`, `/dev/assets` and `/dev/skinned` are App Router pages, so
 * `next build` builds them and `next start` serves them — measured
 * against the shipped build, all three answered 200 to anybody who asked.
 * They are instruments rather than secrets, and the risk is not that they
 * leak something; it is that the product has a seam in it, and a visitor
 * who finds a fixed-camera rig or an asset inspector has found the
 * workshop rather than the shop.
 *
 * They are not deleted, because the audits are made of them. So the rule
 * is a switch, and this is the rule: off in production unless a server is
 * deliberately started with DEVAFORM_DEV_ROUTES=1, which is what
 * `pnpm start:qa` does and what a deployment must not do.
 *
 * Asked of the middleware directly rather than over HTTP, so it is part
 * of the suite rather than something somebody has to remember to check
 * against a running server.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "../middleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

const ask = (path: string) => middleware(new NextRequest(`http://localhost:3000${path}`));

/** Vitest runs with NODE_ENV=test, so each case states the one it means. */
function asProduction(devRoutes?: string) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEVAFORM_DEV_ROUTES", devRoutes ?? "");
}

describe("the workshop is not part of the shop", () => {
  it("only the dev routes are intercepted at all", () => {
    expect(config.matcher).toBe("/dev/:path*");
  });

  it.each(["/dev/qa", "/dev/assets", "/dev/skinned", "/dev/thumbnail/ganesha.head.classic"])(
    "a production server does not serve %s",
    (path) => {
      asProduction();
      expect(ask(path).status).toBe(404);
    },
  );

  it("a server started for QA does serve them", () => {
    asProduction("1");
    // `NextResponse.next()` is a pass-through, which is a 200 carrying the
    // instruction to continue rather than a rendered page.
    expect(ask("/dev/qa").status).toBe(200);
  });

  it("and `next dev` serves them without anyone setting anything", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEVAFORM_DEV_ROUTES", "");
    expect(ask("/dev/qa").status).toBe(200);
  });

  /**
   * Anything other than "1" is not permission. A deployment that happens
   * to carry the variable with an empty or leftover value is a deployment
   * that did not ask for this.
   */
  it.each(["", "0", "false", "true", "yes"])("%o is not permission", (value) => {
    asProduction(value);
    expect(ask("/dev/qa").status).toBe(value === "1" ? 200 : 404);
  });
});
