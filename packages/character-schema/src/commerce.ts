/**
 * Commerce data model (Phase E architecture).
 *
 * These types define the order-flow contract before payment/manufacturing
 * integration exists. The central rule is manufacturing reproducibility:
 * an OrderItem never references "the current look" of a creation — it pins
 * the full configuration plus the exact asset versions and a price
 * snapshot, so an old order can be produced identically years later.
 *
 * Persistence (PostgreSQL tables) and checkout integration are added when
 * commerce goes live; the shapes here are the source of truth for both.
 */
import type { CharacterConfiguration } from "./configuration";

export type StatueSizeId = "s15" | "s23" | "s30";

export interface StatueSize {
  id: StatueSizeId;
  label: string;
  heightMm: number;
}

export const STATUE_SIZES: readonly StatueSize[] = [
  { id: "s15", label: "15 cm", heightMm: 150 },
  { id: "s23", label: "23 cm", heightMm: 230 },
  { id: "s30", label: "30 cm", heightMm: 300 },
] as const;

export type ManufacturingMaterialId = "resin" | "sandstone" | "pla";

export interface ManufacturingMaterial {
  id: ManufacturingMaterialId;
  label: string;
  description: string;
}

export const MANUFACTURING_MATERIALS: readonly ManufacturingMaterial[] = [
  { id: "resin", label: "Premium Resin", description: "Fine detail, hand-paintable." },
  { id: "sandstone", label: "Full-Color Sandstone", description: "Printed in full color." },
  { id: "pla", label: "Museum PLA", description: "Matte, lightweight." },
] as const;

/** A sellable combination; prices are minor units (paise) in INR. */
export interface ProductVariant {
  sizeId: StatueSizeId;
  materialId: ManufacturingMaterialId;
  priceMinor: number;
  currency: "INR";
}

/**
 * Everything manufacturing needs, frozen at order time.
 * `assetVersions` maps assetId → published version used by the
 * configuration (also stored on every CharacterVersion row).
 */
export interface CreationSnapshot {
  creationId: string;
  creationVersionId: string;
  configuration: CharacterConfiguration;
  assetVersions: Record<string, number>;
}

export interface OrderItem {
  id: string;
  snapshot: CreationSnapshot;
  variant: ProductVariant;
  quantity: number;
  /** Price actually charged, frozen even if the variant price changes. */
  priceMinorSnapshot: number;
}

export type OrderStatus =
  | "draft"
  | "awaitingPayment"
  | "paid"
  | "inProduction"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Cart {
  items: Array<Omit<OrderItem, "priceMinorSnapshot">>;
}
