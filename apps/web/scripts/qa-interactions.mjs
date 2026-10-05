/**
 * Clicking every control in the Studio, and writing down what happened.
 *
 * A component that renders is not a control that works. This drives the
 * real Studio in a real browser: it opens every category, clicks every
 * asset, pose, gesture, swatch and camera preset it finds, and after each
 * one asks whether anything actually CHANGED — the configuration, the
 * selection, the view — so a control that quietly does nothing is a
 * finding rather than a shrug.
 *
 * It also watches for the things that make an application feel broken
 * without erroring: dead buttons, selections that do not show, overlays
 * that eat clicks, controls clipped out of a short window, focus that
 * cannot be seen, and anything a customer should never read.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-interactions.mjs [--deity vishnu] [--width W --height H]
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
const width = Number(flag("width", 1600));
const height = Number(flag("height", 900));
const runName = flag("out", `interactions-${deity}-${width}x${height}`);

const outDir = path.join(repo, "screenshots", runName);
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  defaultViewport: { width, height },
});
const page = await browser.newPage();
const consoleErrors = [];
const consoleWarnings = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
  if (m.type() === "warning") consoleWarnings.push(m.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

const findings = [];
let report_journeySave = null;
let report_journeyShare = null;
let report_journeyExport = null;
let report_journeyNew = null;
let report_journeyDirty = null;
const note = (severity, area, detail) => {
  findings.push({ severity, area, detail });
  console.log(`  ${severity === "bug" ? "✗" : "·"} ${area}: ${detail}`);
};
const settle = (ms = 260) => new Promise((r) => setTimeout(r, ms));

// --- get into the Studio, past the entry ----------------------------------
await page.goto(`${BASE}/studio?form=${deity}`, { waitUntil: "networkidle0", timeout: 120_000 });
await page
  .waitForSelector('[data-testid="stage-intro"]', { timeout: 20_000 })
  .then(async () => {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('[data-testid="stage-intro"] button')].find(
        (node) => node.textContent?.trim().toLowerCase() === "enter",
      );
      button?.click();
    });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="stage-intro"]') === null,
      { timeout: 90_000 },
    );
  })
  .catch(() => null);
await settle(1600);

/** The configuration the Studio is actually holding. */
const config = () => page.evaluate(() => JSON.stringify(window.__devaformStore?.getState().config));

/** Everything a customer can click, with enough about it to judge. */
const controls = () =>
  page.evaluate(() => {
    const seen = [];
    for (const node of document.querySelectorAll(
      "button, [role='button'], a[href], select, input",
    )) {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (box.width === 0 || box.height === 0) continue;
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      const label =
        node.getAttribute("aria-label") ||
        node.getAttribute("title") ||
        node.textContent?.trim().replace(/\s+/g, " ").slice(0, 48) ||
        node.getAttribute("name") ||
        "";
      // What is actually on top at the control's own centre — an overlay
      // eating the click is invisible until you ask.
      const x = Math.min(innerWidth - 1, Math.max(0, box.left + box.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2));
      const topmost = document.elementFromPoint(x, y);
      seen.push({
        tag: node.tagName.toLowerCase(),
        type: node.getAttribute("type"),
        label,
        disabled: node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true",
        box: { x: box.left, y: box.top, w: box.width, h: box.height },
        clipped:
          box.bottom > innerHeight + 1 ||
          box.right > innerWidth + 1 ||
          box.top < -1 ||
          box.left < -1,
        reachable: topmost === node || node.contains(topmost),
        obscuredBy:
          topmost && !(topmost === node || node.contains(topmost))
            ? `${topmost.tagName.toLowerCase()}.${String(topmost.className).slice(0, 40)}`
            : null,
      });
    }
    return seen;
  });

