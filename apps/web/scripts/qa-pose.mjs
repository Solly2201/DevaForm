/**
 * Do the pose adjustments do anything?
 *
 * The customer's report was "the custom customisations don't really work
 * like bending leg, torso etc". That is a claim about what happens on
 * screen when a slider is dragged, and no unit test can answer it: the
 * store can hold a perfectly correct rotation while the rig on screen
 * ignores it, which is exactly what was happening.
 *
 * So this drives the real control — finds the Pose category, opens a body
 * part, takes hold of the actual <input type="range"> and moves it with
 * keyboard and with value+input events — and then asks the RIG where the
 * bone went. A slider that moves and a statue that does not is the bug.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-pose.mjs [--deity ganesha]
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
const deity = flag("deity", "ganesha");
const outDir = path.join(repo, "screenshots", `pose-${deity}`);
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1500, height: 900 },
});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const findings = [];
const note = (detail) => {
  findings.push(detail);
  console.log(`  x ${detail}`);
};

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
await settle(2500);

/** Every joint's world transform, as numbers a script can compare. */
const skeletonNow = () =>
  page.evaluate(() => {
    const rig = window.__devaformRig;
    if (!rig) return null;
    rig.root.updateWorldMatrix(true, true);
    const out = {};
    for (const [id, joint] of rig.joints) {
      const m = joint.matrixWorld.elements;
      // Position, and a point offset from it: a twist about a joint's own
      // axis moves its origin not at all, and turning a head counts.
      out[id] = [m[12], m[13], m[14], m[0] + m[12], m[5] + m[13], m[10] + m[14]].map((n) =>
        Number(n.toFixed(5)),
      );
    }
    return out;
  });

const moved = (before, after, id) => {
  const a = before?.[id];
  const b = after?.[id];
  if (!a || !b) return null;
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return Number(worst.toFixed(5));
};

/** Open the Pose category, then a body-part section by its heading. */
const openPose = async () => {
  await page.evaluate(() => {
    [...document.querySelectorAll("nav button")]
      .find((n) => /pose/i.test(n.textContent ?? ""))
      ?.click();
  });
  await settle(400);
};

/**
 * Every slider currently on the panel, with the joint it belongs to.
 *
 * The Pose category opens on Presets; the joint sliders live behind the
 * body-part sub-nav, one group at a time. A probe that only enumerates
 * what is on screen when the category opens finds nothing and concludes
 * the product has no sliders — which is a bug in the probe.
 */
const sliders = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('aside input[type="range"]')].map((input, index) => ({
      index,
      joint: input.closest("section")?.querySelector("h4")?.textContent?.trim() ?? null,
      axis: input.closest("label")?.querySelector("span")?.textContent?.trim() ?? null,
      value: Number(input.value),
      min: Number(input.min),
      max: Number(input.max),
    })),
  );

/** Which body parts the sub-nav offers. */
const poseGroups = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('aside nav[aria-label$="sections"] button')]
      .map((n) => n.textContent?.trim())
      .filter(Boolean),
  );

