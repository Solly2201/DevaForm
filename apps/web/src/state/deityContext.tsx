"use client";

/**
 * Deity context — hands the active DeityDefinition to every editor
 * component. The studio itself never imports a specific deity; the route
 * decides which definition is active.
 */
import { createContext, useContext } from "react";
import type { AvailableDeity } from "@devaform/asset-system";

const DeityContext = createContext<AvailableDeity | null>(null);

export function DeityProvider({
  deity,
  children,
}: {
  deity: AvailableDeity;
  children: React.ReactNode;
}) {
  return <DeityContext.Provider value={deity}>{children}</DeityContext.Provider>;
}

export function useDeity(): AvailableDeity {
  const deity = useContext(DeityContext);
  if (!deity) {
    throw new Error("useDeity must be used inside a DeityProvider (Divine Studio route)");
  }
  return deity;
}
