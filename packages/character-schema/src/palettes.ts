/**
 * Material palette presets — complete, culturally grounded zone/material
 * combinations applied in one action. Each is a full MaterialsConfiguration
 * so applying a palette is deterministic and undoable.
 */
import type { MaterialsConfiguration } from "./configuration";

export interface MaterialPalette {
  id: string;
  label: string;
  description: string;
  materials: MaterialsConfiguration;
}

export const MATERIAL_PALETTES: readonly MaterialPalette[] = [
  {
    id: "traditionalGold",
    label: "Traditional",
    description: "Warm skin, red silk dhoti, polished gold ornaments.",
    materials: {
      skin: { color: "#d99a63", finish: "satin" },
      skinSecondary: { color: "#b97946", finish: "satin" },
      garment: { color: "#9c1c20", finish: "satin" },
      garmentAccent: { color: "#d99b26", finish: "satin" },
      metal: { color: "#e8ae32", finish: "metallic" },
      gem: { color: "#b81e2d", finish: "polished" },
      base: { color: "#7d5c3a", finish: "satin" },
    },
  },
  {
    id: "templeGold",
    label: "Temple Gold",
    description: "Full gold-cast statue with deep red accents.",
    materials: {
      skin: { color: "#e7b13f", finish: "metallic" },
      skinSecondary: { color: "#c98f2e", finish: "metallic" },
      garment: { color: "#b3822a", finish: "metallic" },
      garmentAccent: { color: "#8f1f1f", finish: "satin" },
      metal: { color: "#f3c14a", finish: "metallic" },
      gem: { color: "#20643f", finish: "polished" },
      base: { color: "#a5813a", finish: "metallic" },
    },
  },
  {
    id: "ivory",
    label: "Ivory",
    description: "Carved ivory look with muted gold.",
    materials: {
      skin: { color: "#efe3cd", finish: "polished" },
      skinSecondary: { color: "#dccbaa", finish: "polished" },
      garment: { color: "#d9c49a", finish: "satin" },
      garmentAccent: { color: "#c2a368", finish: "satin" },
      metal: { color: "#cfae62", finish: "metallic" },
      gem: { color: "#8c3a2e", finish: "polished" },
      base: { color: "#d9cdb4", finish: "polished" },
    },
  },
  {
    id: "terracotta",
    label: "Terracotta",
    description: "Earthen clay statue with natural tones.",
    materials: {
      skin: { color: "#b96a45", finish: "matte" },
      skinSecondary: { color: "#a05539", finish: "matte" },
      garment: { color: "#8c4a2f", finish: "matte" },
      garmentAccent: { color: "#c9862e", finish: "matte" },
      metal: { color: "#b78a3f", finish: "satin" },
      gem: { color: "#7d3324", finish: "satin" },
      base: { color: "#96593c", finish: "matte" },
    },
  },
  {
    id: "saffron",
    label: "Saffron",
    description: "Sindoor-coated Ganesha in vivid saffron.",
    materials: {
      skin: { color: "#e2602c", finish: "satin" },
      skinSecondary: { color: "#c94e22", finish: "satin" },
      garment: { color: "#e0a422", finish: "satin" },
      garmentAccent: { color: "#f2d06b", finish: "satin" },
      metal: { color: "#efc04a", finish: "metallic" },
      gem: { color: "#207a4a", finish: "polished" },
      base: { color: "#7c5233", finish: "matte" },
    },
  },
  {
    id: "royalBlue",
    label: "Royal Blue",
    description: "Deep blue silks with bright gold jewellery.",
    materials: {
      skin: { color: "#e9b98d", finish: "satin" },
      skinSecondary: { color: "#d69a72", finish: "satin" },
      garment: { color: "#1f3a8f", finish: "satin" },
      garmentAccent: { color: "#e8b83c", finish: "satin" },
      metal: { color: "#f0bd45", finish: "metallic" },
      gem: { color: "#12406e", finish: "polished" },
      base: { color: "#3a3f57", finish: "satin" },
    },
  },
  {
    id: "whiteMarble",
    label: "Marble",
    description: "Polished white marble with subtle veined grey base.",
    materials: {
      skin: { color: "#f2efe9", finish: "polished" },
      skinSecondary: { color: "#e0dcd2", finish: "polished" },
      garment: { color: "#d8d4ca", finish: "polished" },
      garmentAccent: { color: "#bfb8a6", finish: "polished" },
      metal: { color: "#d6c187", finish: "metallic" },
      gem: { color: "#5f6c7d", finish: "polished" },
      base: { color: "#cac6bd", finish: "polished" },
    },
  },
  {
    id: "blackStone",
    label: "Black Stone",
    description: "Dark granite statue with antique gold.",
    materials: {
      skin: { color: "#35322f", finish: "polished" },
      skinSecondary: { color: "#2a2724", finish: "polished" },
      garment: { color: "#413c36", finish: "satin" },
      garmentAccent: { color: "#8f7434", finish: "metallic" },
      metal: { color: "#a8873c", finish: "metallic" },
      gem: { color: "#6e1f1f", finish: "polished" },
      base: { color: "#2e2b28", finish: "polished" },
    },
  },
] as const;

export function getPalette(id: string): MaterialPalette | undefined {
  return MATERIAL_PALETTES.find((p) => p.id === id);
}
