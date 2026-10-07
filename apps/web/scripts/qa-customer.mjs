/**
 * The whole product, as a first-time customer meets it, on the build that
 * ships.
 *
 * `qa-journey` already walks save/library/share — and it reads the
 * editor's store through a dev-only handle to do it, which means it can
 * only run against a development server, and the development server in
 * this environment never mounts the viewport. So the journey has never
 * been walked on a production build.
 *
 * This asks the same questions through the UI a customer actually uses:
 * it clicks the buttons the top bar renders, reads the toast, copies the
 * share link out of the field it is offered in, and opens that link in a
 * browser context with no cookies of its own. No handles. What it cannot
 * see is internal state; what it can see is everything the customer can,
 * which is the point.
 *
 * It fails on: a step whose control is missing, a choice that does not
 * reach the figure, a console error, or a request the server refused.
 * The one deliberate 404 — a share id that is not a share — is allowed,
 * because a product that cannot be asked for a missing thing has not been
 * tested on the thing customers do most.
 *
 * Prereq: a production server on localhost:3000 (`next start`).
 * Run from apps/web:  node scripts/qa-customer.mjs
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

const outDir = path.join(repo, "screenshots", "customer");
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
const watch = (target, sink) => {
  target.on("pageerror", (e) => sink.push(String(e).slice(0, 200)));
  target.on("console", (m) => {
    if (m.type() === "error") sink.push(m.text().slice(0, 200));
  });
  target.on("response", (r) => {
    if (r.status() >= 400) sink.push(`${r.status()} ${r.url().slice(0, 140)}`);
  });
  // A dirty editor installs a beforeunload guard, which is correct and
  // would otherwise stall every navigation this script makes.
  target.on("dialog", (d) => void d.accept().catch(() => null));
};
watch(page, errors);

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = [];
const failures = [];

function record(step, ok, detail = "") {
  steps.push({ step, ok, detail });
  console.log(`  ${ok ? "·" : "✗"} ${step}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(`${step}${detail ? `: ${detail}` : ""}`);
}

const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

/**
 * Choices are made in the panel, and only there.
 *
 * Searching the whole document for "a button that is not pressed" found
 * the camera rail under the viewport and reported its Front view as a
 * pose — a step that passed while testing the wrong control. Every picker
 * below is scoped to the panel the category opens.
 */
const PANEL = '[data-testid="customization-panel"]';

/** Click a button or link by its exact visible text. */
const clickText = (text) =>
  page.evaluate((want) => {
    const node = [...document.querySelectorAll("button, a")].find(
      (candidate) => candidate.textContent?.trim() === want,
    );
    if (!node) return false;
    node.click();
    return true;
  }, text);

/** Every category the rail offers, in order. */
const categories = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label="Customization categories"] button')].map(
      (node) => node.textContent?.trim() ?? "",
    ),
  );

/** Which category the rail says we are in. */
const currentCategory = () =>
  page.evaluate(
    () =>
      document
        .querySelector('nav[aria-label="Customization categories"] button[aria-current="true"]')
        ?.textContent?.trim() ?? null,
  );

const topBarLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("header button")].map((node) => node.textContent?.trim() ?? ""),
  );

/**
 * What the viewport is drawing, as a short fingerprint.
 *
 * The figure is the product. A control that reports success while the
 * statue does not move is the exact defect this journey is looking for,
 * and the only way to see it is to read the canvas.
 */
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

async function enterStudio(url) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 180_000 });
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
  await page.waitForSelector("canvas", { timeout: 120_000 }).catch(() => null);
  await settle(2500);
}

// --------------------------------------------------------- the front door
const landing = await page.goto(BASE, { waitUntil: "networkidle2", timeout: 180_000 });
record(
  "the root is the Studio",
  page.url().includes("/studio") && (landing?.status() ?? 0) < 400,
  page.url(),
);

