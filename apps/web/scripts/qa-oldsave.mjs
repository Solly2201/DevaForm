/**
 * A creation saved before an asset was withdrawn still opens as itself.
 *
 * `oldSaves.test.ts` asks this of the six deprecated assets and asks it
 * well. It cannot ask it of `ganesha.head.aidraft`, and that is the one
 * this repository withdrew most recently: the registry stopped offering
 * `review`-stage assets in the picker, so anyone who had chosen the AI
 * head now holds a save pointing at something they can no longer pick.
 * The reason the node test cannot cover it is specific and not a matter
 * of effort — that head's appearance is baked into textures, and a GLB
 * with baked textures cannot finish parsing in node, which has no
 * `createImageBitmap`. Measured: it stays pending for ever and draws
 * nothing, in a test that would otherwise look like a real failure.
 *
 * So it is asked in a browser, of the shipped build, and the old save is
 * made the way an old save exists — a row in the database whose stored
 * configuration names the withdrawn asset. The harness writes one through
 * the product's own API rather than pretending, then opens it.
 *
 * THE QUESTION IS NOT ONLY "DOES IT OPEN". A Studio that silently
 * replaced the missing head with the default one would open perfectly and
 * would have thrown away the customer's creation without telling them —
 * exactly the "silent automatic change" a journey is supposed to catch.
 * So it opens the save, presses Save again, and reads back what was
 * stored: the head has to still be the one they chose.
 *
 * Prereq: a production server on localhost:3000 (`next start`).
 * Run from apps/web:  node scripts/qa-oldsave.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const repo = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outDir = path.join(repo, "screenshots", "oldsave");
await mkdir(outDir, { recursive: true });

/** The asset that is no longer offered, and the save that still names it. */
const WITHDRAWN = { assetId: "ganesha.head.aidraft", version: 2 };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(0, 140)}`);
});
page.on("dialog", (d) => void d.accept().catch(() => null));

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const record = (step, ok, detail = "") => {
  console.log(`  ${ok ? "·" : "✗"} ${step}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(`${step}${detail ? `: ${detail}` : ""}`);
};

const clickText = (text) =>
  page.evaluate((want) => {
    const node = [...document.querySelectorAll("button, a")].find(
      (candidate) => candidate.textContent?.trim() === want,
    );
    if (!node) return false;
    node.click();
    return true;
  }, text);

async function intoStudio(url) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 180_000 });
  await page
    .evaluate(() => {
      [...document.querySelectorAll('[data-testid="stage-intro"] button')]
        .find((node) => node.textContent?.trim().toLowerCase() === "enter")
        ?.click();
    })
    .catch(() => null);
  await page
    .waitForFunction(() => document.querySelector('[data-testid="temple-opening"]') === null, {
      timeout: 180_000,
      polling: 200,
    })
    .catch(() => null);
  await page.waitForSelector("canvas", { timeout: 120_000 }).catch(() => null);
  await settle(4000);
}

const canvasPrint = () =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/jpeg", 0.4).slice(-1200);
    } catch {
      return null;
    }
  });

// --------------------------------------------- a Ganesha, saved as normal
await intoStudio(`${BASE}/studio`);
await clickText("Save");
await settle(4000);
const todays = await page.evaluate(async () => {
  const listed = await fetch("/api/characters").then((r) => r.json());
  const first = listed.characters?.[0];
  if (!first) return null;
  const full = await fetch(`/api/characters/${first.id}`).then((r) => r.json());
  return { id: full.id, config: full.config };
});
record("a creation can be saved and read back", Boolean(todays?.config), todays?.id ?? "");
const withDefaultHead = await canvasPrint();

// ------------------------------- and the same creation as it was saved then
/**
 * Written through the product's own API, so the row is exactly what a
 * save made before the withdrawal looks like — including the server-side
 * validation, which has to accept a reference to a withdrawn asset or no
 * old save could ever be reopened at all.
 */
const older = todays
  ? await page.evaluate(
      async (config, withdrawn) => {
        const edited = { ...config, parts: { ...config.parts, head: withdrawn } };
        const response = await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "An Older Ganesha", config: edited }),
        });
        const body = await response.json().catch(() => ({}));
        return { status: response.status, id: body.id ?? null, error: body.error ?? null };
      },
      todays.config,
      WITHDRAWN,
    )
  : null;
record(
  "the server still accepts a save that names the withdrawn asset",
  older?.status === 201 && Boolean(older.id),
  older ? `${older.status}${older.error ? ` ${older.error}` : ""}` : "nothing to write",
);

