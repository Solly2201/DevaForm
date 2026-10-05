/**
 * Loading real GLBs off disk inside a node test.
 *
 * `GLTFLoader.load` fetches a URL, and a node test has no origin to
 * resolve `/assets/...` against — so every test that wants to measure a
 * figure the product actually ships has to hand the loader the bytes
 * itself. That was being written out again in each file that needed it,
 * which is three copies of a decision about how textured assets fail.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type * as THREE from "three";
import { vi } from "vitest";

const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");

interface RealLoader {
  parse(
    data: ArrayBuffer,
    path: string,
    onLoad: (gltf: { scene: THREE.Group }) => void,
    onError?: (error: unknown) => void,
  ): void;
}

/**
 * The module factory to hand `vi.mock`:
 *
 *     vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () =>
 *       import("./glbLoader").then((m) => m.diskLoader()));
 */
export async function diskLoader() {
  const actual = await vi.importActual<{ GLTFLoader: new () => RealLoader }>(
    "three/examples/jsm/loaders/GLTFLoader.js",
  );
  return {
    GLTFLoader: class {
      private readonly real = new actual.GLTFLoader();
      load(path: string, onLoad: (gltf: { scene: THREE.Group }) => void): void {
        const file = readFileSync(join(PUBLIC_DIR, path.replace(/^\//, "")));
        const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
        // A GLB with baked textures cannot finish parsing in node — there
        // is no `createImageBitmap` — and without a handler the rejection
        // surfaces as an unhandled error beside an otherwise green run.
        // Swallowed here; such an asset is checked as a file instead.
        this.real.parse(buffer as ArrayBuffer, "", onLoad, () => {});
      }
    },
  };
}
