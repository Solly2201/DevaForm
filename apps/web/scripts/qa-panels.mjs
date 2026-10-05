/**
 * Every picker, for every form, as the customer sees it.
 *
 * The visual QA sheet photographs the STATUE. Nothing photographed the
 * panel beside it, so the things a customer meets first — what the
 * categories are called, whether the same category means the same thing
 * on another deity, whether a card says anything about being unavailable
 * — were only ever judged from source.
 *
 * So this walks the sidebar of each form, opens every category and every
 * subcategory in it, and writes one picture per panel along with what it
 * found: the category names, the subcategory names, how many cards, and
 * how many of those cards are marked in any way (selected, new, blocked).
 *
 * It is a SHEET, not a judgement. It fails only on what cannot be a
 * matter of taste: a request the server refused, or a console error on
 * the way. The counts are reported for comparison between forms — that
 * is the category-consistency question — and the pictures are what the
 * audit actually reads.
 *
 * Prereq: a production server on localhost:3000 (`next start`).
 * Run from apps/web:  node scripts/qa-panels.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const FORMS = ["ganesha", "shiva", "vishnu"];

const outDir = path.join(repo, "screenshots", "panels");
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
  ],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
// The URL, not just "failed to load": a console line that names no
// resource cannot be acted on, and a sheet that fails on it says nothing.
page.on("response", (response) => {
  if (response.status() >= 400) errors.push(`${response.status()} ${response.url().slice(0, 160)}`);
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const sheet = [];

for (const form of FORMS) {
  await page.goto(`${BASE}/studio?form=${form}`, {
    waitUntil: "networkidle2",
    timeout: 180_000,
  });
  // Through the entry, if this visit gets one.
  await page
    .evaluate(() => {
      const button = [...document.querySelectorAll('[data-testid="stage-intro"] button')].find(
        (node) => node.textContent?.trim().toLowerCase() === "enter",
      );
      button?.click();
    })
    .catch(() => null);
  await page
    .waitForFunction(() => document.querySelector('[data-testid="temple-opening"]') === null, {
      timeout: 180_000,
      polling: 150,
    })
    .catch(() => null);
  await settle(600);

  /** The sidebar's categories, by their visible names. */
  const categories = await page.evaluate(() =>
    [...document.querySelectorAll("nav button, aside button")]
      .map((node) => node.textContent?.trim() ?? "")
      .filter((text) => text.length > 0 && text.length < 24),
  );

  for (const category of categories) {
    const opened = await page.evaluate((name) => {
      const button = [...document.querySelectorAll("nav button, aside button")].find(
        (node) => node.textContent?.trim() === name,
      );
      if (!button) return false;
      button.click();
      return true;
    }, category);
    if (!opened) continue;
    await settle(450);

    const panel = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("button, [role='radio']")].filter((node) =>
        node.querySelector("img, canvas"),
      );
      const marked = cards.filter((node) => {
        const text = node.textContent ?? "";
        return (
          /\b(NEW|SOON|UNAVAILABLE|NOT AVAILABLE|IN USE)\b/i.test(text) ||
          node.getAttribute("aria-disabled") === "true" ||
          node.hasAttribute("disabled")
        );
      });
      const notices = [...document.querySelectorAll("li")]
        .map((node) => node.textContent?.trim() ?? "")
        .filter((text) => text.length > 12 && text.length < 160);
      const heading = document.querySelector("aside h2, aside h3, h2")?.textContent?.trim() ?? "";
      return { cards: cards.length, marked: marked.length, notices, heading };
    });

    const slug = `${FORMS.indexOf(form) + 1}-${form}-${category.replace(/\W+/g, "-").toLowerCase()}`;
    await page.screenshot({ path: path.join(outDir, `${slug}.png`) });
    sheet.push({ form, category, ...panel });
    // Deliberately NOT a failure. Several panels are sliders, mudra
    // buttons or colour wells rather than thumbnail cards, and a counter
    // that calls those broken is a counter nobody will trust. The count
    // is reported; the pictures are what the audit reads.
    console.log(
      `  ${form} · ${category}: ${panel.cards} card(s), ${panel.marked} marked` +
        (panel.notices.length ? `, ${panel.notices.length} notice(s)` : ""),
    );
  }
}

await writeFile(path.join(outDir, "report.json"), JSON.stringify({ sheet, errors }, null, 2));
await browser.close();

if (errors.length > 0) failures.push(`${errors.length} console error(s)`);
console.log(`\n${sheet.length} panel(s) -> screenshots/panels`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
