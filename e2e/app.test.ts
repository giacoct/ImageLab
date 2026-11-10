/**
 * End-to-end: the built site, served as GitHub Pages serves it (`setup.ts`),
 * used in Chromium as a person would: loading images, applying tools one
 * after another, renaming and downloading the results, zooming in, on a
 * phone, and offline.
 */

import { readFile } from "node:fs/promises";

import {
  chromium,
  devices,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(() => browser?.close());

/** Wait until `check` is true; it may throw while the page loads again. */
async function until(check: () => Promise<boolean>, timeout = 15_000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() > end) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The app in a new browser context, once its service worker has taken over:
 * the first visit loads the page again for it, cross-origin isolated.
 */
async function openApp(options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...options,
  });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await until(() => page.evaluate(() => crossOriginIsolated));
  // The page is loaded again once: wait for it to be ready.
  await page.getByRole("heading", { name: "Drop images here" }).waitFor();
  return page;
}

/** A PNG drawn in the page: a gradient with lines of text, for detail. */
async function picture(page: Page, width: number, height: number) {
  const bytes = await page.evaluate(
    async ([width, height]) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d")!;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#e66465");
      gradient.addColorStop(1, "#3366cc");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "14px sans-serif";
      for (let y = 20; y < height; y += 18)
        ctx.fillText("ImageLab ".repeat(40), 4, y);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      // As base64: much lighter to pass out of the page than numbers.
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      return url.slice(url.indexOf(",") + 1);
    },
    [width, height],
  );
  return Buffer.from(bytes, "base64");
}

/** Load images from the home page's file picker. */
async function load(
  page: Page,
  files: { name: string; width: number; height: number }[],
) {
  const chosen = await Promise.all(
    files.map(async ({ name, width, height }) => ({
      name,
      mimeType: "image/png",
      buffer: await picture(page, width, height),
    })),
  );
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose images" }).click();
  await (await chooser).setFiles(chosen);
  const count = files.length === 1 ? "1 image" : `${files.length} images`;
  await page.getByRole("heading", { name: count, exact: true }).waitFor();
}

/** A tool's link reads its title, then its description. */
async function openTool(page: Page, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("link", { name: new RegExp(`^${escaped}`) }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
}

describe("ImageLab", () => {
  it("applies tools one after another, and downloads the results renamed", async () => {
    const page = await openApp({ acceptDownloads: true });
    await load(page, [
      { name: "beach.png", width: 300, height: 200 },
      { name: "hills.png", width: 200, height: 200 },
    ]);

    await openTool(page, "Scale");
    await page.getByRole("button", { name: "Apply to 2 images" }).click();
    await page
      .getByRole("heading", { name: "2 results", exact: true })
      .waitFor();
    await expect(page.getByText("150 × 100").count()).resolves.toBe(1);
    await page.getByRole("button", { name: "Use as input" }).click();

    await page
      .getByRole("heading", { name: "2 images", exact: true })
      .waitFor();
    await openTool(page, "Convert format");
    await page.getByRole("button", { name: "WebP", exact: true }).click();
    await page.getByRole("button", { name: "Apply to 2 images" }).click();
    await page
      .getByRole("heading", { name: "2 results", exact: true })
      .waitFor();

    const name = page.getByRole("textbox", { name: /^File name/ }).first();
    await name.fill("summer");
    await name.press("Enter");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download summer.webp" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("summer.webp");
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");

    const all = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download all" }).click();
    expect((await all).suggestedFilename()).toBe("imagelab.zip");
    await page.context().close();
  });

  it("zoomed in, shows the part in view as sharp as the full-size result", async () => {
    const page = await openApp();
    await load(page, [{ name: "wide.png", width: 3000, height: 2000 }]);
    await openTool(page, "Add margin");
    const detail = page.locator("canvas.detail");
    const shown = async () =>
      !(await detail.getAttribute("class"))?.includes("hidden");
    /** The detail's pixels per pixel of the result, from the zoom level. */
    const density = async () => {
      const perPoint = await detail.evaluate(
        (canvas: HTMLCanvasElement) =>
          canvas.width / canvas.getBoundingClientRect().width,
      );
      const level = await page.locator(".level").textContent();
      return (perPoint * parseFloat(level!)) / 100;
    };

    // Fitted, the preview is sharp enough: no detail.
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    await zoomIn.waitFor(); // the preview is in
    expect(await shown()).toBe(false);

    // At 100%, past the preview's pixels: one is rendered at full size.
    const box = (await page.getByRole("application").boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator(".level", { hasText: "100%" }).waitFor();
    await until(shown);
    expect(await density()).toBeCloseTo(1, 1);

    // Further in, and moved to a part it didn't cover: rendered again there.
    await zoomIn.click();
    await zoomIn.click();
    const before = await detail.evaluate((canvas) => canvas.style.left);
    await page.keyboard.press("0"); // back to fitting, then into a corner
    await page.mouse.dblclick(box.x + 40, box.y + 40);
    await until(
      async () =>
        (await shown()) &&
        (await detail.evaluate((canvas) => canvas.style.left)) !== before,
    );
    expect(await density()).toBeCloseTo(1, 1);
    await page.context().close();
  });

  it("on a phone, lets the preview scroll away from the settings", async () => {
    const page = await openApp({ ...devices["Pixel 7"] });
    await load(page, [{ name: "photo.png", width: 400, height: 300 }]);
    await openTool(page, "Adjust & filters");
    // The preview moves up with the page instead of staying at the top.
    const stage = page.getByRole("application");
    const before = (await stage.boundingBox())!.y;
    await page.evaluate(() => scrollBy(0, 300));
    await until(async () => (await page.evaluate(() => scrollY)) === 300);
    expect((await stage.boundingBox())!.y).toBeCloseTo(before - 300, 0);
    // Apply stays at the bottom of the screen.
    const apply = (await page
      .getByRole("button", { name: "Apply to 1 image" })
      .boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(apply.y).toBeGreaterThanOrEqual(viewport.height / 2);
    expect(apply.y + apply.height).toBeLessThanOrEqual(viewport.height);
    await page.context().close();
  });

  it("works offline once opened", async () => {
    // Controlled by the service worker (openApp waits for it), which only
    // takes over once it has kept the app's files.
    const page = await openApp();
    await page.context().setOffline(true);
    await page.reload();
    await page.getByRole("heading", { name: "Drop images here" }).waitFor();
    await load(page, [{ name: "photo.png", width: 200, height: 100 }]);
    await openTool(page, "Scale");
    await page.getByRole("button", { name: "Apply to 1 image" }).click();
    await page.getByRole("heading", { name: "Result", exact: true }).waitFor();
    await page.context().close();
  });

  it("opens on the home page from a malformed address", async () => {
    const page = await openApp();
    await page.goto(`${baseUrl}#/%`);
    await page.reload();
    await page.getByRole("heading", { name: "Drop images here" }).waitFor();
    await page.context().close();
  });
});
