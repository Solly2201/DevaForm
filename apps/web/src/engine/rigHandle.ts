/**
 * Live handle to the currently rendered rig. Set by CharacterRoot; read by
 * export/print tooling that needs the assembled scene graph (STL export,
 * printability analysis) without coupling those tools to React.
 */
import type { CharacterRig } from "./rig";

export const activeRig: { current: CharacterRig | null } = { current: null };
