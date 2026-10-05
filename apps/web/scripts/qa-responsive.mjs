/**
 * What the Studio looks like on a screen that is not the author's.
 *
 * A showcase is given on whatever is to hand — a laptop at 1366, a
 * half-width window beside a video call, somebody's phone when they ask
 * "can I try?". The editor is a three-column layout with two fixed-width
 * columns, so the interesting question is what the middle one has left,
 * and at what width it stops being a viewport and starts being a sliver.
 *
 * It asks four things of every size, all of them things a person notices
 * within a second:
 *
 *   1. THE PAGE DOES NOT SCROLL SIDEWAYS. A horizontal scrollbar on an
 *      application layout is the single clearest signal that nobody
 *      looked at it on this screen.
 *   2. THE STATUE IS VISIBLE, and has enough of the window to be worth
 *      looking at.
 *   3. THE CONTROLS ARE REACHABLE — the categories, the panel, and Save.
 *   4. NOTHING IS DRAWN OFF THE EDGE of the window.
 *
 * Prereq: `pnpm dev` on localhost:3000, Chrome installed.
 * Run from apps/web:  node scripts/qa-responsive.mjs [name]
 * Captures land in the repo's gitignored `screenshots/<name>/`.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.DEVAFORM_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEVAFORM_URL ?? "http://localhost:3000";
const repo = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT = process.argv[2] ? path.join(repo, "screenshots", process.argv[2]) : null;
if (OUT) await mkdir(OUT, { recursive: true });

/**
 * The screens this is actually given on, plus the two edges.
 *
 * 1366x768 is still the commonest laptop panel in the world; 1280x800 is
 * a MacBook Air's logical size; 1024 is a half-screen window or an iPad
 * in landscape; 768 is an iPad portrait; 390x844 is an iPhone.
 */
const SIZES = [
  { name: "1920-desktop", width: 1920, height: 1080, mobile: false, studio: true },
  { name: "1440-laptop", width: 1440, height: 900, mobile: false, studio: true },
  { name: "1366-laptop", width: 1366, height: 768, mobile: false, studio: true },
  { name: "1280-air", width: 1280, height: 800, mobile: false, studio: true },
  { name: "1024-half", width: 1024, height: 768, mobile: false, studio: true },
  // Below the width the layout was measured to work at. The Studio is a
  // three-column desktop application and says so rather than serving a
  // half-working editor with Save off the screen.
  { name: "768-tablet", width: 768, height: 1024, mobile: true, studio: false },
  { name: "390-phone", width: 390, height: 844, mobile: true, studio: false },
];

