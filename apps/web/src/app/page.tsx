import { redirect } from "next/navigation";

/**
 * The product's front door, which is the Studio.
 *
 * There used to be a landing page here — a hero, three value cards and a
 * strip of deity tiles — and it stood between a customer and the thing
 * they came for. Everything it said is said better by the product itself:
 * the deity strip is the Divine Form category inside the editor, the
 * catalogue with its descriptions is /deities, and "you can customize,
 * save and share" is a claim a marketing card makes and the Studio simply
 * demonstrates.
 *
 * So the root RESOLVES rather than renders. One canonical address for the
 * editor — /studio — and every way in arrives at it: the root, an old
 * /studio/<deity> link, a deity card, a shared creation. A second page
 * that also rendered the Studio would be a second Studio, and the Studio
 * has spent this repository's whole history becoming one place.
 *
 * Resolved on the server, before anything is sent: the customer's first
 * paint is the Studio's, not a page that then decides to become it.
 */
export default function RootRoute() {
  redirect("/studio");
}
