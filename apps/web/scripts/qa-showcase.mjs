/**
 * The showcase walkthrough, driven end to end.
 *
 * A person is going to be shown this product. This is the exact path they
 * will be taken along, performed by a browser, with every step asserted
 * and a handful of captures taken at the moments that matter. If a step
 * here fails, the demonstration fails.
 *
 * It is deliberately a WALKTHROUGH rather than a sweep: the suite already
 * builds every selectable option (`showcase.test.ts`) and the orbit
 * scripts already photograph every angle. What neither of them can say is
 * whether the product holds together while somebody USES it — whether the
 * figure that appears is the one the chip names, whether a mudra change
 * survives a deity change, whether the link at the end opens.
 *
 * Prereq: `pnpm dev` on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-showcase.mjs [name]
 * Captures land in the repo's gitignored `screenshots/<name>/`.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
// Under the repo's own `screenshots/`, which is gitignored: these are a
// way of showing somebody what the product looks like, not product
// assets, and they should never arrive in a commit.
const repo = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT = process.argv[2] ? path.join(repo, "screenshots", process.argv[2]) : null;
if (OUT) await mkdir(OUT, { recursive: true });

const failures = [];
const notes = [];
const fail = (step, why) => {
  failures.push(`${step}: ${why}`);
  console.log(`  ✗ ${step} — ${why}`);
};
const pass = (step, detail = "") => console.log(`  ✓ ${step}${detail ? ` — ${detail}` : ""}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();

/**
 * Console noise, kept and reported at the end.
 *
 * Next's router aborts its own prefetches when a click lands before one
 * finishes, which is normal and not a product error — so those are
 * separated from everything else rather than hidden.
 */
const errors = [];
page.on("pageerror", (error) => errors.push({ kind: "pageerror", text: String(error).slice(0, 200) }));
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ kind: "console", text: message.text().slice(0, 200) });
});
page.on("requestfailed", (request) => {
  errors.push({ kind: "request", text: `${request.url()} ${request.failure()?.errorText ?? ""}` });
});