const sawEntry = await page
  .waitForSelector('[data-testid="stage-intro"]', { timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
record("a first visit is met by the entry, not by a half-built statue", sawEntry);
await shot("01-entry");

await enterStudio(BASE);
const chrome = await topBarLabels();
record(
  "Enter opens the Studio",
  chrome.includes("Save") && chrome.includes("Share") && (await canvasPrint()) !== null,
  `${chrome.length} top-bar controls`,
);
await shot("02-studio");

// ---------------------------------------------------------- the whole rail
const rail = await categories();
record(
  "the rail offers Divine Form first and every category after it",
  rail[0] === "Divine Form" && rail.length >= 10,
  rail.join(" / "),
);

let wrongCurrent = [];
for (const category of rail) {
  await clickText(category);
  await settle(350);
  const now = await currentCategory();
  if (now !== category) wrongCurrent.push(`${category} -> ${now ?? "nothing"}`);
}
record(
  "opening a category is what the rail then says you are in",
  wrongCurrent.length === 0,
  wrongCurrent.join("; "),
);
await shot("03-categories");

/**
 * Choosing something has to reach the statue.
 *
 * `nth` skips the first card where a category's first offering is already
 * what is worn; the filter only considers cards that are NOT selected, so
 * every click is a real change.
 */
async function choosing(category, label) {
  await clickText(category);
  await settle(500);
  const before = await canvasPrint();
  const picked = await page.evaluate((panel) => {
    const card = [...document.querySelectorAll(`${panel} button`)].find(
      (node) => node.querySelector("img") && node.getAttribute("aria-pressed") === "false",
    );
    if (!card) return null;
    card.click();
    return card.textContent?.trim().slice(0, 28) || "a card";
  }, PANEL);
  if (!picked) {
    record(label, false, "nothing unselected to choose");
    return false;
  }
  await settle(2600);
  const after = await canvasPrint();
  const chosen = await page.evaluate(
    (panel) =>
      [...document.querySelectorAll(`${panel} button[aria-pressed=true]`)].some((node) =>
        node.querySelector("img"),
      ),
    PANEL,
  );
  record(
    label,
    before !== null && after !== null && before !== after && chosen,
    `chose ${picked}${before === after ? " — the figure did not change" : ""}`,
  );
  return true;
}

await choosing("Clothing", "a garment reaches the figure, and the card shows as chosen");
await shot("04-garment");
await choosing("Ornaments", "an ornament reaches the figure");
await choosing("Attributes", "an attribute reaches the figure");
/**
 * A mudra is a segmented control, not a thumbnail.
 *
 * Every other category offers pictures; the hands offer a row of named
 * positions per hand, because a thumbnail of a hand at that size is a
 * smudge. So it is chosen by name.
 */
await clickText("Hands");
await settle(600);
const beforeMudra = await canvasPrint();
const mudra = await page.evaluate((panel) => {
  const button = [...document.querySelectorAll(`${panel} section button`)].find(
    (node) =>
      node.getAttribute("aria-pressed") === "false" &&
      /^(Abhaya|Varada|Open|Cradle|Stem Hold|Weapon Grip)$/.test(node.textContent?.trim() ?? ""),
  );
  if (!button) return null;
  const name = button.textContent?.trim() ?? "";
  button.click();
  return name;
}, PANEL);
if (mudra) {
  await settle(3000);
  record("a mudra reaches the figure", beforeMudra !== (await canvasPrint()), mudra);
} else {
  record("a mudra reaches the figure", false, "no mudra offered");
}
await shot("05-hands");

// ------------------------------------------------------------------- pose
await clickText("Pose");
await settle(600);
const posePick = await page.evaluate((panel) => {
  // A preset carries its own description as a title; the joint sliders
  // below it do not, which is what separates the two in this panel.
  const button = [...document.querySelectorAll(`${panel} button[title]`)].find(
    (node) =>
      node.getAttribute("aria-pressed") === "false" &&
      !node.querySelector("img") &&
      (node.textContent?.trim().length ?? 0) > 2,
  );
  if (!button) return null;
  const name = button.textContent?.trim() ?? "";
  button.click();
  return name;
}, PANEL);
if (posePick) {
  const before = await canvasPrint();
  await settle(3000);
  const after = await canvasPrint();
  const held = await page.evaluate(
    (name) =>
      [...document.querySelectorAll("button[aria-pressed=true]")].some(
        (node) => node.textContent?.trim() === name,
      ),
    posePick,
  );
  record(
    "changing pose moves the figure and the pose stays chosen",
    before !== after && held,
    posePick,
  );
} else {
  record("changing pose moves the figure and the pose stays chosen", false, "no pose offered");
}
await shot("06-pose");

// ------------------------------------------------------------ the camera
const views = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label="Camera view"] button')].map(
    (node) => node.textContent?.trim() ?? "",
  ),
);
const moved = [];
const stuck = [];
for (const view of views) {
  const before = await canvasPrint();
  await page.evaluate((want) => {
    const node = [...document.querySelectorAll('[aria-label="Camera view"] button')].find(
      (candidate) => candidate.textContent?.trim() === want,
    );
    node?.click();
  }, view);
  await settle(1400);
  const after = await canvasPrint();
  (before === after ? stuck : moved).push(view);
}
record(
  "every camera view takes the camera somewhere, and Reset comes back",
  views.length === 7 && moved.length >= 6,
  `moved on ${moved.join("/")}${stuck.length ? `; nothing on ${stuck.join("/")}` : ""}`,
);
await shot("07-camera");