// --- 1. every control is reachable, labelled and big enough ---------------
console.log("\ncontrols");
const inventory = await controls();
for (const control of inventory) {
  if (!control.label) {
    note("bug", "labels", `an unlabelled ${control.tag} at ${Math.round(control.box.x)},${Math.round(control.box.y)}`);
  }
  if (!control.reachable) {
    note("bug", "pointer", `"${control.label}" is covered by ${control.obscuredBy}`);
  }
  if (control.clipped) {
    note("bug", "layout", `"${control.label}" is clipped out of the window`);
  }
  if (control.box.h < 20 || control.box.w < 20) {
    note(
      "polish",
      "target",
      `"${control.label}" is only ${Math.round(control.box.w)}×${Math.round(control.box.h)}`,
    );
  }
}
console.log(`  ${inventory.length} visible controls`);

// --- 2. every category opens its own panel --------------------------------
console.log("\ncategories");
const categories = await page.evaluate(() =>
  [...document.querySelectorAll("nav button, aside button")]
    .map((node) => node.textContent?.trim())
    .filter(Boolean),
);
const panelHeading = () =>
  page.evaluate(() => document.querySelector("aside h2, aside h1, [data-panel-title]")?.textContent?.trim() ?? null);

const categoryReport = [];
for (const name of categories) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll("nav button, aside button")].find(
      (node) => node.textContent?.trim() === label,
    );
    if (!button) return false;
    button.click();
    return true;
  }, name);
  if (!clicked) continue;
  await settle(320);
  const heading = await panelHeading();
  const selected = await page.evaluate((label) => {
    const button = [...document.querySelectorAll("nav button, aside button")].find(
      (node) => node.textContent?.trim() === label,
    );
    if (!button) return null;
    return {
      ariaCurrent: button.getAttribute("aria-current"),
      ariaSelected: button.getAttribute("aria-selected"),
      pressed: button.getAttribute("aria-pressed"),
      className: String(button.className),
    };
  }, name);
  categoryReport.push({ name, heading, selected });
  if (!heading) note("bug", "panels", `"${name}" opened no titled panel`);
  const marks = selected
    ? [selected.ariaCurrent, selected.ariaSelected, selected.pressed].filter(Boolean)
    : [];
  if (marks.length === 0) {
    note(
      "polish",
      "a11y",
      `"${name}" shows its selected state with styling only — nothing in the accessibility tree`,
    );
  }
}
console.log(`  ${categoryReport.length} categories opened`);

// --- 3. asset pickers actually change the character -----------------------
console.log("\npickers");
let changed = 0;
let inert = 0;
for (const name of categories) {
  await page.evaluate((label) => {
    [...document.querySelectorAll("nav button, aside button")]
      .find((node) => node.textContent?.trim() === label)
      ?.click();
  }, name);
  await settle(300);
  // Options inside the panel, minus the category rail itself.
  const options = await page.evaluate(() => {
    const panel = document.querySelectorAll("aside");
    const last = panel[panel.length - 1];
    if (!last) return 0;
    return [...last.querySelectorAll("button")].length;
  });
  for (let index = 0; index < Math.min(options, 8); index += 1) {
    const before = await config();
    const beforeUi = await page.evaluate(() =>
      JSON.stringify(window.__devaformUi?.getState() ?? null, (key, value) =>
        typeof value === "function" ? undefined : value,
      ),
    );
    const beforeDom = await page.evaluate(() => {
      const panels = document.querySelectorAll("aside");
      return panels[panels.length - 1]?.innerHTML.length ?? 0;
    });
    const clicked = await page.evaluate((at) => {
      const panels = document.querySelectorAll("aside");
      const last = panels[panels.length - 1];
      const button = last?.querySelectorAll("button")[at];
      if (!button || button.hasAttribute("disabled")) return null;
      // Clicking what is already chosen is meant to do nothing; a probe
      // that counts it as a dead control is reporting on itself.
      if (
        button.getAttribute("aria-pressed") === "true" ||
        button.getAttribute("aria-current") === "true"
      ) {
        return null;
      }
      button.scrollIntoView({ block: "center" });
      button.click();
      return button.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ?? "(unlabelled)";
    }, index);
    if (clicked === null) continue;
    await settle(360);
    const afterDom = await page.evaluate(() => {
      const panels = document.querySelectorAll("aside");
      return panels[panels.length - 1]?.innerHTML.length ?? 0;
    });
    const after = await config();
    const afterUi = await page.evaluate(() =>
      JSON.stringify(window.__devaformUi?.getState() ?? null, (key, value) =>
        typeof value === "function" ? undefined : value,
      ),
    );
    if (before === after && beforeUi === afterUi && beforeDom === afterDom) {
      inert += 1;
      note("bug", "picker", `"${name}" → "${clicked}" changed nothing`);
    } else changed += 1;
  }
}
console.log(`  ${changed} clicks changed the configuration, ${inert} did not`);

