import { fileURLToPath } from "node:url";
import path from "node:path";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@devaform/character-schema", "@devaform/asset-system"],
  reactStrictMode: true,
  outputFileTracingRoot: monorepoRoot,

  /**
   * ASSETS ARE VERSIONED BY PATH, SO THEY NEVER CHANGE.
   *
   * Every file under /assets lives at .../<id>/<version>/<file>: a new
   * version of a body or an intro strip is a new URL, never a new body of
   * the same URL. They were nevertheless served with `max-age=0`, so a
   * customer revalidated the four-armed body's five megabytes on every
   * visit and re-downloaded it on any cache eviction — which is most of
   * what the entry spends its time on. Measured at 1.6 Mbps, thirty-six
   * seconds from navigation to a figure.
   *
   * Immutable is the truth about these files, so it is what is said.
   */
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
