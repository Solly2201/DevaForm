/**
 * Regex-level manifest extraction shared by the Node asset tooling
 * (validator, thumbnail generator). Semantic validation lives in the
 * asset-system vitest suites, which run in TypeScript.
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export function repoPaths(scriptDir) {
  const webRoot = path.resolve(scriptDir, "..");
  return {
    webRoot,
    publicDir: path.join(webRoot, "public"),
    assetDir: path.join(webRoot, "public", "assets"),
    manifestDir: path.join(webRoot, "..", "..", "packages", "asset-system", "src", "manifests"),
  };
}

export async function readManifestEntries(manifestDir) {
  const entries = [];
  if (!existsSync(manifestDir)) return entries;
  for (const file of await readdir(manifestDir)) {
    if (!file.endsWith(".ts")) continue;
    const source = await readFile(path.join(manifestDir, file), "utf8");
    const chunks = source.split(/\n  \{\n(?=\s*id:)/).slice(1);
    for (const chunk of chunks) {
      const id = chunk.match(/id:\s*"([^"]+)"/)?.[1];
      if (!id) continue;
      entries.push({
        id,
        version: Number(chunk.match(/version:\s*(\d+)/)?.[1] ?? 0),
        stage: chunk.match(/stage:\s*"([^"]+)"/)?.[1] ?? "unknown",
        kindType: chunk.match(/kind:\s*\{\s*type:\s*"([^"]+)"/)?.[1] ?? "unknown",
        glbPath: chunk.match(/kind:\s*"glb",\s*path:\s*"([^"]+)"/)?.[1] ?? null,
        thumbnail: chunk.match(/thumbnail:\s*"([^"]+)"/)?.[1] ?? null,
        manifest: file,
      });
    }
  }
  return entries;
}
