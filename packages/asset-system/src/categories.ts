/**
 * Editor categories per deity. Pure data — the sidebar and customization
 * panel render from this, so adding a category never means writing a new
 * bespoke screen.
 */
import { HAND_ITEM_SOCKETS } from "@devaform/character-schema";
import type { EditorCategory } from "./types";

/**
 * The form itself, offered in every deity's editor.
 *
 * Divine Studio is ONE editor. Which god is being made is a choice
 * inside it, beside every other choice — not a route a customer has to
 * find their way to. It is declared here rather than repeated in each
 * deity's list because it is the same category for all of them, and the
 * registry of deities is what fills it.
 */
export const DIVINE_FORM_CATEGORY: EditorCategory = {
  id: "form",
  label: "Divine Form",
  icon: "form",
  description: "Which divine form you are creating",
  content: { type: "form" },
};

export const GANESHA_EDITOR_CATEGORIES: readonly EditorCategory[] = [
  {
    id: "head",
    label: "Head",
    icon: "head",
    description: "Head shape and ears",
    content: { type: "parts", slots: ["head", "ears"] },
  },
  {
    id: "face",
    label: "Face",
    icon: "face",
    description: "Eyes, trunk, tusks and face shaping",
    content: { type: "parts", slots: ["eyes", "trunk", "tusks"] },
  },
  {
    id: "body",
    label: "Body",
    icon: "body",
    description: "Build, proportions and arm count",
    content: { type: "parts", slots: ["body"] },
  },
  {
    id: "hands",
    label: "Hands",
    icon: "hands",
    description: "Mudra for each hand",
    content: { type: "hands" },
  },
  {
    id: "clothing",
    label: "Clothing",
    icon: "clothing",
    description: "Dhoti and upper garments",
    content: { type: "parts", slots: ["lowerGarment", "upperGarment"] },
  },
  {
    id: "ornaments",
    label: "Ornaments",
    icon: "ornaments",
    description: "Crown, jewellery and ornament sets",
    content: {
      type: "mixed",
      slots: ["earrings", "armlets", "bracelets", "anklets"],
      sockets: ["head.crown", "head.forehead", "chest.necklace", "chest.mala", "waist.ornament"],
      allowNone: true,
    },
  },
  {
    id: "attributes",
    label: "Attributes",
    icon: "attributes",
    description: "Items held in each hand and the trunk",
    content: { type: "sockets", sockets: [...HAND_ITEM_SOCKETS, "trunk.tip"], allowNone: true },
  },
  {
    id: "companion",
    label: "Companion",
    icon: "companion",
    description: "Vahana and base companions",
    content: { type: "sockets", sockets: ["base.platform"], allowNone: true },
  },
  {
    id: "pose",
    label: "Pose",
    icon: "pose",
    description: "Pose presets and joint control",
    content: { type: "pose" },
  },
  {
    id: "color",
    label: "Color",
    icon: "color",
    description: "Palettes, colors and finishes",
    content: { type: "materials" },
  },
  {
    id: "base",
    label: "Base",
    icon: "base",
    description: "Statue base / platform",
    content: { type: "base" },
  },
] as const;

