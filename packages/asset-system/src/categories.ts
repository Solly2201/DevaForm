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
    description: "Trunk, tusks and eyes",
    content: { type: "parts", slots: ["trunk", "tusks", "eyes"] },
  },
  {
    id: "body",
    label: "Body",
    icon: "body",
    description: "Body build and proportions",
    content: { type: "parts", slots: ["body"] },
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
    description: "Crown, necklace and jewellery",
    content: {
      type: "sockets",
      sockets: ["head.crown", "chest.necklace", "waist.ornament"],
      allowNone: true,
    },
  },
  {
    id: "attributes",
    label: "Attributes",
    icon: "attributes",
    description: "Items held in each hand",
    content: { type: "sockets", sockets: [...HAND_ITEM_SOCKETS, "trunk.tip"], allowNone: true },
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
    description: "Skin, garment and metal finishes",
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
