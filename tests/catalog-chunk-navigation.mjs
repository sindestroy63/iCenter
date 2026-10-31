import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.env.TEST_APP_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
const consoleErrors = [];
let expandedAfterClick;

page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
  if (message.type() === "error" && /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(message.text())) {
    failures.push(`console: ${message.text()}`);
  }
});
page.on("response", (response) => {
  if (response.url().includes("/_next/static/chunks/") && response.status() >= 400) {
    failures.push(`chunk ${response.status()}: ${response.url()}`);
  }
});

async function assertCatalogReady(expectedMenuItem) {
  await page.locator(".catalog-heading h1").waitFor({ state: "visible", timeout: 30000 });
  await page.locator(".catalog-sort-trigger").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector(".loading-state"), null, { timeout: 60000 });
  assert.equal(await page.locator(".catalog-grid, .empty-state").count() > 0, true, "catalog must show products or its empty state");
  if (expectedMenuItem) assert.equal(new URL(page.url()).searchParams.get("menuItem"), expectedMenuItem);
  assert.deepEqual(failures, [], `chunk failures at ${page.url()}`);
}

try {
  const routes = [
    ["/catalog", ""],
    ["/catalog?menuItem=apple", "apple"],
    ["/catalog?menuItem=apple-iphone", "apple-iphone"],
    ["/catalog?menuItem=apple-ipad", "apple-ipad"],
    ["/catalog?menuItem=dyson", "dyson"],
  ];

  for (const [route, item] of routes) {
    await page.goto(new URL(route, base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await assertCatalogReady(item);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await assertCatalogReady(item);
  }

  const menuLoaded = page.waitForResponse((response) => response.url().includes("/api/catalog/menu?") && response.status() === 200, { timeout: 30000 });
  await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
  await menuLoaded;
  const catalogTrigger = page.locator(".catalog-btn");
  await catalogTrigger.waitFor({ state: "visible" });
  await page.waitForTimeout(100);
  await catalogTrigger.click();
  expandedAfterClick = await catalogTrigger.getAttribute("aria-expanded");
  const menu = page.locator(".catalog-mega-menu");
  await menu.waitFor({ state: "visible", timeout: 10000 });
  await menu.locator('.catalog-mega-card[href="/catalog?menuItem=apple"]').click();
  await page.waitForURL(/\/catalog\?menuItem=apple$/);
  await assertCatalogReady("apple");

  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator(".catalog-btn").click();
  const appleCard = page.locator(".catalog-mega-card-shell").filter({ has: page.locator('.catalog-mega-card[href="/catalog?menuItem=apple"]') });
  await appleCard.locator(".catalog-mega-card").hover();
  await appleCard.locator('.catalog-mega-card-child[href="/catalog?menuItem=apple-iphone"]').click();
  await page.waitForURL(/\/catalog\?menuItem=apple-iphone$/);
  await assertCatalogReady("apple-iphone");
  await page.locator(".catalog-sort-trigger").click();
  await page.locator('.catalog-sort-menu [role="option"]').nth(3).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("sort") === "priceAsc");
  assert.equal(new URL(page.url()).searchParams.get("menuItem"), "apple-iphone", "sorting must preserve the section context");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await assertCatalogReady("apple-iphone");
  assert.equal(new URL(page.url()).searchParams.get("sort"), "priceAsc");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.goForward({ waitUntil: "domcontentloaded" });
  await assertCatalogReady("apple-iphone");

  const city = "samara";
  for (const [item, brand, type] of [["apple-iphone", "apple", "iphone"], ["apple-ipad", "apple", "ipad"], ["dyson", "dyson", null]]) {
    for (const offset of [0, 100]) {
      const response = await page.request.get(new URL(`/api/catalog/products?city=${city}&menuItem=${item}&limit=100&offset=${offset}`, base).href);
      assert.equal(response.status(), 200, `catalog API for ${item} offset ${offset}`);
      const body = await response.json();
      assert.ok(Array.isArray(body.data), `catalog API data for ${item}`);
      if (item === "dyson" && offset === 0 && body.data.length === 0) {
        await page.goto(new URL("/catalog?menuItem=dyson", base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
        await assertCatalogReady("dyson");
        await page.locator(".catalog-results .empty-state").waitFor({ state: "visible" });
      }
      for (const product of body.data) {
        assert.equal(product.brand?.slug, brand, `brand scope for ${item}`);
        if (type) assert.equal(product.type?.slug, type, `type scope for ${item}`);
      }
    }
  }

  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ routes: routes.map(([path]) => path), clickNavigation: ["apple", "apple-iphone"], history: "back/forward passed", chunkFailures: failures.length }));
} catch (error) {
  const trigger = page.locator(".catalog-btn");
  console.error(JSON.stringify({ error: String(error), url: page.url(), triggerCount: await trigger.count(), triggerExpanded: await trigger.getAttribute("aria-expanded").catch(() => null), expandedAfterClick: typeof expandedAfterClick === "undefined" ? null : expandedAfterClick, menuCount: await page.locator(".catalog-mega-menu").count(), consoleErrors, chunkFailures: failures }));
  throw error;
} finally {
  await browser.close();
}
