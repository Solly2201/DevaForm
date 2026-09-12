/**
 * Generates prototype GLB assets consumed by the web engine through the
 * real GLTFLoader pipeline (engine/glbCache.ts).
 *
 * This stands in for the Blender export step of the production asset
 * workflow: the app treats these files exactly like artist-delivered GLBs.
 * Materials named `zone:<zone>` are remapped to live user-controlled
 * materials at load; all other materials ship as authored.
 *
 * Run from apps/web:  node scripts/generate-prototype-glbs.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// GLTFExporter's binary path reads Blobs via FileReader, which Node lacks.
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      });
    }
  };
}

const OUT_DIR = path.resolve("public/assets/ganesha/companion/mushak/1");

function mesh(geometry, material, { position, rotation, scale } = {}) {
  const m = new THREE.Mesh(geometry, material);
  if (position) m.position.set(...position);
  if (rotation) m.rotation.set(...rotation);
  if (scale) {
    if (typeof scale === "number") m.scale.setScalar(scale);
    else m.scale.set(...scale);
  }
  return m;
}

function buildMushak() {
  const fur = new THREE.MeshStandardMaterial({ name: "mushak_fur", color: "#8d7a6a", roughness: 0.85 });
  const furLight = new THREE.MeshStandardMaterial({ name: "mushak_fur_light", color: "#b3a294", roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ name: "mushak_dark", color: "#2a211c", roughness: 0.4 });
  const pink = new THREE.MeshStandardMaterial({ name: "mushak_pink", color: "#c98d80", roughness: 0.7 });
  // Gold collar uses the zone material convention — recolored live in-app.
  const gold = new THREE.MeshStandardMaterial({ name: "zone:metal", color: "#e8ae32", roughness: 0.3, metalness: 1 });
  const sweet = new THREE.MeshStandardMaterial({ name: "mushak_modak", color: "#d9a94e", roughness: 0.6 });

  const root = new THREE.Group();
  root.name = "mushak";

  // Seated body
  root.add(mesh(new THREE.SphereGeometry(0.055, 24, 18), fur, { position: [0, 0.052, -0.01], scale: [1, 1.05, 1.15] }));
  // Belly patch
  root.add(mesh(new THREE.SphereGeometry(0.04, 18, 14), furLight, { position: [0, 0.048, 0.022], scale: [0.85, 0.95, 0.7] }));
  // Head
  root.add(mesh(new THREE.SphereGeometry(0.038, 22, 16), fur, { position: [0, 0.118, 0.025] }));
  // Snout
  root.add(mesh(new THREE.ConeGeometry(0.02, 0.038, 14), fur, { position: [0, 0.108, 0.062], rotation: [Math.PI / 2 + 0.35, 0, 0] }));
  root.add(mesh(new THREE.SphereGeometry(0.007, 10, 8), pink, { position: [0, 0.101, 0.082] }));
  // Ears
  for (const side of [1, -1]) {
    root.add(mesh(new THREE.SphereGeometry(0.019, 14, 10), fur, { position: [side * 0.028, 0.152, 0.012], scale: [1, 1.1, 0.35] }));
    root.add(mesh(new THREE.SphereGeometry(0.013, 12, 8), pink, { position: [side * 0.028, 0.152, 0.017], scale: [0.9, 1, 0.25] }));
  }
  // Eyes
  for (const side of [1, -1]) {
    root.add(mesh(new THREE.SphereGeometry(0.006, 10, 8), dark, { position: [side * 0.016, 0.126, 0.056] }));
  }
  // Front paws holding a tiny modak
  for (const side of [1, -1]) {
    root.add(mesh(new THREE.CapsuleGeometry(0.009, 0.03, 4, 10), fur, {
      position: [side * 0.026, 0.062, 0.042],
      rotation: [-0.9, side * -0.35, 0],
    }));
  }
  root.add(mesh(new THREE.ConeGeometry(0.014, 0.026, 12), sweet, { position: [0, 0.07, 0.062] }));
  // Haunches + feet
  for (const side of [1, -1]) {
    root.add(mesh(new THREE.SphereGeometry(0.026, 16, 12), fur, { position: [side * 0.04, 0.028, 0.01], scale: [1, 0.9, 1.2] }));
    root.add(mesh(new THREE.SphereGeometry(0.014, 12, 8), furLight, { position: [side * 0.042, 0.012, 0.045], scale: [1, 0.6, 1.6] }));
  }
  // Tail — curve behind the body
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.03, -0.06),
    new THREE.Vector3(0.05, 0.02, -0.09),
    new THREE.Vector3(0.1, 0.015, -0.06),
    new THREE.Vector3(0.13, 0.012, -0.01),
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 24, 0.007, 8), fur));
  // Gold collar (zone:metal — user-tintable in the app)
  root.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 10, 24), gold, { position: [0, 0.096, 0.018], rotation: [Math.PI / 2 - 0.35, 0, 0] }));

  return root;
}

async function exportGlb(object, filename) {
  const exporter = new GLTFExporter();
  const buffer = await new Promise((resolve, reject) => {
    exporter.parse(object, (result) => resolve(result), (error) => reject(error), { binary: true });
  });
  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, filename);
  await writeFile(file, Buffer.from(buffer));
  console.log(`wrote ${file} (${buffer.byteLength} bytes)`);
}

await exportGlb(buildMushak(), "model.glb");