// --- 4. the camera presets ------------------------------------------------
console.log("\ncamera");
const views = ["¾", "Front", "Face", "Back", "Left", "Right"];
for (const view of views) {
  const before = await page.evaluate(
    () => JSON.stringify(window.__devaformUi?.getState().cameraCommand ?? null),
  );
  const clicked = await page.evaluate((label) => {
    const group = document.querySelector('[role="group"][aria-label="Camera view"]');
    const button = [...(group?.querySelectorAll("button") ?? [])].find(
      (node) => node.textContent?.trim() === label,
    );
    if (!button) return false;
    button.click();
    return true;
  }, view);
  if (!clicked) {
    note("bug", "camera", `no "${view}" view control`);
    continue;
  }
  await settle(200);
  const after = await page.evaluate(
    () => JSON.stringify(window.__devaformUi?.getState().cameraCommand ?? null),
  );
  if (before === after) note("bug", "camera", `"${view}" did nothing`);
  const marked = await page.evaluate((label) => {
    const group = document.querySelector('[role="group"][aria-label="Camera view"]');
    const button = [...(group?.querySelectorAll("button") ?? [])].find(
      (node) => node.textContent?.trim() === label,
    );
    return button?.getAttribute("aria-pressed");
  }, view);
  if (marked !== "true") note("bug", "camera", `"${view}" does not show that it is current`);
}

// --- 5. undo and redo -----------------------------------------------------
console.log("\nhistory");
const beforeUndo = await config();
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").toLowerCase().includes("undo"),
  );
  button?.click();
});
await settle(420);
const afterUndo = await config();
if (beforeUndo === afterUndo) note("bug", "history", "Undo did not change the configuration");
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").toLowerCase().includes("redo"),
  );
  button?.click();
});
await settle(420);
const afterRedo = await config();
if (afterRedo !== beforeUndo) {
  note("bug", "history", "Redo did not restore what Undo removed");
}

// --- 5b. the journey a customer actually takes ---------------------------
console.log("\njourney");
const status = () =>
  page.evaluate(() => {
    const live = document.querySelector('[role="status"]');
    return live ? live.textContent?.replace(/\s+/g, " ").trim() ?? "" : null;
  });
const press = async (label) => {
  const ok = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === text,
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);
  if (!ok) note("bug", "journey", `no "${label}" control`);
  return ok;
};

/**
 * What the page looked like when something did not happen.
 *
 * This step reported "Save reported nothing" for two runs while Save
 * worked perfectly when pressed by hand and when pressed after
 * fifty-four tile clicks in a standalone probe. An assertion that fails
 * without evidence costs more than it catches: it cannot be told apart
 * from a real regression, so it gets explained away, and the next real
 * one is explained away too.
 */
const evidence = async (what) => {
  const state = await page.evaluate(() => {
    const buttonsNamed = (text) =>
      [...document.querySelectorAll("button")]
        .filter((node) => node.textContent?.trim() === text)
        .map((node) => ({
          disabled: node.disabled,
          hidden: node.offsetParent === null,
          inDialog: Boolean(node.closest("[role='dialog']")),
        }));
    return {
      status: document.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      liveRegions: document.querySelectorAll('[role="status"]').length,
      openDialogs: document.querySelectorAll("[role='dialog']").length,
      save: buttonsNamed("Save"),
      saving: buttonsNamed("Saving…"),
      share: buttonsNamed("Share"),
      characterId: (() => {
        try {
          return JSON.parse(localStorage.getItem("devaform.editor") ?? "null")?.state?.characterId ?? null;
        } catch {
          return null;
        }
      })(),
    };
  });
  console.log(`    ${what}: ${JSON.stringify(state)}`);
  return state;
};