// -------------------------------------------------------------- undo/redo
const iconButton = (which) =>
  page.evaluate((pattern) => {
    const button = [...document.querySelectorAll("header button")].find((node) =>
      new RegExp(pattern, "i").test(node.getAttribute("aria-label") ?? ""),
    );
    if (!button) return "missing";
    if (button.disabled) return "disabled";
    button.click();
    return "clicked";
  }, which);

const beforeUndo = await canvasPrint();
const undoState = await iconButton("undo");
await settle(3000);
const afterUndo = await canvasPrint();
record("undo takes the last change back", undoState === "clicked" && beforeUndo !== afterUndo, undoState);

const redoState = await iconButton("redo");
await settle(3000);
record(
  "redo puts it back",
  redoState === "clicked" && (await canvasPrint()) !== afterUndo,
  redoState,
);
await shot("07b-undo-redo");

// ---------------------------------------------------- another divine form
await clickText("Divine Form");
await settle(600);
const forms = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((node) => node.getAttribute("aria-pressed") === "false")
    .map((node) => node.textContent?.trim() ?? "")
    .filter((text) => /ganesha|shiva|vishnu/i.test(text)),
);
if (forms.length > 0) {
  const target = forms[0];
  const before = await canvasPrint();
  const railBefore = await categories();
  await page.evaluate((want) => {
    const node = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === want,
    );
    node?.click();
  }, target);
  await settle(900);

  /**
   * IT HAS TO ASK FIRST, AND IT DOES.
   *
   * Everything chosen so far is unsaved, and the forms do not share a
   * configuration — switching starts a new creation. A switch that
   * simply happened would throw the customer's work away on one click,
   * so the guard is part of the journey, not an obstacle to it.
   */
  const guarded = await page.evaluate(() => {
    const dialog = document.querySelector('[aria-labelledby="confirm-title"]');
    return dialog ? dialog.textContent?.trim().slice(0, 90) ?? "" : null;
  });
  record(
    "switching form with unsaved work asks before discarding it",
    typeof guarded === "string" && /not been saved/i.test(guarded),
    guarded ?? "it switched without asking",
  );
  await shot("08-switch-guard");

  if (typeof guarded === "string") {
    const confirmed = await page.evaluate(() => {
      const button = [...document.querySelectorAll('[aria-labelledby="confirm-title"] button')].find(
        (node) => /^Switch to /.test(node.textContent?.trim() ?? ""),
      );
      if (!button) return false;
      button.click();
      return true;
    });
    // The veil goes up before the configuration changes and comes down
    // when the new statue is standing, so wait for the veil, not a clock.
    await page
      .waitForFunction(() => document.querySelector('[data-testid="temple-opening"]') === null, {
        timeout: 180_000,
        polling: 200,
      })
      .catch(() => null);
    await settle(4000);
    if (!confirmed) record("confirming the switch", false, "no confirm button");
  }

  const nowRail = await categories();
  const after = await canvasPrint();
  record(
    "confirming it brings the other deity and its own categories",
    before !== after && nowRail[0] === "Divine Form" && nowRail.length >= 10 &&
      nowRail.join() !== railBefore.join(),
    `${target.slice(0, 24)} — ${nowRail.length} categories: ${nowRail.slice(1).join("/")}`,
  );
} else {
  record("switching form with unsaved work asks before discarding it", false, "none offered");
}
await shot("08-switched");

// ------------------------------------------------------------------- save
await page.evaluate(() => {
  const field = document.querySelector('input[aria-label="Creation name"]');
  if (!field) return;
  field.focus();
});
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.type('input[aria-label="Creation name"]', "Showcase Check").catch(() => null);
await settle(400);

const saved = await clickText("Save");
await settle(4000);
const toast = await page.evaluate(() => document.body.innerText);
record("saving says so, in words the customer can see", saved && /\bSaved\b/.test(toast));
await shot("09-saved");

