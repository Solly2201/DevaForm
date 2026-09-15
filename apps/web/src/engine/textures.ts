/**
 * Procedural textures, generated once and shared.
 *
 * Vertex colours were the only pattern this engine had, and a vertex
 * colour cannot be smaller than the triangles carrying it: a tiger's
 * rosettes came out as blurred continents however finely the cells were
 * set, because the cloth they were painted on is a few hundred quads.
 * Every note written about the hide said the same thing — "needs
 * animal-skin texture", "reads as mottling".
 *
 * These are DataTextures built from a seeded generator rather than image
 * files: they are part of the product, they must be identical on every
 * build (a statue that shimmers as the customer changes an unrelated
 * option is not a statue), and they must work in a test run with no
 * canvas and no network.
 *
 * They are greyscale by design. A texture here says where the marking IS;
 * what colour it comes out is the material's, which is the customer's.
 */
import * as THREE from "three";

/** Deterministic value noise — the same field the generators use. */
function noise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const u = ease(x - ix);
  const v = ease(y - iy);
  const a = noise(ix, iy);
  const b = noise(ix + 1, iy);
  const c = noise(ix, iy + 1);
  const d = noise(ix + 1, iy + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

const cache = new Map<string, THREE.DataTexture>();

function build(
  key: string,
  size: number,
  shade: (u: number, v: number) => number,
  repeat: [number, number],
): THREE.DataTexture {
  key = `${key}@${repeat[0]}x${repeat[1]}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const value = Math.max(0, Math.min(1, shade((x + 0.5) / size, (y + 0.5) / size)));
      const byte = Math.round(value * 255);
      data[i] = byte;
      data[i + 1] = byte;
      data[i + 2] = byte;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `procedural:${key}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

/** Distance to the nearest of a scattered set of marks, in cell space. */
function nearestMark(u: number, v: number, cells: number): { near: number; second: number } {
  const cx = u * cells;
  const cy = v * cells;
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  let near = Infinity;
  let second = Infinity;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      // Wrapped, so the texture tiles without a seam.
      const gx = ((ix + dx) % cells + cells) % cells;
      const gy = ((iy + dy) % cells + cells) % cells;
      const jx = ix + dx + noise(gx * 1.7, gy * 3.1);
      const jy = iy + dy + noise(gx * 5.3 + 11, gy * 2.9 + 7);
      const d = Math.hypot(cx - jx, cy - jy);
      if (d < near) {
        second = near;
        near = d;
      } else if (d < second) {
        second = d;
      }
    }
  }
  return { near, second };
}

/**
 * A big cat's skin: dark rosettes scattered over a lighter ground, broken
 * and irregular the way a real pelt's are, with the ground itself varying
 * slowly so the hide does not read as printed fabric.
 */
export function hideMarkings(): THREE.DataTexture {
  return build(
    "hide",
    512,
    (u, v) => {
      const { near } = nearestMark(u, v, 7);
      // A rosette is a broken ring, not a dot: the edge of the cell is
      // dark, the middle of it lighter again.
      const ring = Math.exp(-Math.pow(Math.abs(near - 0.34) * 5.2, 2));
      // Break the ring up so it reads as a rosette rather than a target.
      const broken = smoothNoise(u * 34 + 3, v * 34 + 9);
      const mark = ring * (0.45 + 0.75 * broken);
      const ground = 1 - 0.11 * smoothNoise(u * 6, v * 6);
      const grain = 1 - 0.05 * smoothNoise(u * 90, v * 90);
      return ground * grain * (1 - 0.62 * Math.min(1, mark));
    },
    [3, 3],
  );
}

/**
 * Woven cloth: a fine weave that catches the light, with slow variation
 * across it so a dhoti does not read as a plastic surface of revolution.
 */
export function clothWeave(): THREE.DataTexture {
  return build(
    "cloth",
    256,
    (u, v) => {
      const warp = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 64);
      const weft = 0.5 + 0.5 * Math.cos(v * Math.PI * 2 * 64);
      const weave = 1 - 0.07 * (warp * 0.6 + weft * 0.4);
      const slub = 1 - 0.05 * smoothNoise(u * 12, v * 40);
      return weave * slub;
    },
    [3, 3],
  );
}

/**
 * A serpent's scales: overlapping rows of small plates, each catching a
 * little light along its spine and darkening into the seam around it.
 *
 * `along` and `around` are how many times the sheet repeats down the
 * body and round it, so one texture serves a body sampled at any length.
 *
 * Reference: ref4.png — a cobra in copper and dark bronze, its scales
 * individually legible at statue distance and its belly plates broader
 * and paler than the dorsal ones. Counter-shading is left to the mesh's
 * own vertex colours; this only says where a scale begins and ends.
 */
export function serpentScales(along: number, around: number): THREE.DataTexture {
  return build(
    "serpent-scales",
    256,
    (u, v) => {
      // Rows offset by half a scale, the way real scales overlap.
      const rows = 26;
      const cols = 26;
      const row = v * rows;
      const band = Math.floor(row);
      const offset = (band % 2) * 0.5;
      const col = u * cols + offset;
      const fx = col - Math.floor(col) - 0.5;
      const fy = row - band - 0.5;
      // A scale is a rounded diamond: dark at its edge, lifted in the
      // middle, with a highlight towards its leading end.
      const d = Math.pow(Math.abs(fx) * 2, 1.6) + Math.pow(Math.abs(fy) * 2, 1.9);
      const body = 1 - Math.min(1, Math.pow(d, 1.4)) * 0.42;
      const sheen = 0.06 * Math.max(0, 1 - Math.hypot(fx * 2.4, (fy + 0.16) * 3.2));
      // A slow variation across the skin, so no two scales read the same.
      const vary = 1 - 0.07 * smoothNoise(u * 18, v * 18);
      return (body + sheen) * vary;
    },
    [around, along],
  );
}