const settle = (ms = 1200) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = async (name) => {
  if (!OUT) return;
  await settle(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
const clickText = (text, exact = true) =>
  page.evaluate(
    (wanted, isExact) => {
      const buttons = [...document.querySelectorAll("button, [role='button']")];
      const hit = buttons.find((node) => {
        const label = node.textContent?.trim() ?? "";
        return (isExact ? label === wanted : label.startsWith(wanted)) && node.offsetParent !== null;
      });
      if (!hit) return false;
      hit.click();
      return true;
    },
    text,
    exact,
  );
/**
 * Which deity is loaded, asked of two independent things.
 *
 * Not of the page text. Every card in the Divine Form panel contains a
 * leaf node reading "Ganesha", "Shiva" or "Vishnu", so a harness that
 * searches the document for a deity name finds the first CARD and
 * reports it however the figure in the viewport looks — which is exactly
 * the mistake this function was written with, and it reported a correct
 * product broken twice.
 *
 * So: what the document says it is, and what the rig actually built. They
 * have to agree. A store that switched while the figure did not is the
 * real bug this is here to catch, and only comparing the two can see it.
 */
const loadedDeity = () =>
  page.evaluate(() => {
    const store = window.__devaformStore?.getState();
    const rig = window.__devaformRig;
    const declared = store?.config?.deity ?? null;
    /**
     * The deity the BUILT parts belong to. Asset ids are namespaced by
     * deity ("ganesha.head.sculpted"), and shared pieces are not, so the
     * figure's own answer is whichever deity prefix its parts carry.
     */
    const prefixes = new Set();
    rig?.root?.traverse?.((node) => {
      const match = /^part:([a-z]+)\./.exec(node.name ?? "");
      if (match) prefixes.add(match[1]);
    });
    const built = [...prefixes].filter((prefix) => prefix !== "shared" && prefix !== "human");
    return { declared, built };
  });
const sceneCost = () =>
  page.evaluate(() => {
    const handle = window.__devaformRenderer;
    if (!handle) return null;
    const { gl, scene, camera } = handle();
    gl.render(scene, camera);
    return { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
  });

// --- 1. the front door ----------------------------------------------------
console.log("\n1. the front door");
const landed = await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 180_000 });
if (!page.url().includes("/studio")) fail("root opens the Studio", `landed on ${page.url()}`);
else pass("root opens the Studio", page.url().replace(BASE, ""));
if (!landed || landed.status() >= 400) fail("root answers", String(landed?.status()));

// --- 2. the intro, and the figure behind it -------------------------------
console.log("\n2. the intro");
const intro = await page
  .waitForSelector('[data-testid="stage-intro"]', { timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
if (!intro) notes.push("no intro overlay — this session had already seen it");
else pass("the intro appears");
await shot("01-intro");
if (intro) {
  await page.evaluate(() => {
    [...document.querySelectorAll('[data-testid="stage-intro"] button')]
      .find((node) => node.textContent?.trim().toLowerCase() === "enter")
      ?.click();
  });
  const entered = await page
    .waitForFunction(() => document.querySelector('[data-testid="stage-intro"]') === null, {
      timeout: 120_000,
    })
    .then(() => true)
    .catch(() => false);
  if (!entered) fail("Enter reveals the Studio", "the overlay never went away");
  else pass("Enter reveals the Studio");
}
/**
 * DEV HANDLES, OR THE BUILD THAT ACTUALLY SHIPS.
 *
 * `__devaformRenderer`, `__devaformRig`, `__devaformStore` and
 * `__devaformUi` are all guarded by `NODE_ENV !== "production"`, and
 * correctly so — a renderer handle on a shipped page is a debug hook in a
 * customer's browser. The first run of this script against a production
 * build therefore hung for two minutes waiting for a window property that
 * is never going to appear.
 *
 * So it runs either way. With the handles it asks the sharp questions —
 * how many draw calls, which deity the rig is built from, how far a bone
 * turned. Without them it asks what a PERSON can see: is there a canvas
 * with pixels in it, did the panel open the category it was asked for,
 * did the picker's own pressed-state change, does Save produce a
 * confirmation and Share a link that opens. That second set is weaker and
 * it is the only set that can be asked of the artefact being released.
 */
const deep = await page
  .waitForFunction(() => window.__devaformRenderer !== undefined, { timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
if (deep) pass("the build exposes its dev handles", "measuring geometry directly");
else notes.push("a production build: no dev handles, so this is what a person can observe");

await settle(2500);
if (deep) {
  const first = await sceneCost();
  if (!first || first.calls < 50) fail("a statue is drawn", JSON.stringify(first));
  else pass("a statue is drawn", `${first.calls} draw calls, ${first.triangles} triangles`);
} else {
  const canvas = await page.evaluate(() => {
    const node = document.querySelector("canvas");
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { width: Math.round(box.width), height: Math.round(box.height) };
  });
  if (!canvas || canvas.width < 200 || canvas.height < 200) {
    fail("a statue is drawn", `canvas ${JSON.stringify(canvas)}`);
  } else {
    pass("a viewport is drawn", `${canvas.width}x${canvas.height}`);
  }
}
await shot("02-ganesha");

// --- 3-7. customise Ganesha ----------------------------------------------
console.log("\n3. customising Ganesha");
const openCategory = async (label) => {
  const ok = await clickText(label);
  await settle(900);
  if (!ok) return false;
  // The panel's own heading, which is the product saying which category
  // it opened. Clicking a category and then reading controls without
  // checking this is how the walkthrough came to exercise the camera.
  const heading = await page.evaluate(
    () =>
      document
        .querySelector('[data-testid="customization-panel"] h2')
        ?.textContent?.trim() ?? null,
  );
  if (heading !== label) {
    fail(`open ${label}`, `the panel heading says "${heading ?? "nothing"}"`);
    return false;
  }
  return true;
};
/**
 * Click the n-th OPTION in the open panel, and say what it was.
 *
 * Not "the n-th button with an image in it": mudras and poses are
 * labelled controls with no thumbnail, so that filter found nothing in
 * the two panels most worth exercising and the harness reported "nothing
 * to change here" about a Hands panel full of mudras.
 *
 * An option is a pressable control carrying `aria-pressed` — what every
 * picker in this product uses to say "this is one of a set, and here is
 * whether it is the current one" — AND inside the customization panel.
 * That second half matters: the viewport overlay's camera buttons are
 * one-of-a-set controls too, they sit earlier in the document, and
 * without the scope this function clicked "Front" and "Face" on the
 * camera while reporting that it had changed a head and a garment.
 */
const pickTile = async (index) =>
  page.evaluate((n) => {
    const panel = document.querySelector('[data-testid="customization-panel"]');
    if (!panel) return null;
    const options = [...panel.querySelectorAll("button[aria-pressed]")].filter(
      (node) => node.offsetParent !== null && !node.disabled,
    );
    // Skip whichever one is already chosen: clicking it changes nothing
    // and looks indistinguishable from a broken picker.
    const pickable = options.filter((node) => node.getAttribute("aria-pressed") !== "true");
    const tile = pickable[n] ?? pickable[0];
    if (!tile) return null;
    const label = tile.textContent?.trim() ?? "(unlabelled)";
    tile.click();
    return label;
  }, index);

/**
 * What the figure IS, in one string: what it is built from, what it
 * holds, and how it is held.
 *
 * Swapping a head changes the first part; choosing a mudra changes only
 * the last. A triangle count sees the one and not the other, which is why
 * it reported a working Hands panel as inert.
 */
const figureSignature = () =>
  deep
    ? page.evaluate(() => {
    const rig = window.__devaformRig;
    /**
     * The parts, found by walking the whole figure.
     *
     * Not `root.children`: a part is parented to the JOINT it belongs to,
     * so a head sits under the head bone and never appears among the
     * root's own children. Reading only those saw no difference between
     * one head and another and reported a working picker as inert.
     */
    const parts = [];
    rig?.root?.traverse?.((node) => {
      if (typeof node.name === "string" && node.name.startsWith("part:")) parts.push(node.name);
    });
    parts.sort();
    const joints = [...(rig?.joints?.keys?.() ?? [])]
      .sort()
      .map((id) => {
        const bone = rig.joints.get(id);
        return `${id}:${bone?.rotation.x.toFixed(3)},${bone?.rotation.y.toFixed(3)},${bone?.rotation.z.toFixed(3)}`;
      })
      .join("|");
        return `${parts.join(",")}##${joints}`;
      })
    : /**
       * WITHOUT THE RIG: what the PICKER says it has selected.
       *
       * Weaker, and not nothing — it is the product's own statement about
       * the configuration, and a tile that highlights while the figure
       * does not change is at least half the bug.
       */
      page.evaluate(() => {
        const panel = document.querySelector('[data-testid="customization-panel"]');
        return [...(panel?.querySelectorAll("button[aria-pressed]") ?? [])]
          .map((node) => `${node.textContent?.trim()}=${node.getAttribute("aria-pressed")}`)
          .join("|");
      });

for (const [category, index, step] of [
  ["Head", 1, "a different head"],
  ["Face", 1, "a different face feature"],
  ["Hands", 1, "a different mudra"],
  ["Attributes", 1, "a different attribute"],
  ["Clothing", 1, "a different garment"],
]) {
  if (!(await openCategory(category))) {
    fail(`open ${category}`, "no such category");
    continue;
  }
  const before = await figureSignature();
  const picked = await pickTile(index);
  await settle(2400);
  const after = await figureSignature();
  if (picked === null) {
    fail(`${category}`, "the panel offered nothing to pick");
    continue;
  }
  if (before && before === after) {
    fail(step, `"${picked}" changed nothing about the figure`);
  } else {
    pass(step, `${category} → ${picked}`);
  }
}
await shot("03-ganesha-customised");

// --- 8. orbit -------------------------------------------------------------
console.log("\n4. orbit");
for (const view of ["Front", "Left", "Back", "Right", "¾"]) {
  if (!(await clickText(view))) {
    fail("camera controls", `no "${view}" control`);
    break;
  }
  await settle(900);
}
if (deep) {
  const orbited = await sceneCost();
  if (!orbited || orbited.calls < 50) fail("the statue survives an orbit", JSON.stringify(orbited));
  else pass("the statue survives an orbit", `${orbited.calls} draw calls`);
} else {
  // The canvas is still there and still has a figure's worth of pixels in
  // it, which is what "survives an orbit" means to somebody watching.
  const alive = await page.evaluate(() => {
    const node = document.querySelector("canvas");
    return node ? node.getBoundingClientRect().width > 200 : false;
  });
  if (!alive) fail("the statue survives an orbit", "the viewport is gone");
  else pass("the statue survives an orbit");
}
await shot("04-orbit");

// --- 9-16. the other two gods --------------------------------------------
const switchTo = async (name) => {
  await clickText("Divine Form");
  await settle(800);
  const ok = await clickText(name, false);
  if (!ok) return fail(`switch to ${name}`, "no card for it");
  /**
   * THE UNSAVED-CHANGES DIALOG, which is correct and which the harness
   * must answer rather than route around.
   *
   * Switching form starts a new creation; if the current one has unsaved
   * edits, the product says so and waits. A walkthrough that customises
   * Ganesha and then clicks Shiva WILL meet this — so will the person
   * being shown the product — and the first version of this script simply
   * never answered it, then reported the switch broken.
   */
  const confirming = await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    if (!dialog) return null;
    const confirm = [...dialog.querySelectorAll("button")].find((node) =>
      node.textContent?.trim().startsWith("Switch to"),
    );
    if (!confirm) return "stuck";
    confirm.click();
    return "confirmed";
  });
  if (confirming === "stuck") {
    return fail(`switch to ${name}`, "the confirmation offered no way to proceed");
  }
  if (confirming === "confirmed") pass("unsaved changes are flagged before leaving", name);
  /**
   * WAIT FOR THE VEIL, do not guess at a delay.
   *
   * Switching form raises a cover before the configuration changes and
   * drops it when the new figure is standing, so that nobody ever sees a
   * half-built statue. A fixed three-second settle caught Shiva mid-build
   * and reported "36 draw calls — a partial figure", which is exactly the
   * state the veil exists to hide: the harness was looking behind it.
   *
   * It is also the right assertion. If the cover has not lifted within
   * fifteen seconds then a person being shown this product is staring at
   * a blank stage, and that is a defect whatever the renderer says.
   */
  const lifted = await page
    .waitForFunction(() => document.querySelector('[data-testid="stage-arrival"]') === null, {
      timeout: 15_000,
      polling: 200,
    })
    .then(() => true)
    .catch(() => false);
  if (!lifted) fail(`switch to ${name}`, "the arrival cover never lifted (15s)");
  await settle(1200);
  const arrived = await page
    .waitForFunction(
      (wanted) =>
        [...document.querySelectorAll("*")].some(
          (node) => node.children.length === 0 && node.textContent?.trim() === wanted,
        ),
      { timeout: 90_000 },
      name,
    )
    .then(() => true)
    .catch(() => false);
  await settle(3000);
  const wanted = name.toLowerCase();
  if (!deep) {
    /**
     * Without the store, the product's own statement of which form is
     * being created: the Divine Form card marked "Creating".
     */
    const creating = await page.evaluate(() => {
      const card = [...document.querySelectorAll("button")].find((node) =>
        /Creating\s*$/.test(node.textContent ?? ""),
      );
      return card?.textContent?.trim().split(/The |Remover|Preserver/)[0]?.trim() ?? null;
    });
    if (!arrived) fail(`switch to ${name}`, "the form never arrived");
    else if (creating && !creating.startsWith(name)) {
      fail(`switch to ${name}`, `the panel says it is creating "${creating}"`);
    } else pass(`switch to ${name}`, creating ?? "arrived");
    return;
  }
  const { declared, built } = await loadedDeity();
  const cost = await sceneCost();
  if (!arrived || declared !== wanted) {
    fail(`switch to ${name}`, `the document says ${declared ?? "nothing"}`);
  } else if (built.length > 0 && !built.includes(wanted)) {
    fail(
      `switch to ${name}`,
      `the document says ${declared} but the figure is built from ${built.join(", ")}`,
    );
  } else if (!cost || cost.calls < 50) {
    fail(`switch to ${name}`, `only ${cost?.calls ?? 0} draw calls — a partial figure`);
  } else {
    pass(`switch to ${name}`, `${cost.calls} draw calls, ${cost.triangles} triangles`);
  }
};

/**
 * A panel of choices that says WHICH one is chosen.
 *
 * The pose and base pickers conveyed the current selection with a colour
 * and nothing else — no `aria-pressed`, unlike every other picker in the
 * product — so the choice existed for sighted users and for nobody else.
 * This is the regression guard for that fix, asked of the live DOM
 * because that is where the attribute either is or is not.
 */
const assertAnnouncesSelection = async (category) => {
  if (!(await openCategory(category))) return;
  const state = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="customization-panel"]');
    const options = [...(panel?.querySelectorAll("button[aria-pressed]") ?? [])];
    return {
      options: options.length,
      chosen: options.filter((node) => node.getAttribute("aria-pressed") === "true").length,
    };
  });
  if (state.options < 2) {
    fail(`${category} announces its selection`, `only ${state.options} control(s) say so`);
  } else if (state.chosen === 0) {
    fail(`${category} announces its selection`, "nothing is marked as the current choice");
  } else {
    pass(`${category} announces its selection`, `${state.chosen} of ${state.options}`);
  }
};