// ------------------------------------------------------------------ share
let link = null;
if (await clickText("Share")) {
  await settle(5000);
  link = await page.evaluate(() => {
    const field = document.querySelector('input[aria-label="Share link"]');
    return field?.value ?? null;
  });
  record("sharing offers a link that can be copied", Boolean(link && /\/share\//.test(link)), link ?? "");
  await shot("10-share");
} else {
  record("sharing offers a link that can be copied", false, "no Share control");
}

// --------------------------------------- and that link works for a stranger
if (link) {
  const fresh = await browser.createBrowserContext();
  const guest = await fresh.newPage();
  const guestErrors = [];
  watch(guest, guestErrors);
  await guest.goto(link, { waitUntil: "networkidle2", timeout: 180_000 }).catch(() => null);
  await guest
    .waitForFunction(() => document.querySelector('[data-testid="temple-opening"]') === null, {
      timeout: 180_000,
      polling: 200,
    })
    .catch(() => null);
  await guest.waitForSelector("canvas", { timeout: 120_000 }).catch(() => null);
  await settle(6000);
  const opened = await guest.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return {
      drawn: Boolean(canvas && canvas.width > 0),
      name: document.body.innerText.includes("Showcase Check"),
    };
  });
  record(
    "the shared creation opens for someone with no session of their own",
    opened.drawn,
    `${opened.name ? "named" : "unnamed"}, ${guestErrors.length} error(s)`,
  );
  await guest.screenshot({ path: path.join(outDir, "11-shared.png") });
  errors.push(...guestErrors);
  await fresh.close();
}

// -------------------------------------------------------------- the library
await page.bringToFront();
if (await clickText("Library")) {
  await settle(1200);
  // A saved creation leaves nothing unsaved, so this should not have to ask.
  const asked = await page.evaluate(() => document.querySelector("[aria-labelledby=confirm-title]") !== null);
  if (asked) await clickText("Leave");
  await page.waitForFunction(() => location.pathname.startsWith("/library"), { timeout: 60_000 }).catch(() => null);
  await settle(3000);
  const text = await page.evaluate(() => document.body.innerText);
  record("the creation is in the library", /Showcase Check/.test(text), asked ? "asked before leaving" : "");
  await shot("12-library");
} else {
  record("the creation is in the library", false, "no Library control");
}

// ------------------------------- and reopening it brings back what was made
/**
 * OPEN, not the card.
 *
 * A library card's name becomes an editable field when it is clicked, and
 * "the first thing containing Showcase Check" is that name — so the first
 * version of this step focused a text input, navigated nowhere, then read
 * the name back out of the very field it had just clicked and called that
 * a reopened creation. It passed, on the library page. The card says what
 * it opens in its own label, which is the thing to ask for.
 */
const reopened = await page.evaluate(() => {
  // The card says which creation it opens, in its own label.
  const open = document.querySelector('[aria-label="Open Showcase Check"]');
  if (!open) return false;
  open.click();
  return true;
});
if (reopened) {
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
  await settle(7000);
  const back = await page.evaluate(() => ({
    where: location.pathname,
    name: document.querySelector('input[aria-label="Creation name"]')?.value ?? "",
    // The chip beside the mark says which form is being made, and this
    // creation was saved as Shiva after the switch.
    form:
      [...document.querySelectorAll("header button")].find(
        (node) => node.getAttribute("title") === "Choose a divine form",
      )?.textContent?.trim() ?? "",
    drawn: Boolean(document.querySelector("canvas")?.width),
  }));
  record(
    "reopening it comes back to the Studio with the creation that was saved",
    back.where.startsWith("/studio") &&
      back.name === "Showcase Check" &&
      /shiva/i.test(back.form) &&
      back.drawn,
    `${back.where} — "${back.name}", ${back.form || "no form named"}, ${back.drawn ? "drawn" : "nothing drawn"}`,
  );
  await shot("13-reopened");
} else {
  record("reopening it comes back to the Studio with the creation that was saved", false, "no Open");
}

// ------------------------- a second creation, and the link that belongs to it
/**
 * A SHARE LINK IS ABOUT ONE CREATION.
 *
 * The message carrying it has no timer — it is the only copy the customer
 * has — and the Studio is a route in a single-page app, so the message
 * outlived the creation it was raised for: share one, go to the library,
 * open another, and the first one's link came back up over the second
 * one's statue. Copying it would have sent someone the wrong murti. This
 * is the sequence that found it.
 */
const second = await clickText("New");
await settle(1000);
await page.evaluate(() => {
  const dialog = document.querySelector('[aria-labelledby="confirm-title"]');
  if (!dialog) return;
  const buttons = [...dialog.querySelectorAll("button")];
  buttons[buttons.length - 1]?.click();
});
await page
  .waitForFunction(() => document.querySelector('[data-testid="temple-opening"]') === null, {
    timeout: 180_000,
    polling: 200,
  })
  .catch(() => null);