// The picker must not be offering it — that is why this file exists.
const offered = await page.evaluate(async (id) => {
  const response = await fetch(`/api/characters/${id}`);
  return response.ok;
}, older?.id ?? "none");
record("and hands it back when asked for by id", offered);

// ------------------------------------------------------ open it, and look
if (older?.id) {
  await intoStudio(`${BASE}/studio`);
  await clickText("Library");
  await settle(1500);
  await page.evaluate(() => {
    const dialog = document.querySelector('[aria-labelledby="confirm-title"]');
    if (dialog) {
      [...dialog.querySelectorAll("button")].find((n) => n.textContent?.trim() === "Leave")?.click();
    }
  });
  await page
    .waitForFunction(() => location.pathname.startsWith("/library"), { timeout: 60_000, polling: 200 })
    .catch(() => null);
  await settle(3000);
  const opened = await page.evaluate(
    () => document.querySelector('[aria-label="Open An Older Ganesha"]') !== null,
  );
  record("the old creation is in the library beside the new one", opened);
  if (opened) {
    await page.evaluate(() =>
      document.querySelector('[aria-label="Open An Older Ganesha"]')?.click(),
    );
    await page
      .waitForFunction(() => location.pathname.startsWith("/studio"), { timeout: 60_000, polling: 200 })
      .catch(() => null);
    await page
      .waitForFunction(() => document.querySelector('[data-testid="temple-opening"]') === null, {
        timeout: 180_000,
        polling: 200,
      })
      .catch(() => null);
    await page.waitForSelector("canvas", { timeout: 120_000 }).catch(() => null);
    await settle(9000);

    const withOldHead = await canvasPrint();
    const shown = await page.evaluate(() => ({
      name: document.querySelector('input[aria-label="Creation name"]')?.value ?? "",
      drawn: Boolean(document.querySelector("canvas")?.width),
    }));
    record(
      "it opens, with its own name, and a statue in the viewport",
      shown.name === "An Older Ganesha" && shown.drawn,
      `"${shown.name}", ${shown.drawn ? "drawn" : "nothing drawn"}`,
    );
    /**
     * And it is NOT the figure the picker would have built. A Studio that
     * quietly fell back to the default head would pass every check above.
     */
    record(
      "and it is wearing the head it was saved with, not today's default",
      withOldHead !== null && withDefaultHead !== null && withOldHead !== withDefaultHead,
      withOldHead === withDefaultHead ? "the two figures are identical" : "the figures differ",
    );
    /**
     * AND THE PICKER SAYS WHAT IT IS WEARING.
     *
     * The figure can be right while the panel is wrong. With the head
     * withdrawn from the listing, the Head category showed four cards and
     * none of them selected: nothing on screen said what the customer had
     * on, and one click on any other head would have lost it for good,
     * because the one they were wearing was not there to click back to.
     */
    await clickText("Head");
    await settle(2500);
    const picker = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="customization-panel"]');
      const cards = [...(panel?.querySelectorAll("button") ?? [])].filter((node) =>
        node.querySelector("img"),
      );
      const chosen = cards.find((node) => node.getAttribute("aria-pressed") === "true");
      return {
        cards: cards.length,
        chosen: chosen?.textContent?.trim().replace(/\s+/g, " ") ?? null,
      };
    });
    record(
      "the picker shows the head it is wearing, and marks it as chosen",
      Boolean(picker.chosen),
      picker.chosen ? `${picker.cards} cards, "${picker.chosen}"` : `${picker.cards} cards, none chosen`,
    );
    record(
      "and says it is no longer offered, so clicking away from it is a choice",
      /no longer offered/i.test(picker.chosen ?? ""),
      picker.chosen ?? "",
    );
    await page.screenshot({ path: path.join(outDir, "01-old-save.png") });

    // --------------------------------- and saving it does not rewrite it
    await clickText("Save");
    await settle(5000);
    const stored = await page.evaluate(
      async (id) => (await fetch(`/api/characters/${id}`).then((r) => r.json())).config,
      older.id,
    );
    const head = stored?.parts?.head ?? null;
    record(
      "saving it again keeps the asset it names rather than swapping it",
      head?.assetId === WITHDRAWN.assetId && head?.version === WITHDRAWN.version,
      head ? `${head.assetId}@${head.version}` : "no head stored",
    );
  }
}

await browser.close();
console.log(`\n${failures.length} failure(s), ${errors.length} console/network error(s)`);
for (const failure of failures) console.error(`  ✗ ${failure}`);
for (const error of [...new Set(errors)].slice(0, 10)) console.error(`  ${error}`);
if (failures.length > 0 || errors.length > 0) process.exit(1);
