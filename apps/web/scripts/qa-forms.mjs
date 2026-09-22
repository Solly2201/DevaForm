/**
 * One editor, many forms.
 *
 * The Studio used to be three editors wearing one name: the deity was
 * the route. This walks the product as a customer now finds it — enter
 * /studio, choose a form, change your mind, save, come back — and checks
 * the things that only break in a browser: that an old deity URL still
 * lands somewhere sensible, that switching with unsaved work ASKS, that
 * cancelling really leaves the work alone, and that the forms do not
 * bleed into one another.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-forms.mjs
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
const outDir = path.join(repo, "screenshots", "forms");
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

const findings = [];
const note = (detail) => {
  findings.push(detail);
  console.log(`  ✗ ${detail}`);
};
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

const enterStudio = async () => {
  await page
    .waitForSelector('[data-testid="stage-intro"]', { timeout: 15_000 })
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
  await settle(1500);
};

const state = () =>
  page.evaluate(() => {
    const store = window.__devaformStore?.getState();
    return {
      deity: store?.config.deity,
      name: store?.characterName,
      dirty: store?.dirty,
      body: store?.config.parts.body?.assetId,
      attachments: store?.config.attachments.map((a) => a.asset.assetId).sort(),
      url: location.pathname + location.search,
    };
  });

/** Open the Divine Form category and pick a form by name. */
const chooseForm = async (name) => {
  await page.evaluate(() => {
    [...document.querySelectorAll("nav button")]
      .find((n) => n.textContent?.trim().startsWith("Divine Form"))
      ?.click();
  });
  await settle(350);
  return page.evaluate((label) => {
    const button = [...document.querySelectorAll("aside button")].find((node) =>
      node.textContent?.trim().startsWith(label),
    );
    if (!button || button.hasAttribute("disabled")) return false;
    button.click();
    return true;
  }, name);
};

const dialog = () =>
  page.evaluate(() => {
    const node = document.querySelector('[role="dialog"][aria-modal="true"]');
    return node ? node.textContent?.replace(/\s+/g, " ").trim().slice(0, 140) : null;
  });

const report = {};

// --- the canonical editor -------------------------------------------------
console.log("\ncanonical");
await page.goto(`${BASE}/studio`, { waitUntil: "networkidle0", timeout: 120_000 });
await enterStudio();
report.opened = await state();
if (!report.opened.deity) note("/studio did not open an editor");
if (report.opened.url !== "/studio") note(`/studio settled at ${report.opened.url}`);
await writeFile(path.join(outDir, "1-studio.png"), await page.screenshot({ type: "png" }));

// --- old deity URLs still resolve -----------------------------------------
console.log("\nold urls");
report.legacy = {};
for (const deity of ["shiva", "ganesha", "vishnu"]) {
  await page.goto(`${BASE}/studio/${deity}`, { waitUntil: "networkidle0", timeout: 120_000 });
  await enterStudio();
  const at = await state();
  report.legacy[deity] = at;
  if (at.deity !== deity) note(`/studio/${deity} opened ${at.deity}`);
  if (at.url !== "/studio") note(`/studio/${deity} settled at ${at.url}, not /studio`);
  console.log(`  /studio/${deity} -> ${at.url} making ${at.deity}`);
}
// A form nobody has heard of still opens the editor rather than a 404.
await page.goto(`${BASE}/studio/asura`, { waitUntil: "networkidle0", timeout: 120_000 });
await enterStudio();
report.unknownUrl = await state();
if (!report.unknownUrl.deity) note("/studio/<unknown> left the customer nowhere");

// --- switching with no unsaved work: immediate -----------------------------
console.log("\nswitching");
await page.goto(`${BASE}/studio?form=ganesha`, { waitUntil: "networkidle0", timeout: 120_000 });
await enterStudio();
const clean = await state();
if (clean.dirty) note("a freshly opened creation reports unsaved changes");
if (!(await chooseForm("Shiva"))) note("the Divine Form panel does not offer Shiva");
await settle(700);
report.cleanSwitch = await state();
if (report.cleanSwitch.deity !== "shiva") note("a clean switch did not take");
if (await dialog()) note("a clean switch asked for confirmation it did not need");

// --- switching with unsaved work: asks, and Cancel really cancels ---------
await page.evaluate(() => window.__devaformStore?.getState().setCharacterName("Work In Progress"));
await settle(300);
const dirty = await state();
if (!dirty.dirty) note("changing the name did not mark the creation unsaved");
await chooseForm("Vishnu");
await settle(400);
report.askedBeforeSwitch = await dialog();
if (!report.askedBeforeSwitch) note("switching over unsaved work did not ask");
await writeFile(path.join(outDir, "2-confirm.png"), await page.screenshot({ type: "png" }));

await page.keyboard.press("Escape");
await settle(400);
report.afterEscape = await state();
if (report.afterEscape.deity !== "shiva" || report.afterEscape.name !== "Work In Progress") {
  note("Escape on the switch dialog did not leave the work alone");
}

