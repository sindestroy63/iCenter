import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.TEST_APP_URL ?? "http://localhost:3113";
const outDir = ".tmp/public-mega-visual";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const results = [];

async function openDesktop() {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator(".catalog-btn").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(350);
  await page.locator(".catalog-btn").hover();
  const menu = page.locator(".catalog-mega-menu");
  await menu.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll(".catalog-mega-menu .catalog-mega-card").length === 6, null, { timeout: 20000 });
  return menu;
}

async function checkDesktop(width) {
  await page.setViewportSize({ width, height: 1000 });
  const trigger = page.locator(".catalog-btn");
  const menu = await openDesktop();
  const cards = menu.locator(".catalog-mega-card");
  assert.equal(await cards.count(), 6);
  assert.equal(await menu.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 3);
  const images = menu.locator(".catalog-mega-card-image");
  const fallbacks = menu.locator(".catalog-mega-card-fallback");
  assert.equal(await images.count() + await fallbacks.count(), 6);
  for (const image of await images.all()) assert.equal(await image.evaluate((node) => node.complete && node.naturalWidth > 0), true);

  const expectedRoots = ["Apple", "Samsung", "Dyson", "Консоли", "Аксессуары", "Trade-in"];
  const rootTitles = await menu.locator(".catalog-mega-card-title").allTextContents();
  for (const root of expectedRoots) assert.ok(rootTitles.includes(root), `Missing root section: ${root}`);
  const apple = cards.nth(0);
  await apple.hover();
  const cardBox = await apple.boundingBox();
  const titleBox = await apple.locator(".catalog-mega-card-title").boundingBox();
  assert.ok(cardBox && titleBox);
  assert.ok(Math.abs(titleBox.x + titleBox.width / 2 - (cardBox.x + cardBox.width / 2)) < 2);
  assert.ok(Math.abs(titleBox.y + titleBox.height / 2 - (cardBox.y + cardBox.height / 2)) < 2);
  const popover = menu.locator(".catalog-mega-card-popover").filter({ hasText: "iPhone" }).first();
  await popover.waitFor({ state: "visible" });
  await popover.hover();
  await page.waitForTimeout(220);
  assert.equal(await popover.isVisible(), true);
  assert.equal(await popover.locator(".catalog-mega-card-child").filter({ hasText: "iPhone" }).first().getAttribute("href"), "/catalog?menuItem=apple-iphone");
  await page.screenshot({ path: `${outDir}/desktop-${width}.png` });
  await page.keyboard.press("Escape");
  assert.equal(await menu.count(), 0);
  await page.locator(".catalog-btn").click();
  await menu.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  assert.equal(await menu.count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("catalog-btn")), true);
  await page.keyboard.press("Enter");
  await menu.waitFor({ state: "visible" });
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("catalog-btn")), true);
  results.push({ viewport: width, cards: 6, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) });
}

try {
  await checkDesktop(1440);
  const trigger = page.locator(".catalog-btn");
  await trigger.click();
  const menu = page.locator(".catalog-mega-menu");
  await menu.waitFor({ state: "visible" });
  const apple = menu.locator(".catalog-mega-card").nth(0);
  await apple.hover();
  assert.equal(await apple.getAttribute("href"), "/catalog?menuItem=apple");
  await apple.click();
  await page.waitForURL(/\/catalog\?menuItem=apple$/, { timeout: 20000 });
  const rootResponse = await page.request.get(`${base}/api/catalog/products?city=samara&menuItem=apple&limit=100&offset=0`);
  assert.equal(rootResponse.status(), 200);
  const rootBody = await rootResponse.json();
  assert.ok(rootBody.data.length > 0 && rootBody.data.every((item) => item.brand?.slug === "apple"));

  const childResponse = await page.request.get(`${base}/api/catalog/products?city=samara&menuItem=apple-iphone&limit=100&offset=0`);
  assert.equal(childResponse.status(), 200);
  const childBody = await childResponse.json();
  assert.ok(childBody.data.length > 0 && childBody.data.every((item) => item.brand?.slug === "apple" && item.type?.slug === "iphone"));
  await checkDesktop(1920);

  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(350);
    await page.locator(".store-mobile-menu-toggle").click();
    const aside = page.locator("#store-mobile-menu");
    await aside.waitFor({ state: "visible" });
    const cards = aside.locator(".mobile-catalog-card");
    await page.waitForFunction(() => document.querySelectorAll("#store-mobile-menu .mobile-catalog-card").length === 6, null, { timeout: 20000 });
    assert.equal(await cards.count(), 6);
    assert.equal(await aside.evaluate((node) => getComputedStyle(node.querySelector(".mobile-catalog-card-list")).gridTemplateColumns.split(" ").length), 1);
    assert.equal(await aside.locator(".mobile-catalog-card-fallback").count() + await aside.locator(".mobile-catalog-card-image").count(), 6);
    const appleCard = cards.filter({ hasText: "Apple" }).first();
    await appleCard.click();
    const panel = aside.locator(".mobile-catalog-card-panel").first();
    await panel.waitFor({ state: "visible" });
    assert.ok(await panel.locator("a").filter({ hasText: "iPhone" }).count() > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/mobile-${width}.png` });
    if (width === 390) {
      await panel.locator("a").filter({ hasText: "iPad" }).first().click();
      await page.waitForURL(/\/catalog\?menuItem=apple-ipad/, { timeout: 20000 });
      assert.equal(await aside.count(), 0);
    } else {
      await aside.locator(".store-mobile-menu-head button").click();
      assert.equal(await aside.count(), 0);
    }
    results.push({ viewport: width, cards: 6, overflow: false });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/product/test-iphone-product`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const notices = page.locator(".product-price-notices p");
  await notices.first().waitFor({ state: "visible", timeout: 30000 });
  assert.equal(await notices.count(), 2);
  assert.match(await notices.nth(0).innerText(), /Цена указана/);
  assert.match(await notices.nth(1).innerText(), /RuStore/);
  assert.equal(await notices.nth(1).evaluate((node) => getComputedStyle(node).borderTopStyle), "none");
  assert.ok(await page.locator("hr.product-divider").count() >= 3);
  assert.equal(await page.locator(".product-availability-divider").count(), 1);
  assert.equal(await page.locator(".product-options-divider").count(), 1);
  await page.screenshot({ path: `${outDir}/product-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: `${outDir}/product-mobile-390.png`, fullPage: true });
  results.push({ viewport: "product", notices: 2, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results));
} catch (error) {
  await page.screenshot({ path: `${outDir}/failure.png`, fullPage: true }).catch(() => undefined);
  await context.tracing.stop({ path: `${outDir}/failure-trace.zip` }).catch(() => undefined);
  console.error(JSON.stringify({ error: String(error), url: page.url(), title: await page.title().catch(() => ""), errors, body: (await page.locator("body").innerText().catch(() => "")).slice(0, 1600) }));
  throw error;
} finally {
  await browser.close();
}