const failures = [];
const notes = [];
const fail = (size, why) => {
  failures.push(`${size}: ${why}`);
  console.log(`    ✗ ${why}`);
};
const pass = (what) => console.log(`    ✓ ${what}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const size of SIZES) {
  console.log(`\n${size.name} (${size.width}x${size.height})`);
  const page = await browser.newPage();
  await page.setViewport({
    width: size.width,
    height: size.height,
    isMobile: size.mobile,
    hasTouch: size.mobile,
    deviceScaleFactor: 1,
  });
  try {
    await page.goto(`${BASE}/studio`, { waitUntil: "networkidle0", timeout: 180_000 });
    /**
     * BELOW THE THRESHOLD, THE CONTRACT IS DIFFERENT.
     *
     * The Studio does not claim to work here; it claims to say so. Asking
     * the narrow sizes to satisfy the desktop layout would be asking the
     * product for something it has decided not to promise, and asking
     * nothing at all would let the notice silently disappear.
     *
     * Asked BEFORE the waits below, because there is no entry sequence
     * and no renderer here — the Studio is not laid out at all at these
     * widths, which is the point — and waiting for them reported two
     * failures against a product behaving exactly as intended.
     */
    if (!size.studio) {
      const notice = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="narrow-screen-notice"]');
        if (!node) return null;
        const box = node.getBoundingClientRect();
        const doc = document.documentElement;
        return {
          covers: box.width >= doc.clientWidth - 1 && box.height >= doc.clientHeight - 1,
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
          scrolls: doc.scrollWidth > doc.clientWidth + 1,
        };
      });
      if (!notice) {
        fail(size.name, "no notice — a broken Studio is served instead");
      } else if (!notice.covers) {
        fail(size.name, "the notice does not cover the broken layout behind it");
      } else if (notice.scrolls) {
        fail(size.name, "the notice itself scrolls sideways");
      } else {
        pass(`says so plainly: "${notice.text}..."`);
      }
      if (OUT) await page.screenshot({ path: `${OUT}/${size.name}.png` });
      continue;
    }


    // Through the entry, which is its own layout and gets its own look.
    const intro = await page
      .waitForSelector('[data-testid="stage-intro"]', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (intro) {
      if (OUT) await page.screenshot({ path: `${OUT}/${size.name}-intro.png` });
      await page.evaluate(() => {
        [...document.querySelectorAll('[data-testid="stage-intro"] button')]
          .find((node) => node.textContent?.trim().toLowerCase() === "enter")
          ?.click();
      });
      await page
        .waitForFunction(() => document.querySelector('[data-testid="stage-intro"]') === null, {
          timeout: 120_000,
        })
        .catch(() => fail(size.name, "the entry never handed over"));
    }
    /**
     * A CANVAS, NOT A RENDERER HANDLE.
     *
     * This waited for `__devaformRenderer`, which production does not
     * expose - so every desktop size failed on a build whose layout was
     * perfect. Whether the statue has somewhere to be is a question about
     * the DOM, and the DOM is the same in both builds.
     */
    await page
      .waitForFunction(
        () => {
          const node = document.querySelector("canvas");
          return node !== null && node.getBoundingClientRect().width > 100;
        },
        { timeout: 120_000 },
      )
      .catch(() => fail(size.name, "no viewport appeared"));
    await new Promise((resolve) => setTimeout(resolve, 3500));

    const layout = await page.evaluate(() => {
      const doc = document.documentElement;
      const canvas = document.querySelector("canvas");
      const rect = canvas?.getBoundingClientRect();
      const named = (testid) => {
        const node = document.querySelector(`[data-testid="${testid}"]`);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height, left: box.left, right: box.right };
      };
      const labelled = (text) => {
        const node = [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent?.trim() === text,
        );
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          visible: node.offsetParent !== null,
        };
      };
      // Anything drawn past the right-hand edge of the window.
      const spills = [];
      for (const node of document.querySelectorAll("body *")) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (box.right > doc.clientWidth + 1 || box.left < -1) {
          const label = `${node.tagName.toLowerCase()}${
            node.className && typeof node.className === "string"
              ? `.${node.className.split(" ")[0]}`
              : ""
          }`;
          if (!spills.includes(label)) spills.push(label);
        }
      }
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        canvas: rect ? { width: rect.width, height: rect.height } : null,
        panel: named("customization-panel"),
        save: labelled("Save"),
        spills: spills.slice(0, 6),
      };
    });

    // 1. no sideways scroll
    if (layout.scrollWidth > layout.clientWidth + 1) {
      fail(
        size.name,
        `the page scrolls sideways (${layout.scrollWidth}px of content in ${layout.clientWidth}px)`,
      );
    } else {
      pass("no sideways scroll");
    }

    // 2. the statue has somewhere to be
    if (!layout.canvas || layout.canvas.width < 1) {
      fail(size.name, "there is no viewport at all");
    } else {
      const share = layout.canvas.width / layout.clientWidth;
      if (share < 0.3) {
        fail(
          size.name,
          `the statue gets ${(share * 100).toFixed(0)}% of the width ` +
            `(${Math.round(layout.canvas.width)}px) — a sliver, not a viewport`,
        );
      } else {
        pass(
          `the statue gets ${(share * 100).toFixed(0)}% of the width ` +
            `(${Math.round(layout.canvas.width)}x${Math.round(layout.canvas.height)})`,
        );
      }
    }

    // 3. the controls are reachable
    if (!layout.save?.visible) {
      fail(size.name, "Save is not reachable");
    } else if (layout.save.right > layout.clientWidth + 1 || layout.save.left < -1) {
      fail(size.name, `Save sits off the edge (left ${Math.round(layout.save.left)})`);
    } else {
      pass("Save is reachable");
    }
    if (!layout.panel) {
      notes.push(`${size.name}: the customization panel is not rendered at this width`);
    } else if (layout.panel.width < 180) {
      fail(
        size.name,
        `the customization panel is ${Math.round(layout.panel.width)}px wide — too narrow to use`,
      );
    } else {
      pass(`the panel has ${Math.round(layout.panel.width)}px`);
    }

    // 4. nothing drawn off the edge
    if (layout.spills.length > 0) {
      fail(size.name, `drawn past the window edge: ${layout.spills.join(", ")}`);
    } else {
      pass("nothing is drawn off the edge");
    }

    if (OUT) await page.screenshot({ path: `${OUT}/${size.name}.png` });
  } catch (error) {
    fail(size.name, `threw: ${String(error).slice(0, 120)}`);
  } finally {
    await page.close();
  }
}

console.log(`\n${failures.length} failure(s), ${notes.length} note(s)`);
for (const note of notes) console.log(`  · ${note}`);
await browser.close();
process.exitCode = failures.length > 0 ? 1 : 0;
