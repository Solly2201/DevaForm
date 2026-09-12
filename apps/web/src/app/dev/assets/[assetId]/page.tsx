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
import { getAsset, getProvenance } from "@devaform/asset-system";
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="relative h-[65vh] overflow-hidden rounded-2xl border border-surface-800 bg-surface-900">
          <Canvas camera={{ position: [0.25, 0.12, 0.35], fov: 40, near: 0.005, far: 20 }}>
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