export const SHIVA_EDITOR_CATEGORIES: readonly EditorCategory[] = [
  {
    id: "head",
    label: "Head",
    icon: "head",
    description: "Head and matted jata",
    content: { type: "parts", slots: ["head", "hair"] },
  },
  {
    id: "face",
    label: "Face",
    icon: "face",
    description: "Eyes, third eye and face shaping",
    content: { type: "mixed", slots: ["eyes"], sockets: ["head.forehead"], allowNone: true },
  },
  {
    id: "body",
    label: "Body",
    icon: "body",
    description: "Build, proportions and arm count",
    content: { type: "parts", slots: ["body"] },
  },
  {
    id: "hands",
    label: "Hands",
    icon: "hands",
    description: "Mudra for each hand",
    content: { type: "hands" },
  },
  {
    id: "clothing",
    label: "Clothing",
    icon: "clothing",
    description: "Dhoti and upper drapery",
    content: { type: "parts", slots: ["lowerGarment", "upperGarment"] },
  },
  {
    id: "ornaments",
    label: "Ornaments",
    icon: "ornaments",
    description: "Crescent, rudraksha, serpent and jewellery",
    content: {
      type: "mixed",
      slots: ["earrings", "armlets", "bracelets", "anklets"],
      sockets: ["head.moon", "chest.necklace", "chest.mala", "waist.ornament"],
      allowNone: true,
    },
  },
  {
    id: "attributes",
    label: "Attributes",
    icon: "attributes",
    description: "Trishul, damaru and items held in each hand",
    content: { type: "sockets", sockets: [...HAND_ITEM_SOCKETS], allowNone: true },
  },
  {
    id: "pose",
    label: "Pose",
    icon: "pose",
    description: "Pose presets and joint control",
    content: { type: "pose" },
  },
  {
    id: "color",
    label: "Color",
    icon: "color",
    description: "Palettes, colors and finishes",
    content: { type: "materials" },
  },
  {
    id: "base",
    label: "Base",
    icon: "base",
    description: "Statue base / platform",
    content: { type: "base" },
  },
] as const;

/**
 * Vishnu's editor, prepared.
 *
 * Nothing renders this yet — he is not offered — but the panel is where a
 * deity's iconography meets the UI, and writing it now is what proves the
 * UI needs nothing new to show him. It doesn't: four attributes in four
 * hand sockets, a crown and a garland on sockets the skeleton already
 * has, and the same parts, hands, pose, colour and base screens every
 * deity gets. The only line here that is Vishnu's rather than the
 * system's is the wording.
 */
export const VISHNU_EDITOR_CATEGORIES: readonly EditorCategory[] = [
  {
    id: "head",
    label: "Head",
    icon: "head",
    description: "Head and hair",
    content: { type: "parts", slots: ["head", "hair"] },
  },
  {
    id: "face",
    label: "Face",
    icon: "face",
    description: "Eyes, tilaka and face shaping",
    content: { type: "mixed", slots: ["eyes"], sockets: ["head.forehead"], allowNone: true },
  },
  {
    id: "body",
    label: "Body",
    icon: "body",
    description: "Build, proportions and arm count",
    content: { type: "parts", slots: ["body"] },
  },
  {
    id: "hands",
    label: "Hands",
    icon: "hands",
    description: "Mudra for each hand",
    content: { type: "hands" },
  },
  {
    id: "clothing",
    label: "Clothing",
    icon: "clothing",
    description: "The golden dhoti and its border",
    content: { type: "parts", slots: ["lowerGarment", "upperGarment"] },
  },
  {
    id: "ornaments",
    label: "Ornaments",
    icon: "ornaments",
    description: "Crown, garland and jewellery",
    content: {
      type: "mixed",
      slots: ["earrings", "armlets", "bracelets", "anklets"],
      sockets: ["head.crown", "chest.necklace", "chest.mala", "waist.ornament"],
      allowNone: true,
    },
  },
  {
    id: "attributes",
    label: "Attributes",
    icon: "attributes",
    // Which hand takes which is the customer's: the iconography fixes the
    // set of four, not their arrangement, and the resolver will refuse a
    // combination the body cannot hold rather than the picker hiding it.
    description: "Conch, discus, mace and lotus in each hand",
    content: { type: "sockets", sockets: [...HAND_ITEM_SOCKETS], allowNone: true },
  },
  {
    id: "pose",
    label: "Pose",
    icon: "pose",
    description: "Pose presets and joint control",
    content: { type: "pose" },
  },
  {
    id: "color",
    label: "Color",
    icon: "color",
    description: "Palettes, colors and finishes",
    content: { type: "materials" },
  },
  {
    id: "base",
    label: "Base",
    icon: "base",
    description: "Statue base / platform",
    content: { type: "base" },
  },
] as const;