if (await press("Save")) {
  await page
    .waitForFunction(() => document.querySelector('[role="status"]') !== null, { timeout: 30_000 })
    .catch(async () => {
      const state = await evidence("Save said nothing; page state");
      note(
        "bug",
        "journey",
        `Save reported nothing (${state.save.length} Save control(s), ` +
          `${state.saving.length} mid-save, ${state.openDialogs} dialog(s) open, ` +
          `saved id ${state.characterId ?? "none"})`,
      );
    });
  report_journeySave = await status();
  console.log(`  Save → ${report_journeySave}`);
}
await settle(600);

if (await press("Share")) {
  await page
    .waitForFunction(
      () => document.querySelector('[role="status"] input[aria-label="Share link"]') !== null,
      { timeout: 25_000 },
    )
    .catch(async () => {
      const state = await evidence("Share produced no link; page state");
      note(
        "bug",
        "journey",
        `Share produced no link the customer can keep (status ${JSON.stringify(state.status)}, ` +
          `saved id ${state.characterId ?? "none"})`,
      );
    });
  report_journeyShare = await page.evaluate(
    () => document.querySelector('[role="status"] input[aria-label="Share link"]')?.value ?? null,
  );
  console.log(`  Share → ${report_journeyShare}`);
  if (report_journeyShare) {
    const shared = await page.browser().newPage();
    const response = await shared.goto(report_journeyShare, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!response || response.status() >= 400) {
      note("bug", "journey", `the share link answers ${response?.status()}`);
    }
    await shared.close();
  }
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="status"] button')]
      .find((node) => node.getAttribute("aria-label") === "Dismiss")
      ?.click();
  });
}
await settle(400);

// Export: the dialog opens, downloads are offered, Escape closes it, and
// focus comes back to where it was.
if (await press("Export")) {
  await settle(500);
  const dialog = await page.evaluate(() => {
    const node = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!node) return null;
    return {
      buttons: [...node.querySelectorAll("button")].map((b) => b.textContent?.trim().slice(0, 24)),
      focusInside: node.contains(document.activeElement),
    };
  });
  if (!dialog) note("bug", "journey", "Export opened no dialog");
  else {
    if (!dialog.focusInside) note("bug", "a11y", "the Export dialog does not take focus");
    report_journeyExport = dialog.buttons;
    await page.keyboard.press("Escape");
    await settle(400);
    const stillOpen = await page.evaluate(
      () => document.querySelector('[role="dialog"][aria-modal="true"]') !== null,
    );
    if (stillOpen) note("bug", "a11y", "Escape does not close the Export dialog");
  }
}
await settle(300);

// New over unsaved work must ask — in the product, not in the browser.
// The work has to actually BE unsaved, so the configuration is changed
// and the change confirmed before New is pressed.
//
// Through a NAMED control, not by clicking the first eight buttons of
// whichever panel happened to be open. That is what this did, and the
// panel left open by the preceding steps is often one whose first
// buttons are subsection tabs — so the sweep reported "could not make
// the creation dirty" about a product in which changing the base works
// perfectly. A harness that cries wolf is worse than no harness.
const beforeDirty = await config();
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((node) => node.textContent?.trim() === "Base")
    ?.click();
});
await settle(400);
// Every base style in turn until one of them is not the current one.
// Picking a fixed tile is not enough: this sweep has already clicked
// every picker in every category by now, so the creation is sitting on
// whichever base happened to be last in the list.
const bases = await page.evaluate(
  () => [...([...document.querySelectorAll("aside")].pop()?.querySelectorAll("button") ?? [])].length,
);
for (let tile = 0; tile < bases; tile += 1) {
  await page.evaluate((at) => {
    const panel = [...document.querySelectorAll("aside")].pop();
    panel?.querySelectorAll("button")[at]?.click();
  }, tile);
  await settle(350);
  if ((await config()) !== beforeDirty) break;
}
report_journeyDirty = (await config()) !== beforeDirty;
if (!report_journeyDirty) note("bug", "journey", "could not make the creation dirty");
await settle(300);
if (await press("New")) {
  await settle(400);
  const asked = await page.evaluate(() => {
    const node = document.querySelector('[role="dialog"][aria-modal="true"]');
    return node ? node.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) : null;
  });
  if (!asked) note("bug", "journey", "New did not ask before discarding unsaved work");
  report_journeyNew = asked;
  await page.keyboard.press("Escape");
  await settle(300);
}

