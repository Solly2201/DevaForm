/**
 * Which layer a thing on the stage belongs to.
 *
 * Two, and the difference is what each is LIT BY: the figure by the
 * lighting preset the customer chose, the room by the lamps that stand in
 * it. See StageRender for why that requires two passes rather than two
 * sets of light layers — three.js gathers lights per render camera, so a
 * camera that sees both layers gathers both rigs.
 *
 * Here rather than in either component, because both need it and neither
 * owns it; a constant defined in the thing that uses it first is a
 * constant the other one re-declares.
 */

/** The figure, its base, and the contact shadow under it. */
export const CHARACTER_LAYER = 0;

/** The sanctum: floor, mandala, colonnade, wall, oculus and lamps. */
export const STAGE_LAYER = 1;
