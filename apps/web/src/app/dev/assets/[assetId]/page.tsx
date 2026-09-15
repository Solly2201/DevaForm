"use client";

/**
 * Internal asset inspector — the production sandbox for one asset:
 * live 3D preview (wireframe / zone-visualization toggles), measured
 * geometry stats, provenance, lifecycle stage and integration metadata.
 */
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { getAsset, getProvenance, listAssets, type AssetDefinition } from "@devaform/asset-system";
import { buildAssetObject } from "@/engine/thumbnails";
import { ZoneMaterials } from "@/engine/materials";
import { AVAILABLE_DEITIES } from "@devaform/asset-system";

const ZONE_VIS_COLORS = [
  "#f59e0b", "#38bdf8", "#f87171", "#4ade80", "#c084fc", "#facc15", "#fb923c",
];

interface Stats {
  triangles: number;
  vertices: number;
  meshes: number;
  bounds: [number, number, number];
  zones: string[];
}

function measure(object: THREE.Object3D): Stats {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  const zones = new Set<string>();
  const box = new THREE.Box3().setFromObject(object);
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    meshes += 1;
    const geometry = node.geometry as THREE.BufferGeometry;
    const index = geometry.getIndex();
    const positionCount = geometry.getAttribute("position")?.count ?? 0;
    triangles += Math.floor((index ? index.count : positionCount) / 3);
    vertices += positionCount;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material?.name?.startsWith("zone:")) zones.add(material.name);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  return {
    triangles,
    vertices,
    meshes,
    bounds: [size.x, size.y, size.z],
    zones: [...zones],
  };
}

