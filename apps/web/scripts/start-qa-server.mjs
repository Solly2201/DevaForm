/**
 * The production server, with the workshop doors open.
 *
 * `middleware.ts` answers 404 for `/dev/*` on a production build unless
 * DEVAFORM_DEV_ROUTES is set, so that a deployment does not serve the QA
 * harness to customers. Several of the audits ARE those routes —
 * qa-capture photographs /dev/qa, qa-frame takes a single shot from it,
 * generate-thumbnails drives /dev/thumbnail — so they need a server
 * started with it on.
 *
 * A script rather than `DEVAFORM_DEV_ROUTES=1 next start`, because that
 * form is not portable to the shell pnpm runs scripts in on Windows and
 * there is no cross-env in this repository to borrow.
 *
 *   pnpm --filter @devaform/web start:qa
 *
 * Everything that drives the product rather than the harness —
 * qa-customer, qa-viewport, qa-responsive, qa-oldsave, qa-firstload,
 * qa-prodperf — should be run against a plain `pnpm start`, because that
 * is what ships.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT ?? "3000";

console.log(`Serving the production build on :${port} WITH /dev routes enabled.`);
console.log("This is the QA server. A deployment must use `next start` without it.\n");

const server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "-p", port],
  {
    cwd: path.resolve(here, ".."),
    stdio: "inherit",
    env: { ...process.env, DEVAFORM_DEV_ROUTES: "1" },
  },
);

server.on("exit", (code) => process.exit(code ?? 0));