console.log("\n5. Shiva");
await switchTo("Shiva");
await shot("05-shiva");
await assertAnnouncesSelection("Pose");
if (await openCategory("Pose")) {
  /**
   * A pose moves JOINTS. Triangle counts do not change, so the question
   * is whether the figure's shape did — measured off the rig's own
   * skeleton rather than off the renderer's statistics.
   */
  const jointState = () => deep ? page.evaluate(() => {
    const rig = window.__devaformRig;
    return [...(rig?.joints?.keys?.() ?? [])]
      .map((id) => {
        const bone = rig.joints.get(id);
        return `${id}:${bone?.rotation.x.toFixed(3)},${bone?.rotation.y.toFixed(3)},${bone?.rotation.z.toFixed(3)}`;
      })
      .join("|");
  }) : figureSignature();
  const before = await jointState();
  const posed = await pickTile(1);
  await settle(2500);
  const after = await jointState();
  if (!posed) fail("a Shiva pose", "the Pose panel offered nothing to pick");
  else if (!before || before === after) fail("a Shiva pose", `"${posed}" moved no joint`);
  else pass("a Shiva pose", posed);
}
await assertAnnouncesSelection("Base");
await shot("06-shiva-posed");

console.log("\n6. Vishnu");
await switchTo("Vishnu");
await shot("07-vishnu");
if (await openCategory("Attributes")) {
  await settle(900);
  pass("Vishnu's attributes panel opens");
}
await shot("08-vishnu-attributes");

