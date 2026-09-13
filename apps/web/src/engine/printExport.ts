/**
 * Print/export tooling — the first reliable subset of the print pipeline.
 *
 * What this does today:
 * - exports the posed, assembled statue as binary STL (world transforms
 *   baked by the exporter)
 * - reports honest printability metrics: dimensions at the chosen statue
 *   height, triangle/component counts, base contact
 *
 * What it explicitly does NOT do yet (Phase D of the roadmap): boolean
 * merging into a single watertight shell, thin-wall analysis, mesh repair.
 * The analysis reports those as "not validated" rather than pretending.
 */
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { bakeSceneForExport } from "./skinning";
import type { CharacterRig } from "./rig";

/**
 * Export what the viewer currently shows. Deformation from skinning and
 * morph targets lives in GPU state, which a geometry exporter cannot see —
 * so the rig is baked to static world-space geometry first. Rigid
 * procedural parts pass through the same bake unchanged.
 */
export function exportRigStl(rig: CharacterRig): Blob {
  rig.root.updateWorldMatrix(true, true);
  const { group, dispose } = bakeSceneForExport(rig.root);
  const exporter = new STLExporter();
  const result = exporter.parse(group, { binary: true }) as unknown as DataView;
  const bytes = new Uint8Array(result.buffer as ArrayBuffer, result.byteOffset, result.byteLength);
  const blob = new Blob([bytes], { type: "model/stl" });
  dispose();
  return blob;
}

export interface PrintCheck {
  label: string;
  status: "pass" | "warn" | "unvalidated";
  detail: string;
}

export interface PrintAnalysis {
  /** Model dimensions in millimetres at the requested statue height. */
  widthMm: number;
  heightMm: number;
  depthMm: number;
  triangles: number;
  meshCount: number;
  checks: PrintCheck[];
}

export function analyzeRigForPrint(rig: CharacterRig, statueHeightMm: number): PrintAnalysis {
  rig.root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(rig.root);
  const size = box.getSize(new THREE.Vector3());

  let triangles = 0;
  let meshCount = 0;
  rig.root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      meshCount += 1;
      const geometry = object.geometry as THREE.BufferGeometry;
      const index = geometry.getIndex();
      triangles += Math.floor(
        (index ? index.count : geometry.getAttribute("position")?.count ?? 0) / 3,
      );
    }
  });

  const scale = statueHeightMm / (size.y * 1000);
  const widthMm = size.x * 1000 * scale;
  const heightMm = statueHeightMm;
  const depthMm = size.z * 1000 * scale;

  const checks: PrintCheck[] = [];

  const baseGapMm = Math.abs(box.min.y) * 1000 * scale;
  checks.push(
    baseGapMm < 2
      ? { label: "Base contact", status: "pass", detail: "Model rests on the build plate." }
      : {
          label: "Base contact",
          status: "warn",
          detail: `Lowest point is ${baseGapMm.toFixed(1)} mm from the plate.`,
        },
  );

  checks.push(
    triangles < 600_000
      ? { label: "Triangle budget", status: "pass", detail: `${triangles.toLocaleString()} triangles.` }
      : {
          label: "Triangle budget",
          status: "warn",
          detail: `${triangles.toLocaleString()} triangles — consider decimation.`,
        },
  );

  checks.push({
    label: "Watertight shell",
    status: "unvalidated",
    detail:
      "The export is the assembled component set; boolean merge and watertight validation run in the manufacturing pipeline (not yet implemented).",
  });
  checks.push({
    label: "Thin features",
    status: "unvalidated",
    detail: "Thin-wall analysis is part of the manufacturing pipeline (not yet implemented).",
  });

  return { widthMm, heightMm, depthMm, triangles, meshCount, checks };
}