// --- 6. nothing developer-facing on screen --------------------------------
const text = await page.evaluate(() => document.body.innerText);
for (const smell of [
  "undefined",
  "NaN",
  "[object Object]",
  "TODO",
  "FIXME",
  "lorem",
  "placeholder",
  "DIVYAFORGE",
  "divyaforge",
  "Claude",
  "Anthropic",
  "Gemini",
]) {
  if (text.includes(smell)) note("bug", "copy", `the screen reads "${smell}"`);
}

// --- 7. focus is visible --------------------------------------------------
await page.keyboard.press("Tab");
await settle(120);
const focus = await page.evaluate(() => {
  const node = document.activeElement;
  if (!node || node === document.body) return null;
  const style = getComputedStyle(node);
  return {
    label: node.getAttribute("aria-label") || node.textContent?.trim().slice(0, 32) || node.tagName,
    outline: style.outlineStyle !== "none" && style.outlineWidth !== "0px",
    ring: style.boxShadow !== "none",
  };
});
if (!focus) note("bug", "a11y", "Tab reached nothing");
else if (!focus.outline && !focus.ring) {
  note("bug", "a11y", `focus on "${focus.label}" is invisible`);
}

// --- every control a screen reader can name ------------------------------
//
// A button whose only content is an icon is a button a screen reader
// announces as "button". The Studio is full of them — camera presets,
// undo, the dismiss on a toast — and each one needs a name of its own.
const unnamed = await page.evaluate(() => {
  const name = (node) =>
    (
      node.getAttribute("aria-label") ||
      node.getAttribute("title") ||
      node.textContent ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
  return [...document.querySelectorAll("button, a[href], input, select")]
    .filter((node) => {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return false;
      if (node.getAttribute("aria-hidden") === "true") return false;
      return name(node).length === 0;
    })
    .map((node) => `${node.tagName.toLowerCase()}${node.className ? "." + String(node.className).split(" ")[0] : ""}`);
});
for (const control of [...new Set(unnamed)].slice(0, 8)) {
  note("bug", "a11y", `a ${control} offers no name to a screen reader`);
}

const unlabelledImages = await page.evaluate(() =>
  [...document.querySelectorAll("img")].filter(
    (node) =>
      node.getAttribute("alt") === null && node.getAttribute("aria-hidden") !== "true",
  ).length,
);
if (unlabelledImages > 0) {
  note("bug", "a11y", `${unlabelledImages} image(s) with neither alt text nor aria-hidden`);
}

await writeFile(path.join(outDir, "studio.png"), await page.screenshot({ type: "png" }));
await writeFile(
  path.join(outDir, "report.json"),
  JSON.stringify(
    {
      deity,
      width,
      height,
      controls: inventory.length,
      categories: categoryReport,
      pickers: { changed, inert },
      journey: {
        save: report_journeySave,
        share: report_journeyShare,
        exportButtons: report_journeyExport,
        madeDirty: report_journeyDirty,
        newAsks: report_journeyNew,
      },
      findings,
      consoleErrors,
      consoleWarnings: consoleWarnings.slice(0, 20),
    },
    null,
    2,
  ),
);

console.log(`\n${findings.filter((f) => f.severity === "bug").length} bug(s), ${findings.filter((f) => f.severity === "polish").length} polish note(s)`);
if (consoleErrors.length) {
  console.error(`${consoleErrors.length} console error(s):`);
  for (const error of consoleErrors.slice(0, 10)) console.error(`  ${error}`);
}
await browser.close();
