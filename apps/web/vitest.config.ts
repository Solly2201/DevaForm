import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    /**
     * Long enough for the heavy builds.
     *
     * Several suites build a whole figure — forty thousand vertices,
     * every ornament, measured against the geometry — and the showcase
     * acceptance suite does it once per selectable option. At the five
     * second default the run reported "41 passed (43)" with no failures
     * and a hundred and thirty-one tests simply unaccounted for, which
     * looks exactly like a green run until the numbers are read.
     */
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
