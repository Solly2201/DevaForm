/**
 * The journey a customer's creation actually takes, end to end.
 *
 * Make it, change it, save it, find it in the library, open it again,
 * share it, open the share, reload on it — and then the ways it can go
 * wrong: a share id that is not a share, a creation id that does not
 * exist, a configuration the schema will not accept.
 *
 * The interactions sweep presses every control once; this follows ONE
 * creation through the whole product and asks at each step whether what
 * came back is what went in. The thing it is really guarding is the
 * round trip: a creation that saves and reopens as something slightly
 * different is the worst failure this product has, because nothing errors
 * and the customer is the only one who notices.
 *
 * Prereq: `pnpm dev` running on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-journey.mjs
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
const outDir = path.join(repo, "screenshots", "journey");
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
page.on("pageerror", (error) => consoleErrors.push(String(error)));

const findings = [];
const check = (ok, what, detail = "") => {
  if (!ok) findings.push(`${what}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ${ok ? "·" : "✗"} ${what}${detail && !ok ? ` — ${detail}` : ""}`);
  return ok;
};
const settle = (ms = 350) => new Promise((r) => setTimeout(r, ms));

async function intoStudio(url) {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 120_000 });
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
        { timeout: 120_000 },
      );
    })
    .catch(() => null);
  await settle(2200);
}

/** The configuration the Studio is holding, as the customer's own state. */
const config = () =>
  page.evaluate(() => {
    const state = window.__devaformStore?.getState?.();
    return state ? JSON.stringify(state.config) : null;
  });
const press = (label) =>
  page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === text,
    );
    button?.click();
    return Boolean(button);
  }, label);

console.log("\nmake and change");
await intoStudio(`${BASE}/studio?form=shiva`);

/**
 * THIS HARNESS NEEDS THE DEV BUILD, and says so instead of crashing.
 *
 * Every check below reads `window.__devaformStore`, which is a dev-only
 * handle — `editorStore.ts` only publishes it when NODE_ENV is not
 * production. Pointed at a production server it used to die on an
 * uncaught TypeError four steps in, which reads as "the round trip is
 * broken" when what is broken is the harness's own assumption. A QA
 * script that cannot run should say that it cannot run.
 */
