/**
 * Editor categories for the Ganesha editor. Pure data — the sidebar and
 * customization panel render from this, so adding a category never means
 * writing a new bespoke screen.
 */
import { HAND_ITEM_SOCKETS } from "@devaform/character-schema";
import type { EditorCategory } from "./types";

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
      sockets: ["head.crown", "head.forehead", "chest.necklace", "waist.ornament"],
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
