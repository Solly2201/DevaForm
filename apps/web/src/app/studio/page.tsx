import { Suspense } from "react";
import { StudioClient } from "./StudioClient";

export const metadata = {
  title: "DevaForm | Divine Studio",
};

/**
 * The canonical editor.
 *
 * One address for the product. Which divine form is being made is state
 * inside it, not the identity of the page — see StudioClient. Suspended
 * because the client reads the query string, which a prerender cannot
 * know, and without this the production build stops here.
 */
export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <StudioClient />
    </Suspense>
  );
}