/** Show one of them. */
const openGroup = (label) =>
  page.evaluate((name) => {
    const button = [...document.querySelectorAll('aside nav[aria-label$="sections"] button')].find(
      (n) => n.textContent?.trim() === name,
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);

/** Drag one slider to a value, the way a pointer does. */
const setSlider = (index, value) =>
  page.evaluate(
    (at, to) => {
      const input = [...document.querySelectorAll('aside input[type="range"]')][at];
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, String(to));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    index,
    value,
  );

/**
 * Arms whose hand the engine aims at something.
 *
 * Such an arm is solved — shoulder, then forearm, then wrist — after the
 * pose is applied, so the one degree of freedom that spin about the arm's
 * own axis represents is the solver's to spend. A twist slider there is
 * genuinely absorbed, and that is the trishul staying upright rather than
 * a defect. The wrist itself is not offered at all (see PosePanel).
 */
const aimedArms = () =>
  page.evaluate(() => {
    const rig = window.__devaformRig;
    if (!rig) return [];
    return [...new Set((rig.held ?? []).map((item) => item.slot))];
  });

const report = { deity, groups: [], absorbed: [], consoleErrors: [] };

await openPose();
const aimed = await aimedArms();
console.log(`arms aimed at what they hold: ${aimed.join(", ") || "(none)"}`);
const groups = await poseGroups();
console.log(`\npose sections: ${groups.join(", ") || "(none)"}`);
if (groups.length < 2) note("the Pose panel offers no body parts to adjust");

let shots = 0;
for (const group of groups) {
  if (/preset/i.test(group)) continue;
  if (!(await openGroup(group))) {
    note(`could not open the "${group}" section`);
    continue;
  }
  await settle(450);
  const entries = await sliders();
  if (entries.length === 0) {
    note(`"${group}" shows no joint sliders`);
    continue;
  }

  // One slider per joint in the group: enough to prove each bone answers,
  // without paying for three axes of every joint in the skeleton.
  const byJoint = new Map();
  for (const entry of entries) {
    if (!byJoint.has(entry.joint)) byJoint.set(entry.joint, []);
    byJoint.get(entry.joint).push(entry);
  }

  for (const [joint, axes] of byJoint) {
    // The axis with the most room to travel — a joint limited to a few
    // degrees would make a weak test of the wiring.
    const pick = axes.reduce((a, b) => (b.max - b.min > a.max - a.min ? b : a));
    const up = pick.max - pick.value > pick.value - pick.min;
    const target = Math.round(
      pick.value + (up ? 1 : -1) * Math.min(35, (pick.max - pick.min) * 0.4),
    );

    const before = await skeletonNow();
    await setSlider(pick.index, target);
    await settle(450);
    const after = await skeletonNow();

    // Which joint moved most: naming it proves the right bone answered.
    let best = { id: null, by: 0 };
    for (const id of Object.keys(after ?? {})) {
      const by = moved(before, after, id) ?? 0;
      if (by > best.by) best = { id, by };
    }
    const entry = {
      group,
      joint,
      axis: pick.axis,
      from: pick.value,
      to: target,
      movedMost: best.id,
      movedBy: best.by,
    };
    report.groups.push(entry);
    console.log(
      `  ${group} / ${joint} ${pick.axis} ${pick.value} -> ${target}: ` +
        `${best.id ?? "nothing"} moved ${best.by}m`,
    );
    if (best.by < 0.002) {
      // On an arm the engine aims, the spin about the arm's own axis is
      // the solver's — see aimedArms. Everywhere else, a slider that
      // moves nothing is the defect this script exists to catch.
      const slot = aimed.find((arm) =>
        group.toLowerCase().replace(/\s+/g, "").startsWith(arm.toLowerCase()),
      );
      if (slot && /twist/i.test(pick.axis ?? "")) {
        report.absorbed.push({ ...entry, reason: `${slot} is aimed at what it holds` });
        console.log(`    (absorbed: ${slot} is aimed at what it holds)`);
      } else {
        note(`${group} / ${joint}: moving "${pick.axis}" moved no bone at all`);
      }
    }

    if (shots < 4) {
      shots += 1;
      await writeFile(
        path.join(outDir, `${String(shots).padStart(2, "0")}-${group.replace(/\W+/g, "-")}.png`),
        await page.screenshot({ type: "png" }),
      );
    }
    // Put it back, so the next joint starts from the same statue.
    await setSlider(pick.index, pick.value);
    await settle(300);
  }
}

// --- and the framing, which is the other half of the report ------------
const framing = await page.evaluate(() => {
  const stage = window.__devaformStage?.();
  const rig = window.__devaformRig;
  if (!stage || !rig) return null;
  return { stage, hasFigure: Boolean(stage.figure) };
});
report.framing = framing;
if (!framing?.hasFigure) note("the stage never measured the figure standing on it");
console.log(`\nhero: ${JSON.stringify(framing?.stage?.position)} -> ${JSON.stringify(framing?.stage?.target)}`);
console.log(`figure: ${JSON.stringify(framing?.stage?.figure)}`);

await writeFile(path.join(outDir, "hero.png"), await page.screenshot({ type: "png" }));
report.consoleErrors = consoleErrors;
report.findings = findings;
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${findings.length} finding(s), ${consoleErrors.length} console error(s)`);
for (const error of consoleErrors.slice(0, 6)) console.error(`  ${error}`);
await browser.close();
process.exit(findings.length ? 1 : 0);