console.log("\n7. back to Ganesha");
await switchTo("Ganesha");
await shot("09-back-to-ganesha");

// --- 18. lighting ---------------------------------------------------------
console.log("\n8. lighting");
if (deep) {
  const lit = await page.evaluate(() => {
    const ui = window.__devaformUi?.getState();
    if (!ui) return null;
    ui.setLightingPreset("temple");
    ui.setLightingValue("warmth", -0.6);
    return ui.lighting?.preset ?? null;
  });
  await settle(1500);
  if (lit === null) fail("lighting", "no lighting store on the page");
  else pass("lighting responds");
} else {
  // Through the control a customer uses, which is the better test anyway.
  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      /^Light/.test(node.textContent ?? ""),
    );
    if (!button) return false;
    button.click();
    return true;
  });
  await settle(900);
  /**
   * INSIDE THE LIGHTING POPOVER, which is a dialog of its own.
   *
   * Searching the whole document for an unpressed one-of-a-set control
   * found the viewport's camera buttons first and clicked "Front" while
   * reporting that the lighting had responded. Third time this exact
   * trap has been sprung in this file; the answer is always to scope the
   * search to the region the question is about.
   */
  const changed = opened
    ? await page.evaluate(() => {
        const popover = document.querySelector("[role='dialog']");
        const preset = [...(popover?.querySelectorAll("button[aria-pressed]") ?? [])].find(
          (node) => node.getAttribute("aria-pressed") !== "true" && node.offsetParent !== null,
        );
        if (!preset) return null;
        const label = preset.textContent?.trim() ?? "";
        preset.click();
        return label;
      })
    : null;
  await settle(1500);
  if (!opened) fail("lighting", "no lighting control");
  else if (!changed) notes.push("lighting: the panel opened with every preset already chosen");
  else pass("lighting responds", changed);
}
await shot("10-lighting");

