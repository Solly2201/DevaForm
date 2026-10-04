/**
 * What a configuration needs before it can be BUILT.
 *
 * Rig assembly is synchronous and asset loading is not, and for a long
 * time the engine resolved that by building anyway: a rig went up
 * immediately, omitting every mesh that had not arrived, and was rebuilt
 * from scratch when they did. Two builds, the first of which nobody ever
 * sees — and on Ganesha, whose sculpted head is an 84,000-triangle GLB,
 * each one a second of unbroken main-thread work.
 *
 * So the build waits, and this is what it waits FOR. Read off the
 * configuration's own asset references rather than from a resolution,
 * because which GLB an asset is made of is a property of the asset: a
 * resolver may move an attribute from a hand to the ground, and it is the
 * same file either way.
 */
import { resolveAssetRef } from "@devaform/asset-system";
import type { CharacterConfiguration } from "@devaform/character-schema";

/**
 * Every GLB file this configuration will ask for, without duplicates.
 *
 * Order is the order they are first mentioned, so the list is stable for
 * a given configuration and a test can state it.
 */
export function glbPathsFor(config: CharacterConfiguration): string[] {
  const paths = new Set<string>();
  const refs = [
    ...Object.values(config.parts),
    ...config.attachments.map((attachment) => attachment.asset),
  ];
  for (const ref of refs) {
    const source = resolveAssetRef(ref)?.source;
    if (source?.kind === "glb") paths.add(source.path);
  }
  return [...paths];
}
