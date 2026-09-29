/**
 * What the stage COSTS, and whether it holds together over the whole
 * camera range.
 *
 * The other QA scripts ask whether the product does what it says. This
 * one asks what the renderer is actually doing, because the two lighting
 * defects this was written to find were both invisible in the source and
 * obvious in `renderer.info`:
 *
 *  - every light in the scene was being applied to every object, because
 *    three.js gathers lights per render CAMERA and the Studio's camera
 *    sees every layer. The room's "own dim lamps" were joined by the
 *    statue's key at 2.1, which does not fall off, and a colonnade five
 *    metres out was washed to a flat pale value with no gradient across
 *    its curve — grey panels in a dark room, at any distance;
 *  - sixteen columns were being rasterised into a shadow map three metres
 *    wide, and a nine-metre floor was sampling it far outside its own
 *    border.
 *
 * Both are single numbers in this sheet: `lightsPerObject` and
 * `roomShadowParticipants`. Both must be what they are here.
 *
 * It also sweeps the camera to the far bound at several azimuths, which
 * is the only way to see the other defect of that pass: the orbit's
 * maximum distance used to exceed the colonnade's radius, so the last
 * stretch of zoom-out put the camera outside the ring and a near column
 * filled the frame.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-stage.mjs [--deity vishnu]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const deity = flag("deity", "vishnu");
const outDir = path.join(repo, "screenshots", flag("out", `stage-${deity}`));
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

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
      { timeout: 120_000 },
    );
  })
  .catch(() => null);
await new Promise((r) => setTimeout(r, 2800));

/**
 * The scene, measured.
 *
 * Rendered once per LAYER, the way the Studio renders it, so the numbers
 * describe what a frame actually costs rather than what one hypothetical
 * render of everything would.
 */
const scene = await page.evaluate(() => {
  const handle = window.__devaformRenderer?.();
  if (!handle) return { error: "no renderer handle — dev build?" };
  const { gl, scene, camera } = handle;
  const mask = camera.layers.mask;

  const pass = (layer) => {
    gl.info.autoReset = false;
    gl.info.reset();
    camera.layers.set(layer);
    gl.render(scene, camera);
    return { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
  };
  const stage = pass(1);
  const character = pass(0);
  camera.layers.mask = mask;

  const lights = [];
  const shadowLights = [];
  let meshes = 0;
  let roomShadowParticipants = 0;
  scene.traverse((node) => {
    if (node.isLight) {
      lights.push({ type: node.type, layerMask: node.layers.mask });
      if (node.castShadow) {
        shadowLights.push({
          type: node.type,
          mapSize: [node.shadow.mapSize.x, node.shadow.mapSize.y],
          frustum: {
            left: node.shadow.camera.left,
            right: node.shadow.camera.right,
            top: node.shadow.camera.top,
            bottom: node.shadow.camera.bottom,
            near: node.shadow.camera.near,
            far: node.shadow.camera.far,
          },
          bias: node.shadow.bias,
          normalBias: node.shadow.normalBias,
        });
      }
    }
    if (node.isMesh) {
      meshes += 1;
      // Layer 1 is the room. Nothing in it belongs in the figure's map.
      if (node.layers.mask === 2 && (node.castShadow || node.receiveShadow)) {
        roomShadowParticipants += 1;
      }
    }
  });

  /**
   * How many lights each object is shaded by.
   *
   * The whole point of the two passes: a light on the room's layer must
   * never reach the figure, and the figure's key must never reach the
   * room. One number, and it is the one that was wrong.
   */
  const onLayer = (layer) =>
    lights.filter((light) => (light.layerMask & (1 << layer)) !== 0).length;

  return {
    perFrame: {
      stage,
      character,
      calls: stage.calls + character.calls,
      triangles: stage.triangles + character.triangles,
    },
    memory: { ...gl.info.memory },
    programs: gl.info.programs?.length ?? null,
    meshes,
    roomShadowParticipants,
    lights: lights.length,
    lightsPerObject: { character: onLayer(0), room: onLayer(1) },
    shadowLights,
    shadowMapType: gl.shadowMap.type,
  };
});

/** Sweep to the far bound at several azimuths and look for an occluder. */
const views = [];
const shoot = async (label) => {
  await new Promise((r) => setTimeout(r, 650));
  const camera = await page.evaluate(() => window.__devaformCamera?.() ?? null);
  await page.screenshot({ path: path.join(outDir, `${label}.png`) });
  views.push({ label, camera });
  console.log(`  wrote   ${label}.png  d=${camera?.distance}`);
};

await shoot("1-hero");

// All the way out, by the controls the customer has.
await page.evaluate(async () => {
  const canvas = document.querySelector("main canvas");
  const box = canvas.getBoundingClientRect();
  for (let i = 0; i < 40; i += 1) {
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: 120,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 25));
  }
});
await shoot("2-far");

for (const degrees of [45, 90, 135, 180, 225, 270, 315]) {
  await page.evaluate((deg) => {
    const c = window.__devaformCamera();
    const radians = (Number(deg) * Math.PI) / 180;
    const rise = c.position[1] - c.target[1];
    const flat = Math.sqrt(Math.max(1e-4, c.distance * c.distance - rise * rise));
    window.__devaformSetCamera([
      c.target[0] + Math.sin(radians) * flat,
      c.position[1],
      c.target[2] + Math.cos(radians) * flat,
    ]);
  }, degrees);
  await shoot(`3-far-${String(degrees).padStart(3, "0")}`);
}

await writeFile(
  path.join(outDir, "report.json"),
  JSON.stringify({ deity, scene, views, consoleErrors }, null, 2),
);

console.log("\nper frame :", JSON.stringify(scene.perFrame));
console.log("lights    :", JSON.stringify(scene.lightsPerObject), `of ${scene.lights} total`);
console.log("room in the figure's shadow pass:", scene.roomShadowParticipants);
console.log("shadow    :", JSON.stringify(scene.shadowLights));
if (consoleErrors.length) console.log("console errors:", consoleErrors.length);
console.log(`\n-> screenshots/${path.basename(outDir)}`);

await browser.close();
