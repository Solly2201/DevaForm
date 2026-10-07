import { NextResponse, type NextRequest } from "next/server";

/**
 * The workshop is not part of the shop.
 *
 * `/dev/qa`, `/dev/assets`, `/dev/skinned` and `/dev/thumbnail` are
 * instruments: a fixed-camera rig for the capture sheets, an asset
 * inspector, a skinning spike, and the offscreen renderer the thumbnail
 * generator drives. They are App Router pages, so `next build` builds
 * them and `next start` serves them, and measured against the shipped
 * build all three of the first ones answered 200 to anybody who asked.
 * Nothing there is secret and nothing there is dangerous; it is simply
 * not the product, and a customer who finds a QA harness has found a
 * seam in it.
 *
 * NOT DELETED, because they are the instruments the audits are made of —
 * qa-capture photographs /dev/qa, generate-thumbnails drives
 * /dev/thumbnail, ingest-asset tells an author to look at /dev/assets.
 * Removing them would mean removing the measurements with them.
 *
 * So they are off unless somebody says otherwise. `next dev` keeps them
 * for the obvious reason; a production server has to be started with
 * DEVAFORM_DEV_ROUTES=1 to serve them, which is what the QA harnesses
 * need and what a deployment must not have. The variable is read per
 * request rather than baked in, so one build serves both.
 */
export function middleware(request: NextRequest) {
  const allowed =
    process.env.NODE_ENV !== "production" || process.env.DEVAFORM_DEV_ROUTES === "1";
  if (allowed) return NextResponse.next();
  // The same answer the router gives for a path that was never written,
  // because as far as this deployment is concerned it was not.
  return new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = { matcher: "/dev/:path*" };