const hasHandle = await page
  .waitForFunction(() => Boolean(window.__devaformStore), { timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
if (!hasHandle) {
  console.error("");
  console.error("This journey reads the Studio's own store through a dev-only handle,");
  console.error("and this server is not serving the dev build. Run `pnpm dev` and");
  console.error("point DEVAFORM_URL at it. Nothing was tested.");
  await browser.close();
  process.exit(2);
}

check((await config()) !== null, "the Studio exposes the creation it is holding");

// A change the round trip has to carry: a different base, and a name.
await press("Base");
await settle(400);
await page.evaluate(() => {
  const panel = [...document.querySelectorAll("aside")].pop();
  panel?.querySelectorAll("button")[1]?.click();
});
await settle(500);
await page.evaluate(() => {
  const field = document.querySelector('input[aria-label="Creation name"]');
  if (!field) return;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(field, "Journey Shiva");
  field.dispatchEvent(new Event("input", { bubbles: true }));
});
await settle(400);
const made = await config();
check(await page.evaluate(() => window.__devaformStore.getState().dirty), "changing it marks it unsaved");

console.log("\nsave");
await press("Save");
await page
  .waitForFunction(() => document.querySelector('[role="status"]') !== null, { timeout: 25_000 })
  .catch(() => null);
await settle(600);
const savedId = await page.evaluate(() => window.__devaformStore.getState().characterId);
check(Boolean(savedId), "saving returns an id the creation can be found by", String(savedId));
check(
  (await page.evaluate(() => window.__devaformStore.getState().dirty)) === false,
  "and the creation is no longer unsaved",
);
await page.screenshot({ path: path.join(outDir, "1-saved.png") });

console.log("\nlibrary");
await page.goto(`${BASE}/library`, { waitUntil: "networkidle0", timeout: 60_000 });
await settle(900);
const inLibrary = await page.evaluate(
  () => document.body.innerText.includes("Journey Shiva"),
);
check(inLibrary, "the creation is in the library under its own name");
const hasPreview = await page.evaluate(
  () => [...document.querySelectorAll("img")].some((i) => i.src.startsWith("data:image")),
);
check(hasPreview, "and carries a preview of itself");
await page.screenshot({ path: path.join(outDir, "2-library.png") });

console.log("\nreopen");
// The OPEN control, not the card's name — the name is a rename field,
// and clicking it leaves the customer exactly where they were. An
// earlier version of this script clicked it and then reported that the
// product had reopened the creation as a different deity, which it had
// not: the Studio it measured was simply the one it never left.
const opened = await page.evaluate(() => {
  // From the Open control OUTWARD, rather than guessing which element is
  // a card: whichever Open button has the name somewhere above it is the
  // one that belongs to this creation.
  const open = [...document.querySelectorAll("button")]
    .filter((node) => node.textContent?.trim() === "Open")
    .find((node) => {
      let parent = node.parentElement;
      for (let up = 0; up < 5 && parent; up += 1) {
        if (parent.innerText?.includes("Journey Shiva")) return true;
        parent = parent.parentElement;
      }
      return false;
    });
  open?.click();
  return Boolean(open);
});
check(opened, "the creation offers a way to open it");
await page.waitForFunction(() => location.pathname.startsWith("/studio"), { timeout: 30_000 }).catch(() => null);
await settle(3200);
const reopened = await config();
check(reopened !== null, "it reopens in the Studio");
check(
  reopened === made,
  "and reopens as exactly what was saved",
  reopened === made ? "" : "the configuration came back different",
);
await page.screenshot({ path: path.join(outDir, "3-reopened.png") });

console.log("\nshare");
await press("Share");
const link = await page
  .waitForFunction(
    () => document.querySelector('[role="status"] input[aria-label="Share link"]')?.value,
    { timeout: 30_000 },
  )
  .then((handle) => handle.jsonValue())
  .catch(() => null);
check(Boolean(link), "sharing produces a link the customer can keep", String(link));

if (link) {
  await page.goto(link, { waitUntil: "networkidle0", timeout: 60_000 });
  await settle(3200);
  const shared = await page.evaluate(() => document.body.innerText.slice(0, 200));
  check(!/error|not found/i.test(shared), "the shared link opens", shared.slice(0, 60));
  await page.screenshot({ path: path.join(outDir, "4-shared.png") });

  await page.reload({ waitUntil: "networkidle0", timeout: 60_000 });
  await settle(2500);
  check(
    !/error|not found/i.test(await page.evaluate(() => document.body.innerText.slice(0, 200))),
    "and survives a reload",
  );
}

console.log("\nthe ways it can go wrong");
for (const [what, url] of [
  ["a share id that is not a share", `${BASE}/share/not-a-real-share-id`],
  ["a deity that does not exist", `${BASE}/studio/nobody`],
]) {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
  await settle(1500);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
  const blank = text.trim().length === 0;
  check(!blank, `${what}: says something rather than nothing`, text.slice(0, 70).replace(/\n/g, " "));
}

for (const [what, url] of [
  ["a creation id that does not exist", `${BASE}/api/characters/not-a-real-id`],
]) {
  const status = await page.evaluate(
    (at) => fetch(at).then((r) => r.status),
    url,
  );
  check(status === 404 || status === 400, `${what}: refused cleanly`, `status ${status}`);
}

const malformed = await page.evaluate(
  (at) =>
    fetch(at, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "bad", config: { schemaVersion: 99, deity: "nobody" } }),
    }).then((r) => r.status),
  `${BASE}/api/characters`,
);
check(
  malformed >= 400 && malformed < 500,
  "a configuration the schema will not accept is refused",
  `status ${malformed}`,
);

await writeFile(
  path.join(outDir, "report.json"),
  JSON.stringify({ findings, consoleErrors, savedId, link }, null, 2),
);
console.log(`\n${findings.length} finding(s)`);
for (const finding of findings) console.log(`  ✗ ${finding}`);
if (consoleErrors.length) console.log(`console errors: ${consoleErrors.length}`);
await browser.close();
