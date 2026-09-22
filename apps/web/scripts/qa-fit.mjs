/**
 * Does an ornament fit the body it is worn on?
 *
 * A band is a relationship between two measured things — the limb's skin
 * and the ring's own inner surface — and the only honest check is to
 * measure both on the POSED figure. "It looks like it is piercing the
 * arm" and "the ring's inner surface is four millimetres inside the
 * skin" are the same finding; only the second one can be fixed.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-fit.mjs [--deity vishnu]
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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1000, height: 800 },
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
await new Promise((r) => setTimeout(r, 2200));

const out = await page.evaluate(() => {
  const rig = window.__devaformRig;
  if (!rig) return { error: "no rig" };
  rig.root.updateWorldMatrix(true, true);
  const round = (n) => Number(n.toFixed(4));
  // A Vector3 without importing three: borrow one and clone it.
  const V = () => rig.root.position.clone();

  /**
   * The posed skin, in world space, with the BONE that owns each vertex.
   *
   * Which bone matters. A slab cut perpendicular to a ring's axis crosses
   * a torso as happily as the arm the ring is on, and in a pose where the
   * arms are raised across the chest the radius it reports is the chest's.
   */
  const skin = [];
  for (const mesh of rig.bodyMeshes ?? []) {
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getAttribute("skinIndex");
    const weight = mesh.geometry.getAttribute("skinWeight");
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const bones = (mesh.skeleton?.bones ?? []).map((bone) => bone.name);
    for (let i = 0; i < position.count; i += 1) {
      const point = V().fromBufferAttribute(position, i);
      if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, point);
      point.applyMatrix4(mesh.matrixWorld);
      let owner = null;
      if (index && weight) {
        let best = -1;
        for (const axis of ["X", "Y", "Z", "W"]) {
          const w = weight[`get${axis}`](i);
          if (w > best) {
            best = w;
            owner = bones[index[`get${axis}`](i)] ?? null;
          }
        }
      }
      skin.push([point.x, point.y, point.z, owner]);
    }
  }

  const bands = [];
  rig.root.traverse((node) => {
    if (!node.name.startsWith("part:")) return;
    // Each band part hangs one group per joint; measure every ring in it.
    node.updateWorldMatrix(true, false);
    let inner = Infinity;
    let outer = 0;
    const centre = V().setScalar(0);
    let count = 0;
    node.traverse((child) => {
      const geometry = child.geometry;
      if (!geometry?.attributes?.position || !geometry.type.includes("Torus")) return;
      child.updateWorldMatrix(true, false);
      const params = geometry.parameters ?? {};
      inner = Math.min(inner, (params.radius ?? 0) - (params.tube ?? 0));
      outer = Math.max(outer, (params.radius ?? 0) + (params.tube ?? 0));
      const world = V().setFromMatrixPosition(child.matrixWorld);
      centre.add(world);
      count += 1;
      // The ring's own axis: the torus's +Z, turned into the world.
      const m = child.matrixWorld.elements;
      child.userData.__axis = [m[8], m[9], m[10]];
      child.userData.__centre = [world.x, world.y, world.z];
      child.userData.__joint = String(node.parent?.name ?? "").replace(/^joint:/, "");
    });
    if (count === 0) return;
    centre.multiplyScalar(1 / count);
    bands.push({ part: node.name, joint: node.parent?.name, inner: round(inner), outer: round(outer) });
  });

  // For each ring, the skin's radius around its own axis, at its station.
  const rings = [];
  rig.root.traverse((child) => {
    if (!child.userData?.__axis) return;
    const [ax, ay, az] = child.userData.__axis;
    const length = Math.hypot(ax, ay, az) || 1;
    const axis = [ax / length, ay / length, az / length];
    const [cx, cy, cz] = child.userData.__centre;
    const params = child.geometry.parameters ?? {};
    // Bone names spell joint ids with underscores (glTF strips dots).
    const wornOn = String(child.userData.__joint ?? "").replace(/\./g, "_");
    const radii = [];
    let owned = 0;
    for (const [x, y, z, owner] of skin) {
      if (!wornOn || !owner || !owner.startsWith(wornOn)) continue;
      owned += 1;
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const along = dx * axis[0] + dy * axis[1] + dz * axis[2];
      if (Math.abs(along) > 0.008) continue;
      const rx = dx - axis[0] * along;
      const ry = dy - axis[1] * along;
      const rz = dz - axis[2] * along;
      const radius = Math.hypot(rx, ry, rz);
      radii.push(radius);
    }
    radii.sort((a, b) => a - b);
    const skinRadius = radii.length
      ? radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.9))]
      : null;
    rings.push({
      owner: child.userData.__joint,
      ringMajor: round(params.radius ?? 0),
      ringTube: round(params.tube ?? 0),
      ringInner: round((params.radius ?? 0) - (params.tube ?? 0)),
      skinRadius: skinRadius === null ? null : round(skinRadius),
      clearance: skinRadius === null ? null : round((params.radius ?? 0) - (params.tube ?? 0) - skinRadius),
      samples: radii.length,
      owned,
      wornOn,
      bone: skin.find((s) => s[3])?.[3] ?? null,
    });
  });
  return { bands, rings };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