// --- 19-21. save, share, reopen ------------------------------------------
console.log("\n9. save and share");
await clickText("Save");
const saved = await page
  .waitForFunction(() => document.querySelector('[role="status"]') !== null, { timeout: 60_000 })
  .then(() => true)
  .catch(() => false);
const savedText = await page.evaluate(
  () => document.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null,
);
if (!saved) fail("Save", "no confirmation appeared");
else pass("Save", savedText ?? "");

await page.evaluate(() => {
  [...document.querySelectorAll('[role="status"] button')]
    .find((node) => node.getAttribute("aria-label") === "Dismiss")
    ?.click();
});
await settle(600);
await clickText("Share");
const link = await page
  .waitForFunction(
    () => document.querySelector('[role="status"] input[aria-label="Share link"]')?.value ?? null,
    { timeout: 60_000 },
  )
  .then((handle) => handle.jsonValue())
  .catch(() => null);
if (!link) fail("Share", "no link was produced");
else pass("Share", link);

if (link) {
  const shared = await browser.newPage();
  const response = await shared.goto(link, { waitUntil: "networkidle0", timeout: 120_000 });
  if (!response || response.status() >= 400) {
    fail("the share link opens", `answered ${response?.status()}`);
  } else {
    await settle(4000);
    if (OUT) await shared.screenshot({ path: `${OUT}/11-shared.png` });
    pass("the share link opens", String(response.status()));
  }
  await shared.close();
}

// --- the console ----------------------------------------------------------
console.log("\n10. the console");
const prefetch = errors.filter((entry) => /_rsc=/.test(entry.text) && /ERR_ABORTED/.test(entry.text));
const real = errors.filter((entry) => !prefetch.includes(entry));
if (real.length > 0) {
  fail("no unexplained console errors", `${real.length}`);
  for (const entry of real.slice(0, 6)) console.log(`      ${entry.kind}: ${entry.text}`);
} else {
  pass("no unexplained console errors", `${prefetch.length} router prefetch aborts, which are normal`);
}

console.log(`\n${failures.length} failure(s), ${notes.length} note(s)`);
for (const note of notes) console.log(`  · ${note}`);
await browser.close();
process.exitCode = failures.length > 0 ? 1 : 0;
