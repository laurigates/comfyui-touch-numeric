// Playwright driver for the README screenshot.
//
// Drives ComfyUI's frontend through the pack's real public surface:
// loads a single-KSampler workflow, then directly invokes the patched
// widget.onPointerDown on the `seed` widget (the pack's intercept) to
// open the touch keypad modal, and screenshots the dialog.
//
// Direct widget invocation is intentional: clicking the canvas at
// computed coords is fragile (Vue layout, ds scale, devicePixelRatio
// all interact), and `widget.onPointerDown(pointer, node, canvas)` is
// the same public surface the pack hooks into — calling it directly
// exercises the exact code path a real tap would.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(HERE, "workflow.json");
const OUT_DIR = process.env.OUT_DIR || "/out";
const BASE_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188/";

async function dismissStartupDialog(page) {
  // A fresh ComfyUI profile opens the "Workflow Templates / Getting
  // Started" PrimeVue dialog (.p-dialog-mask) over the canvas. Close it
  // so it doesn't composite on top of our screenshots.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(".p-dialog-mask")) el.remove();
  });
}

async function main() {
  const workflow = JSON.parse(await readFile(WORKFLOW_PATH, "utf8"));

  const browser = await chromium.launch({
    args: ["--font-render-hinting=none"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[page:${t}] ${msg.text()}`);
    }
  });

  console.log(`Navigating to ${BASE_URL}…`);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  await page.waitForFunction(
    () => window.app && window.app.graph && Array.isArray(window.app.graph._nodes),
    null,
    { timeout: 30_000 },
  );

  console.log("Loading single-KSampler workflow…");
  await page.evaluate((wf) => {
    // clean=true wipes the default workflow so we end with just our node.
    window.app.loadGraphData(wf, true);
  }, workflow);

  await page.waitForFunction(() => window.app.graph._nodes.length === 1, null, {
    timeout: 10_000,
  });

  await dismissStartupDialog(page);

  // Wait until the pack has patched the seed widget.
  await page.waitForFunction(
    () => {
      const node = window.app.graph._nodes[0];
      const w = node?.widgets?.find((x) => x.name === "seed");
      return w && w._touchNumericPatched === true;
    },
    null,
    { timeout: 15_000 },
  );

  // Force a canvas redraw so widget.last_y and friends are populated.
  await page.evaluate(() => {
    window.app.canvas?.setDirty?.(true, true);
    window.app.canvas?.draw?.(true, true);
  });

  console.log("Opening seed keypad via widget.onPointerDown…");
  await page.evaluate(() => {
    const node = window.app.graph._nodes[0];
    const widget = node.widgets.find((w) => w.name === "seed");
    widget.onPointerDown({}, node, window.app.canvas);
  });

  const dialog = page.locator(".cmp-dialog");
  await dialog.waitFor({ state: "visible", timeout: 10_000 });

  // Wait for the keypad to render so the screenshot isn't a bare shell.
  await page.waitForFunction(
    () => document.querySelector(".cmp-dialog .tn-keypad"),
    null,
    { timeout: 5_000 },
  );
  await page.waitForTimeout(300);

  console.log(`Capturing ${OUT_DIR}/seed.png…`);
  await dialog.screenshot({ path: `${OUT_DIR}/seed.png` });

  await browser.close();
}

main().catch((err) => {
  console.error("capture failed:", err);
  process.exit(1);
});