await chooseForm("Vishnu");
await settle(300);
await page.evaluate(() => {
  const node = document.querySelector('[role="dialog"][aria-modal="true"]');
  [...(node?.querySelectorAll("button") ?? [])]
    .find((b) => b.textContent?.trim().startsWith("Switch to"))
    ?.click();
});
await settle(900);
report.afterSwitch = await state();
if (report.afterSwitch.deity !== "vishnu") note("confirming the switch did not take");
if (report.afterSwitch.dirty) note("a fresh form opened already unsaved");

// --- the forms do not bleed ------------------------------------------------
const shivaAttachments = report.cleanSwitch.attachments ?? [];
const vishnuAttachments = report.afterSwitch.attachments ?? [];
report.bleed = shivaAttachments.filter((id) => vishnuAttachments.includes(id));
if (report.bleed.length > 0) {
  note(`attributes carried across forms: ${report.bleed.join(", ")}`);
}
if (report.afterSwitch.body === report.cleanSwitch.body) {
  note("both forms ended up on the same body");
}
await writeFile(path.join(outDir, "3-vishnu.png"), await page.screenshot({ type: "png" }));

// --- rapid repeated selection ---------------------------------------------
for (const name of ["Ganesha", "Shiva", "Vishnu", "Ganesha"]) {
  await chooseForm(name);
  await settle(180);
}
await settle(900);
report.afterRapid = await state();
if (report.afterRapid.deity !== "ganesha") {
  note(`rapid switching settled on ${report.afterRapid.deity}`);
}

// --- save a form, make another, and come back to it through the library ---
console.log("\nlibrary round trip");
await page.goto(`${BASE}/studio?form=shiva`, { waitUntil: "networkidle0", timeout: 120_000 });
await enterStudio();
const mark = `Shiva ${Date.now()}`;
await page.evaluate((name) => window.__devaformStore?.getState().setCharacterName(name), mark);
await settle(300);
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((n) => n.textContent?.trim() === "Save")?.click();
});
await page
  .waitForFunction(() => document.querySelector('[role="status"]') !== null, { timeout: 25_000 })
  .catch(() => note("saving a form reported nothing"));
await settle(700);
report.saved = await state();

// Make something else, so coming back has to actually restore.
await chooseForm("Vishnu");
await settle(800);
report.movedOn = await state();

await page.goto(`${BASE}/library`, { waitUntil: "networkidle0", timeout: 120_000 });
await settle(1200);
const opened = await page.evaluate((name) => {
  // The card's own Open control, by its label — not merely something
  // with the name in it, which is the preview image as often as not.
  const button = [...document.querySelectorAll("button")].find(
    (node) => node.getAttribute("aria-label") === `Open ${name}`,
  );
  if (!button) return false;
  button.click();
  return true;
}, mark);
if (!opened) note("the saved creation is not in the library");
await settle(2500);
await enterStudio();
report.reopened = await state();
if (report.reopened.deity !== "shiva") {
  note(`reopening a saved Shiva landed on ${report.reopened.deity}`);
}
if (report.reopened.name !== mark) note("reopening did not restore the creation's name");
if (report.reopened.url !== "/studio") {
  note(`reopening settled at ${report.reopened.url}, not /studio`);
}
if (report.reopened.dirty) note("a freshly opened creation reports unsaved changes");
await writeFile(path.join(outDir, "4-reopened.png"), await page.screenshot({ type: "png" }));

// --- a shared creation opens in the same editor ---------------------------
console.log("\nshare round trip");
await page.goto(`${BASE}/studio?form=vishnu`, { waitUntil: "networkidle0", timeout: 120_000 });
await enterStudio();
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((n) => n.textContent?.trim() === "Share")?.click();
});
const shareLink = await page
  .waitForFunction(
    () => document.querySelector('[role="status"] input[aria-label="Share link"]')?.value ?? null,
    { timeout: 30_000 },
  )
  .then((handle) => handle.jsonValue())
  .catch(() => null);
report.shareLink = shareLink;
if (!shareLink) note("sharing produced no link");
else {
  await page.goto(shareLink, { waitUntil: "networkidle0", timeout: 120_000 });
  await settle(1500);
  const openedShare = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button, a")].find((node) =>
      /open in divine studio|open in studio|edit a copy|open/i.test(node.textContent ?? ""),
    );
    if (!button) return false;
    button.click();
    return true;
  });
  if (!openedShare) note("the share page offers no way into the Studio");
  await settle(2500);
  await enterStudio();
  report.fromShare = await state();
  if (report.fromShare.deity !== "vishnu") {
    note(`a shared Vishnu opened as ${report.fromShare.deity}`);
  }
  if (report.fromShare.url !== "/studio") {
    note(`a shared creation settled at ${report.fromShare.url}, not /studio`);
  }
}

report.consoleErrors = consoleErrors;
report.findings = findings;
await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${findings.length} finding(s), ${consoleErrors.length} console error(s)`);
for (const error of consoleErrors.slice(0, 8)) console.error(`  ${error}`);
await browser.close();
process.exit(findings.length || consoleErrors.length ? 1 : 0);
