/**
 * Which way a held attribute actually points, in world axes.
 *
 * "It looks wrong from three-quarters" is a symptom with three possible
 * causes — the asset's own axes, the channel the socket was aimed along,
 * or the spin the facing spent — and guessing between them is how a
 * compensating Euler rotation gets added. This measures the thing: the
 * world basis of the attribute, the socket it hangs from, and the seat
 * it is supposed to be resting on.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-axes.mjs [--deity vishnu] [--asset <id>]
 */
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const deity = flag("deity", "vishnu");
const assetId = flag("asset", "vishnu.attribute.chakra");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1200, height: 900 },
});
const page = await browser.newPage();
await page.goto(`${BASE}/studio?form=${deity}`, { waitUntil: "networkidle0", timeout: 120_000 });
await page
  .waitForSelector('[data-testid="stage-intro"]', { timeout: 20_000 })
  .then(async () => {
    await page.evaluate(() => {
      [...document.querySelectorAll('[data-testid="stage-intro"] button')]
        .find((n) => n.textContent?.trim().toLowerCase() === "enter")
        ?.click();
    });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="stage-intro"]') === null,
      { timeout: 90_000 },
    );
  })
  .catch(() => null);
await new Promise((r) => setTimeout(r, 2000));

const result = await page.evaluate((id) => {
  const rig = window.__devaformRig;
  if (!rig) return { error: "no rig" };
  const THREE = window.__devaformThree;
  const round = (n) => Number(n.toFixed(4));
  const basisOf = (object) => {
    object.updateWorldMatrix(true, false);
    const m = object.matrixWorld.elements;
    const axis = (a, b, c) => {
      const length = Math.hypot(m[a], m[b], m[c]) || 1;
      return [round(m[a] / length), round(m[b] / length), round(m[c] / length)];
    };
    return {
      x: axis(0, 1, 2),
      y: axis(4, 5, 6),
      z: axis(8, 9, 10),
      position: [round(m[12]), round(m[13]), round(m[14])],
    };
  };
  let found = null;
  rig.root.traverse((node) => {
    if (node.name === `attachment:${id}`) found = node;
  });
  if (!found) return { error: `no attachment:${id}` };

  // Where the geometry actually is, as a box — the plane it lies in is
  // whichever of its own extents is thinnest.
  const box = new (window.THREE?.Box3 ?? Object).constructor
    ? null
    : null;
  const local = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  found.traverse((node) => {
    const geometry = node.geometry;
    if (!geometry?.attributes?.position) return;
    node.updateWorldMatrix(true, false);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 7) {
      const point = [position.getX(i), position.getY(i), position.getZ(i)];
      const m = node.matrixWorld.elements;
      const world = [
        m[0] * point[0] + m[4] * point[1] + m[8] * point[2] + m[12],
        m[1] * point[0] + m[5] * point[1] + m[9] * point[2] + m[13],
        m[2] * point[0] + m[6] * point[1] + m[10] * point[2] + m[14],
      ];
      for (let axis = 0; axis < 3; axis += 1) {
        local.min[axis] = Math.min(local.min[axis], world[axis]);
        local.max[axis] = Math.max(local.max[axis], world[axis]);
      }
    }
  });
  const extent = local.max.map((v, i) => round(v - local.min[i]));

  const socket = found.parent;
  const hand = socket?.parent;
  return {
    attribute: basisOf(found),
    socket: socket ? basisOf(socket) : null,
    hand: hand ? { name: hand.name, ...basisOf(hand) } : null,
    worldExtent: extent,
    thinnestAxis: extent.indexOf(Math.min(...extent)),
    centre: local.max.map((v, i) => round((v + local.min[i]) / 2)),
  };
}, assetId);

console.log(JSON.stringify({ deity, assetId, ...result }, null, 2));
await browser.close();