function PreviewObject({
  assetId,
  wireframe,
  zoneView,
  onStats,
}: {
  assetId: string;
  wireframe: boolean;
  zoneView: boolean;
  onStats: (s: Stats) => void;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const materialsRef = useRef<ZoneMaterials | null>(null);

  useEffect(() => {
    let cancelled = false;
    const materials = new ZoneMaterials();
    materialsRef.current = materials;
    const deity = AVAILABLE_DEITIES[0];
    if (deity) materials.applyConfiguration(deity.createDefaultConfiguration().materials);
    void buildAssetObject(assetId, materials).then((built) => {
      if (cancelled || !built) return;
      // Frame at origin for inspection
      const box = new THREE.Box3().setFromObject(built);
      const center = box.getCenter(new THREE.Vector3());
      built.position.sub(center);
      setObject(built);
      onStats(measure(built));
    });
    return () => {
      cancelled = true;
      materials.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  // Wireframe / zone-visualization overlays (per-mesh cloned materials so
  // shared zone materials are never mutated)
  useEffect(() => {
    if (!object) return;
    const zoneColorIndex = new Map<string, number>();
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const data = node.userData as { baseMaterial?: THREE.Material | THREE.Material[] };
      data.baseMaterial ??= node.material;
      const base = data.baseMaterial;
      const restyle = (material: THREE.Material): THREE.Material => {
        if (zoneView) {
          const zone = material.name?.startsWith("zone:") ? material.name : "other";
          if (!zoneColorIndex.has(zone)) zoneColorIndex.set(zone, zoneColorIndex.size);
          return new THREE.MeshBasicMaterial({
            color: ZONE_VIS_COLORS[zoneColorIndex.get(zone)! % ZONE_VIS_COLORS.length],
            wireframe,
          });
        }
        if (wireframe) {
          return new THREE.MeshBasicMaterial({ color: "#e7c877", wireframe: true });
        }
        return material;
      };
      if (Array.isArray(base)) node.material = base.map(restyle);
      else if (base) node.material = restyle(base);
    });
  }, [object, wireframe, zoneView]);

  return object ? <primitive object={object} /> : null;
}

/** Assets interchangeable with this one (same part slot / shared socket). */
function interchangeableAssets(asset: AssetDefinition): AssetDefinition[] {
  const candidates =
    asset.kind.type === "part"
      ? listAssets({ slot: asset.kind.slot })
      : listAssets().filter(
          (other) =>
            other.kind.type === "attachment" &&
            asset.kind.type === "attachment" &&
            other.kind.sockets.some((s) => asset.kind.type === "attachment" && asset.kind.sockets.includes(s)),
        );
  return candidates.filter((other) => other.id !== asset.id);
}

function CompareLinks({
  asset,
  activeCompareId,
}: {
  asset: AssetDefinition;
  activeCompareId: string | null;
}) {
  const others = interchangeableAssets(asset);
  if (others.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-stone-600">Compare with:</span>
      {/* Hard links: search-param-only navigation must remount this dev page */}
      {activeCompareId && (
        <a
          href={`/dev/assets/${encodeURIComponent(asset.id)}`}
          className="rounded-full border border-saffron-600 px-2 py-0.5 text-saffron-400"
        >
          ✕ stop comparing
        </a>
      )}
      {others.map((other) => (
        <a
          key={other.id}
          href={`/dev/assets/${encodeURIComponent(asset.id)}?compare=${encodeURIComponent(other.id)}`}
          className={`rounded-full border px-2 py-0.5 ${
            activeCompareId === other.id
              ? "border-saffron-500 text-saffron-400"
              : "border-surface-700 text-stone-400 hover:border-stone-500"
          }`}
        >
          {other.name}
        </a>
      ))}
    </div>
  );
}

export default function AssetInspectorPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = use(params);
  const asset = getAsset(decodeURIComponent(assetId));
  const [wireframe, setWireframe] = useState(false);
  const [zoneView, setZoneView] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("compare");
    setCompareId(value);
  }, [assetId]);
  const compareAsset = compareId ? (getAsset(compareId) ?? null) : null;

  // Frame by the largest asset on screen so big sculpts aren't cropped and
  // both compare panes share one scale.
  const largestSpan = Math.max(
    ...[asset, compareAsset]
      .filter((a): a is AssetDefinition => Boolean(a))
      .map((a) => Math.max(...(a.geometry?.boundsM ?? [0.32]))),
    0.32,
  );
  const cameraScale = largestSpan / 0.32;
  const cameraPosition: [number, number, number] = [
    0.32 * cameraScale,
    0.16 * cameraScale,
    0.5 * cameraScale,
  ];

  if (!asset) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-950 text-stone-400">
        Unknown asset id. <Link href="/dev/assets" className="ml-2 underline">Registry</Link>
      </div>
    );
  }

  const provenance = getProvenance(asset);
  const deityId = asset.deityCompatibility.includes("any")
    ? "ganesha"
    : asset.deityCompatibility[0];

  return (
    <div className="min-h-dvh bg-surface-950 px-6 py-6 text-stone-200 md:px-10">
      <p className="text-[11px] uppercase tracking-widest text-stone-600">
        DevaForm internal · <Link href="/dev/assets" className="underline">asset registry</Link>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl text-stone-100">
          {asset.id}@{asset.version}
        </h1>
        <span className="rounded-full border border-surface-700 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-sky-400">
          {asset.stage}
        </span>
        <Link
          href={`/studio/${deityId}`}
          className="rounded-lg bg-saffron-500 px-3 py-1 text-xs font-semibold text-surface-950 hover:bg-saffron-400"
        >
          Test in Divine Studio
        </Link>
      </div>

      <CompareLinks asset={asset} activeCompareId={compareId} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className={compareAsset ? "grid gap-3 md:grid-cols-2" : undefined}>
          <div className="relative h-[65vh] overflow-hidden rounded-2xl border border-surface-800 bg-surface-900">
            {compareAsset && (
              <span className="absolute right-3 top-3 z-10 rounded-full bg-surface-950/80 px-2.5 py-0.5 font-mono text-[10px] text-stone-400">
                {asset.id}@{asset.version}
              </span>
            )}
            <Canvas camera={{ position: cameraPosition, fov: 40, near: 0.005, far: 20 }}>
              <color attach="background" args={["#151210"]} />
              <hemisphereLight color="#efe9e2" groundColor="#403830" intensity={0.9} />
              <directionalLight position={[2, 3, 3]} intensity={2.2} color="#fff0da" />
              <directionalLight position={[-1, 2, -3]} intensity={1.2} color="#ffe4b0" />
              <PreviewObject
                assetId={asset.id}
                wireframe={wireframe}
                zoneView={zoneView}
                onStats={setStats}
              />
              <OrbitControls enablePan={false} minDistance={0.05} maxDistance={3} />
            </Canvas>
            <div className="absolute left-3 top-3 flex gap-2">
              <button
                type="button"
                onClick={() => setWireframe((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 text-xs ${wireframe ? "border-saffron-500 text-saffron-400" : "border-surface-700 text-stone-400"}`}
              >
                Wireframe
              </button>
              <button
                type="button"
                onClick={() => setZoneView((v) => !v)}
                className={`rounded-lg border px-2.5 py-1 text-xs ${zoneView ? "border-saffron-500 text-saffron-400" : "border-surface-700 text-stone-400"}`}
              >
                Zones
              </button>
            </div>
          </div>
          {compareAsset && (
            <div className="relative h-[65vh] overflow-hidden rounded-2xl border border-saffron-800/60 bg-surface-900">
              <span className="absolute right-3 top-3 z-10 rounded-full bg-surface-950/80 px-2.5 py-0.5 font-mono text-[10px] text-saffron-400">
                {compareAsset.id}@{compareAsset.version}
              </span>
              <Canvas camera={{ position: cameraPosition, fov: 40, near: 0.005, far: 20 }}>
                <color attach="background" args={["#151210"]} />
                <hemisphereLight color="#efe9e2" groundColor="#403830" intensity={0.9} />
                <directionalLight position={[2, 3, 3]} intensity={2.2} color="#fff0da" />
                <directionalLight position={[-1, 2, -3]} intensity={1.2} color="#ffe4b0" />
                <PreviewObject
                  assetId={compareAsset.id}
                  wireframe={wireframe}
                  zoneView={zoneView}
                  onStats={() => undefined}
                />
                <OrbitControls enablePan={false} minDistance={0.05} maxDistance={3} />
              </Canvas>
            </div>
          )}
        </div>

        <div className="space-y-4 text-xs">
          <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Identity
            </h2>
            <dl className="space-y-1 text-stone-300">
              <div><dt className="inline text-stone-500">Name: </dt><dd className="inline">{asset.name}</dd></div>
              <div><dt className="inline text-stone-500">Kind: </dt><dd className="inline">{asset.kind.type === "part" ? `part · slot ${asset.kind.slot}` : `attachment · ${asset.kind.sockets.join(", ")}`}</dd></div>
              <div><dt className="inline text-stone-500">Source: </dt><dd className="inline font-mono">{asset.source.kind === "glb" ? asset.source.path : `procedural:${asset.source.generatorId}`}</dd></div>
              {asset.supersedes && (
                <div><dt className="inline text-stone-500">Supersedes: </dt><dd className="inline font-mono">{asset.supersedes}</dd></div>
              )}
              {asset.supersededBy && (
                <div><dt className="inline text-stone-500">Superseded by: </dt><dd className="inline font-mono">{asset.supersededBy}</dd></div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Provenance
            </h2>
            <dl className="space-y-1 text-stone-300">
              <div><dt className="inline text-stone-500">Type: </dt><dd className="inline">{provenance.type}</dd></div>
              {provenance.provider && <div><dt className="inline text-stone-500">Provider: </dt><dd className="inline">{provenance.provider}</dd></div>}
              {provenance.creator && <div><dt className="inline text-stone-500">Creator: </dt><dd className="inline">{provenance.creator}</dd></div>}
              {provenance.tool && <div><dt className="inline text-stone-500">Tool: </dt><dd className="inline break-all">{provenance.tool}</dd></div>}
              {provenance.notes && <p className="mt-1 text-stone-500">{provenance.notes}</p>}
            </dl>
          </section>

          <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Measured Geometry
            </h2>
            {stats ? (
              <dl className="space-y-1 text-stone-300">
                <div><dt className="inline text-stone-500">Triangles: </dt><dd className="inline">{stats.triangles.toLocaleString()}</dd></div>
                <div><dt className="inline text-stone-500">Vertices: </dt><dd className="inline">{stats.vertices.toLocaleString()}</dd></div>
                <div><dt className="inline text-stone-500">Meshes: </dt><dd className="inline">{stats.meshes}</dd></div>
                <div>
                  <dt className="inline text-stone-500">Bounds: </dt>
                  <dd className="inline">
                    {stats.bounds.map((b) => (b * 1000).toFixed(0)).join(" × ")} mm
                  </dd>
                </div>
                <div><dt className="inline text-stone-500">Zones in mesh: </dt><dd className="inline">{stats.zones.join(", ") || "—"}</dd></div>
              </dl>
            ) : (
              <p className="text-stone-500">Measuring…</p>
            )}
            <p className="mt-2 text-stone-500">
              Declared zones: {asset.materialZones.join(", ") || "—"}
              {asset.geometry?.triangles !== undefined &&
                ` · declared ${asset.geometry.triangles.toLocaleString()} tris`}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
