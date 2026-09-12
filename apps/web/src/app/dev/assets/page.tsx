import Link from "next/link";
import { DEITIES, listAssets } from "@devaform/asset-system";

export const metadata = { title: "Asset Registry — DevaForm (internal)" };

/**
 * Internal developer view of the asset registry: what exists, at which
 * version and lifecycle stage, and where its geometry comes from. Not
 * linked from user navigation.
 */
export default function AssetRegistryPage() {
  const assets = listAssets({ includeDeprecated: true });

  return (
    <div className="min-h-dvh bg-surface-950 px-6 py-8 text-stone-200 md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] uppercase tracking-widest text-stone-600">
          DevaForm internal · <Link href="/" className="underline">home</Link>
        </p>
        <h1 className="mt-1 font-display text-2xl text-stone-100">Asset Registry</h1>

        <h2 className="mt-8 text-sm font-semibold text-stone-300">Deities</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEITIES.map((d) => (
            <span
              key={d.id}
              className={`rounded-full border px-3 py-1 text-xs ${
                d.available
                  ? "border-saffron-700 text-saffron-400"
                  : "border-surface-700 text-stone-500"
              }`}
            >
              {d.name} · {d.available ? "available" : "upcoming"}
            </span>
          ))}
        </div>

        <h2 className="mt-8 text-sm font-semibold text-stone-300">
          Assets ({assets.length})
        </h2>
        <div className="mt-2 overflow-x-auto rounded-xl border border-surface-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-900 text-stone-500">
              <tr>
                <th className="px-3 py-2 font-medium">Id</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Zones</th>
                <th className="px-3 py-2 font-medium">Grip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {assets.map((asset) => (
                <tr key={asset.id} className="bg-surface-950/50">
                  <td className="px-3 py-1.5 font-mono text-stone-300">
                    <Link
                      href={`/dev/assets/${encodeURIComponent(asset.id)}`}
                      className="hover:text-saffron-400 hover:underline"
                    >
                      {asset.id}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-stone-400">v{asset.version}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={
                        asset.stage === "production"
                          ? "text-emerald-400"
                          : asset.stage === "experimental"
                            ? "text-sky-400"
                            : asset.stage === "deprecated"
                              ? "text-red-400"
                              : "text-amber-400"
                      }
                    >
                      {asset.stage}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-stone-400">
                    {asset.kind.type === "part"
                      ? `part:${asset.kind.slot}`
                      : `attachment (${asset.kind.sockets.length} sockets)`}
                  </td>
                  <td className="px-3 py-1.5 text-stone-400">
                    {asset.source.kind === "glb" ? (
                      <span className="text-sky-400">glb: {asset.source.path}</span>
                    ) : (
                      `procedural: ${asset.source.generatorId}`
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-stone-500">{asset.materialZones.join(", ")}</td>
                  <td className="px-3 py-1.5 text-stone-500">
                    {asset.grip ? asset.grip.mudra : "—"}
                    {asset.keepUpright ? " · upright" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
