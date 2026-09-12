/**
 * Deity definition system.
 *
 * Divine Studio is deity-agnostic: everything deity-specific — assets,
 * editor categories, pose presets, arm options, defaults — is carried by a
 * DeityDefinition. The engine and UI consume whichever definition the
 * route selects; adding a deity is primarily a matter of authoring a new
 * definition plus its asset manifest.
 *
 * Ganesha is the first (and currently only) available deity. The others
 * are declared as roadmap entries so the product can present them honestly
 * as "coming soon" without pretending they work.
 */
import {
  POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  type CharacterConfiguration,
  type PosePreset,
} from "@devaform/character-schema";
import { GANESHA_EDITOR_CATEGORIES } from "./categories";
import { GANESHA_ASSETS } from "./manifests/ganesha";
import type { AssetDefinition, EditorCategory } from "./types";

interface DeityDefinitionBase {
  id: string;
  name: string;
  /** Short devotional epithet shown under the name. */
  epithet: string;
  description: string;
  /** Accent color used on deity cards. */
  accent: string;
}

export interface AvailableDeity extends DeityDefinitionBase {
  available: true;
  assets: readonly AssetDefinition[];
  categories: readonly EditorCategory[];
  posePresets: readonly PosePreset[];
  /** Arm configurations this deity supports (rendered pairs). */
  armOptions: readonly (2 | 4)[];
  createDefaultConfiguration: () => CharacterConfiguration;
}

export interface UpcomingDeity extends DeityDefinitionBase {
  available: false;
}

export type DeityDefinition = AvailableDeity | UpcomingDeity;

const ganesha: AvailableDeity = {
  id: "ganesha",
  name: "Ganesha",
  epithet: "Remover of Obstacles",
  description:
    "The elephant-headed lord of beginnings and wisdom. Customize his form, mudras, attributes, ornaments and asana.",
  accent: "#f59e0b",
  available: true,
  assets: GANESHA_ASSETS,
  categories: GANESHA_EDITOR_CATEGORIES,
  posePresets: POSE_PRESETS,
  armOptions: [4, 2],
  createDefaultConfiguration: createDefaultGaneshaConfiguration,
};

const upcoming = (
  id: string,
  name: string,
  epithet: string,
  description: string,
  accent: string,
): UpcomingDeity => ({ id, name, epithet, description, accent, available: false });

export const DEITIES: readonly DeityDefinition[] = [
  ganesha,
  upcoming("shiva", "Shiva", "The Auspicious One", "The great ascetic and cosmic dancer.", "#60a5fa"),
  upcoming("durga", "Durga", "The Invincible", "The fierce mother astride the lion.", "#f87171"),
  upcoming("krishna", "Krishna", "The All-Attractive", "The divine cowherd with the flute.", "#818cf8"),
  upcoming("hanuman", "Hanuman", "The Devoted", "The mighty devotee of Rama.", "#fb923c"),
  upcoming("lakshmi", "Lakshmi", "Goddess of Fortune", "The lotus-seated bestower of prosperity.", "#f472b6"),
  upcoming("saraswati", "Saraswati", "Goddess of Wisdom", "The veena-playing muse of knowledge and arts.", "#a3e635"),
] as const;

const deityMap = new Map(DEITIES.map((d) => [d.id, d]));

export function getDeity(id: string): DeityDefinition | undefined {
  return deityMap.get(id);
}

export function getAvailableDeity(id: string): AvailableDeity | undefined {
  const deity = deityMap.get(id);
  return deity?.available ? deity : undefined;
}

export const AVAILABLE_DEITIES: readonly AvailableDeity[] = DEITIES.filter(
  (d): d is AvailableDeity => d.available,
);
