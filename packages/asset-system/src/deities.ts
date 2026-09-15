/**
 * Deity definition system.
 *
 * Divine Studio is deity-agnostic: everything deity-specific — assets,
 * editor categories, pose presets, arm options, defaults — is carried by a
 * DeityDefinition. The engine and UI consume whichever definition the
 * route selects; adding a deity is primarily a matter of authoring a new
 * definition plus its asset manifest.
 *
 * Ganesha and Shiva are available; the others are declared as roadmap
 * entries so the product can present them honestly as "coming soon"
 * without pretending they work.
 */
import {
  GANESHA_SKELETON,
  HUMANOID_SKELETON,
  POSE_PRESETS,
  SHIVA_POSE_PRESETS,
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  getSkeleton,
  type CharacterConfiguration,
  type PosePreset,
  type SkeletonDefinition,
} from "@devaform/character-schema";
import { GANESHA_EDITOR_CATEGORIES, SHIVA_EDITOR_CATEGORIES } from "./categories";
import { GANESHA_ASSETS } from "./manifests/ganesha";
import { SHIVA_ASSETS } from "./manifests/shiva";
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

/**
 * A silhouette, expressed as morph weights rather than as another mesh.
 *
 * `references/ref3.png` shows Classic, Ascetic and Mahayogi as three
 * builds of ONE figure, which is what they are: the same anatomy at
 * different girths. Shipping them as three body assets would be three
 * copies of one mesh's measurements, and §20 of the brief is explicit
 * that the registry does not duplicate an asset to express a variation.
 */
export interface BodyVariant {
  id: string;
  label: string;
  description: string;
  /** Morph weights this variant sets. Keys are the body's own targets. */
  morphs: Readonly<Record<string, number>>;
}

export interface AvailableDeity extends DeityDefinitionBase {
  available: true;
  assets: readonly AssetDefinition[];
  categories: readonly EditorCategory[];
  /** The skeleton (joints + sockets) this deity's rig is built from. */
  skeleton: SkeletonDefinition;
  posePresets: readonly PosePreset[];
  /**
   * Arm configurations this deity's ICONOGRAPHY supports. What a given
   * configuration can actually render is this narrowed to the arms the
   * selected body has — see `armOptionsFor`, which the editor uses, so a
   * two-armed body is never offered a second pair.
   */
  armOptions: readonly (2 | 4)[];
  /** Builds offered for this deity, as morph presets on one body. */
  bodyVariants?: readonly BodyVariant[];
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
  skeleton: GANESHA_SKELETON,
  posePresets: POSE_PRESETS,
  armOptions: [4, 2],
  createDefaultConfiguration: createDefaultGaneshaConfiguration,
};

/**
 * The three builds the reference sheet shows, as weights on the human
 * body's own morph targets. Judged at these values against ref3: heroic
 * at 0.85 is strong and tapered, and at 1.0 the deltoids read inflated.
 */
const SHIVA_BODY_VARIANTS: readonly BodyVariant[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Well-proportioned — broad shoulders, taut waist.",
    morphs: { bodyHeroic: 0.85, bodyPowerful: 0.35, bodyAscetic: 0.3, faceDivine: 1 },
  },
  {
    id: "ascetic",
    label: "Ascetic",
    description: "The lean tapasvin of the mountain.",
    morphs: { bodyHeroic: 0.5, bodyPowerful: 0, bodyAscetic: 1, bodyLean: 0.5, faceDivine: 1 },
  },
  {
    id: "mahayogi",
    label: "Mahayogi",
    description: "More defined and muscular.",
    morphs: { bodyHeroic: 1, bodyPowerful: 0.8, bodyAscetic: 0.1, faceDivine: 1 },
  },
];

const shiva: AvailableDeity = {
  id: "shiva",
  name: "Shiva",
  epithet: "The Auspicious One",
  description:
    "The great ascetic and cosmic dancer. Jata, crescent, third eye, rudraksha, trishul and damaru — the Mahadeva in your form.",
  accent: "#60a5fa",
  available: true,
  assets: SHIVA_ASSETS,
  categories: SHIVA_EDITOR_CATEGORIES,
  skeleton: HUMANOID_SKELETON,
  posePresets: SHIVA_POSE_PRESETS,
  armOptions: [2, 4],
  bodyVariants: SHIVA_BODY_VARIANTS,
  createDefaultConfiguration: createDefaultShivaConfiguration,
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
  shiva,
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

/**
 * Arm counts this deity can actually render on this body.
 *
 * Iconography is one question and anatomy is another. Shiva is shown with
 * two arms and with four; the human mesh has two. Offering the customer a
 * second pair that the body cannot grow is how an attribute ends up on a
 * hand seven centimetres from where any hand is — so the editor asks
 * here, and the answer comes from the body's own skeleton.
 */
export function armOptionsFor(
  deity: AvailableDeity,
  body: AssetDefinition | undefined,
): readonly (2 | 4)[] {
  const skeleton = body?.skeleton ? getSkeleton(body.skeleton) : undefined;
  const available = (skeleton ?? deity.skeleton).armSlots.length;
  return deity.armOptions.filter((count) => count <= available);
}

/** The morph weights a named body variant sets, if the deity has one. */
export function bodyVariantMorphs(
  deity: AvailableDeity,
  variantId: string,
): Readonly<Record<string, number>> | undefined {
  return deity.bodyVariants?.find((variant) => variant.id === variantId)?.morphs;
}
