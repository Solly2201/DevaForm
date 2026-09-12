/**
 * Generates a kalash (sacred vessel) as a plain OBJ file — the standing
 * integration fixture for the asset ingestion pipeline. It deliberately
 * arrives "wrong" (Z-up, millimetre scale, off-center, unzoned material
 * names) so ingestion has real normalization work to do.
 *
 * Run: node scripts/fixtures/make-kalash-obj.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

// Lathe profile [radius, height] in millimetres (deliberately not metres)
const PROFILE = [
  [1, 0],
  [42, 2],
  [55, 12],
  [62, 30],
  [58, 52],
  [40, 70],
  [30, 78],
  [34, 84],
  [44, 90],
  [46, 96],
  [36, 100],
  [24, 104],
  [14, 116],
  [1, 122],
];
const SEGMENTS = 28;

const vertices = [];
const faces = [];

for (let ring = 0; ring < PROFILE.length; ring++) {
  const [radius, height] = PROFILE[ring];
  for (let seg = 0; seg < SEGMENTS; seg++) {
    const angle = (seg / SEGMENTS) * Math.PI * 2;
    // Z-up on purpose (height on Z), plus an arbitrary offset
    vertices.push([
      Math.cos(angle) * radius + 250,
      Math.sin(angle) * radius - 120,
      height,
    ]);
  }
}
for (let ring = 0; ring < PROFILE.length - 1; ring++) {
  for (let seg = 0; seg < SEGMENTS; seg++) {
    const a = ring * SEGMENTS + seg + 1; // OBJ is 1-indexed
    const b = ring * SEGMENTS + ((seg + 1) % SEGMENTS) + 1;
    const c = (ring + 1) * SEGMENTS + seg + 1;
    const d = (ring + 1) * SEGMENTS + ((seg + 1) % SEGMENTS) + 1;
    faces.push([a, c, b], [b, c, d]);
  }
}

const lines = [
  "# DevaForm ingestion fixture — kalash (Z-up, millimetres, off-center)",
  "o kalash_body",
  "usemtl BrassPot",
  ...vertices.map((v) => `v ${v[0].toFixed(3)} ${v[1].toFixed(3)} ${v[2].toFixed(3)}`),
  ...faces.map((f) => `f ${f[0]} ${f[1]} ${f[2]}`),
];

const out = path.resolve("scripts/fixtures/kalash.obj");
writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${out} (${vertices.length} vertices, ${faces.length} faces)`);