await settle(5000);
await page.click('input[aria-label="Creation name"]').catch(() => null);
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.type('input[aria-label="Creation name"]', "Second Creation").catch(() => null);
await clickText("Save");
await settle(4000);
await clickText("Share");
await settle(5000);
const secondLink = await page.evaluate(
  () => document.querySelector('input[aria-label="Share link"]')?.value ?? null,
);
record(
  "a second creation can be made and shared on its own",
  second && Boolean(secondLink) && secondLink !== link,
  secondLink ?? "no link",
);

await clickText("Library");
await settle(1200);
await page.evaluate(() => {
  const dialog = document.querySelector('[aria-labelledby="confirm-title"]');
  if (!dialog) return;
  [...dialog.querySelectorAll("button")].find((node) => /^Leave$/.test(node.textContent?.trim() ?? ""))?.click();
});
await page
  .waitForFunction(() => location.pathname.startsWith("/library"), { timeout: 60_000, polling: 200 })
  .catch(() => null);
await settle(3000);
const swapped = await page.evaluate(() => {
  const open = document.querySelector('[aria-label="Open Showcase Check"]');
  if (!open) return false;
  open.click();
  return true;
});
if (swapped) {
  await page
    .waitForFunction(() => location.pathname.startsWith("/studio"), { timeout: 60_000, polling: 200 })
    .catch(() => null);
  await page
    .waitForFunction(() => document.querySelector('[data-testid="temple-opening"]') === null, {
      timeout: 180_000,
      polling: 200,
    })
    .catch(() => null);
  await settle(7000);
  const carried = await page.evaluate(() => ({
    name: document.querySelector('input[aria-label="Creation name"]')?.value ?? "",
    link: document.querySelector('input[aria-label="Share link"]')?.value ?? null,
  }));
  record(
    "the other creation's share link does not follow the customer to this one",
    carried.name === "Showcase Check" && carried.link === null,
    carried.link
      ? `showing "${carried.name}" under a link to something else`
      : `showing "${carried.name}", no stale link`,
  );
  await shot("15-no-stale-link");
} else {
  record("the other creation's share link does not follow the customer to this one", false, "no Open");
}

// ----------------------------------------- and when it is asked for nonsense
const badShare = await page.goto(`${BASE}/share/not-a-real-share-id`, {
  waitUntil: "networkidle2",
  timeout: 60_000,
});
/**
 * The page asks the server for the share and renders what it is told, so
 * the answer arrives after the document does. Waiting for a clock here
 * would read the shell and call it a verdict.
 */
const answered = await page
  .waitForFunction(
    () => /could not be found|shared creation/i.test(document.body.innerText),
    { timeout: 60_000, polling: 200 },
  )
  .then(() => true)
  .catch(() => false);
const badText = await page.evaluate(() => document.body.innerText.trim());
const wayOut = await page.evaluate(() =>
  [...document.querySelectorAll("a")].some((node) => /create your own/i.test(node.textContent ?? "")),
);
record(
  "a share link that is not a share says so, and offers a way on",
  (badShare?.status() ?? 500) < 500 &&
    answered &&
    /could not be found/i.test(badText) &&
    wayOut &&
    !/Application error/i.test(badText),
  `status ${badShare?.status()} — ${answered ? "answered" : "never answered"}, ${wayOut ? "offers a way on" : "dead end"}`,
);
await shot("14-bad-share");

await writeFile(path.join(outDir, "report.json"), JSON.stringify({ steps, link, errors }, null, 2));
await browser.close();

/**
 * The step above asks the server for a share that does not exist, so its
 * 404 is the product answering correctly. Nothing else is allowed one.
 */
const DELIBERATE =
  /not-a-real-share-id|^Failed to load resource: the server responded with a status of 404/;
const unexpected = errors.filter((text) => !DELIBERATE.test(text));
console.log(`\n${steps.length} step(s), ${failures.length} failure(s)`);
for (const failure of failures) console.error(`  ✗ ${failure}`);
if (unexpected.length > 0) {
  console.error(`\n${unexpected.length} unexpected console/network error(s):`);
  for (const error of [...new Set(unexpected)].slice(0, 15)) console.error(`  ${error}`);
}
if (failures.length > 0 || unexpected.length > 0) process.exit(1);
