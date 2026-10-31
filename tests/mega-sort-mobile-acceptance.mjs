import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const baseURL = process.env.TEST_APP_URL ?? "http://localhost:3111";
const password = process.env.TEST_ADMIN_PASSWORD;
assert.ok(password, "TEST_ADMIN_PASSWORD is required");
const credentials = JSON.parse(await readFile(".tmp/test-admin-credentials/credentials.json", "utf8"));
const admin = credentials.accounts.find((entry) => entry.email === "admin@icenter.ru");
assert.ok(admin);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
const createdRoots = [];
const createdChildren = [];
const titleInput = () => page.locator('.catalog-menu-editor label').filter({ hasText: "Название" }).locator("input");
const descriptionInput = () => page.locator('.catalog-menu-editor label').filter({ hasText: "Короткое описание" }).locator("input");
const save = () => page.locator('header.workspace-head button').first();
async function selectNode(title) { await page.locator('.catalog-menu-tree-select').filter({ hasText: title }).first().click(); }
async function addRoot(title) { await page.locator('.catalog-menu-tree-toolbar button').click(); await titleInput().fill(title); const action = page.locator('.catalog-menu-editor select').first(); await action.selectOption("url"); createdRoots.push(title); }
async function addChild(title) { await page.locator('.catalog-menu-editor > button.admin-secondary').click(); await titleInput().fill(title); createdChildren.push(title); }
async function menuConfig() { const response = await page.request.get(`${baseURL}/api/admin/catalog-menu`); assert.equal(response.status(), 200); return (await response.json()).menu; }
try {
  await page.goto(`${baseURL}/admin/login`);
  await page.locator('input[type="email"]').fill(admin.email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(600);
  assert.ok(!page.url().includes('/admin/login'), `login failed: ${page.url()}`);
  await page.goto(`${baseURL}/admin/catalog-menu`);
  await page.waitForSelector('.catalog-menu-tree-toolbar button');

  await addRoot("QA Sort A");
  await descriptionInput().fill("Временный раздел A");
  await addChild("QA Child 1");
  await selectNode("QA Sort A");
  await addChild("QA Child 2");
  await selectNode("QA Sort A");
  await selectNode("QA Child 2");
  await page.getByRole("button", { name: "Переместить выше" }).click();
  await addRoot("QA Sort B");
  await selectNode("QA Child 1");
  const parent = page.locator('.catalog-menu-editor label').filter({ hasText: "Родительский раздел" }).locator("select");
  assert.equal(await parent.count(), 1, "parent selector is required for move test");
  await parent.selectOption({ label: "QA Sort B" });
  await selectNode("QA Sort B");
  await page.getByRole("button", { name: "Переместить выше" }).click();
  await save().click();
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('.catalog-menu-tree-toolbar button');

  let config = await menuConfig();
  const a = config.items.find((item) => item.title === "QA Sort A");
  const b = config.items.find((item) => item.title === "QA Sort B");
  assert.ok(a && b);
  const c1 = config.items.find((item) => item.title === "QA Child 1");
  const c2 = config.items.find((item) => item.title === "QA Child 2");
  assert.equal(c1.parentId, b.id);
  assert.equal(c2.parentId, a.id);
  assert.ok(b.sortOrder < a.sortOrder, "root order persisted");
  assert.ok(c2.sortOrder >= 0, "child order persisted");

  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await page.screenshot({ path: ".tmp/mega-sort-admin-desktop.png", fullPage: true });
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseURL}/admin/catalog-menu`);
    await page.waitForSelector('.catalog-menu-tree-toolbar button');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, `horizontal overflow at ${width}px`);
    await selectNode("QA Sort A");
    assert.equal(await titleInput().isVisible(), true);
    assert.equal(await descriptionInput().isVisible(), true);
    assert.equal(await page.locator('.catalog-menu-editor select').first().isVisible(), true);
    assert.equal(await page.locator('.catalog-menu-upload input[type="file"]').isVisible(), true);
    assert.equal(await page.locator('.catalog-menu-tree-toolbar button').isVisible(), true);
    await page.screenshot({ path: `.tmp/mega-sort-admin-mobile-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseURL}/`);
  await page.getByRole("button", { name: /Каталог/ }).click();
  await page.waitForSelector('.catalog-mega-menu');
  const publicTitles = await page.locator('.catalog-mega-card-title').allTextContents();
  const firstQa = publicTitles.indexOf("QA Sort B");
  const secondQa = publicTitles.indexOf("QA Sort A");
  assert.ok(firstQa >= 0 && secondQa >= 0 && firstQa < secondQa, "public root order persisted");
  await page.screenshot({ path: ".tmp/mega-sort-public-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseURL}/`);
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.waitForSelector('.mobile-catalog-card-list');
  const mobileCards = page.locator('.mobile-catalog-card-title');
  assert.ok(await mobileCards.count() >= 2);
  const mobileTitles = await mobileCards.allTextContents();
  assert.ok(mobileTitles.indexOf("QA Sort B") < mobileTitles.indexOf("QA Sort A"));
  await page.screenshot({ path: ".tmp/mega-sort-public-mobile.png", fullPage: true });
} finally {
  await page.goto(`${baseURL}/admin/catalog-menu`).catch(() => {});
  for (const title of [...createdRoots].reverse()) {
    const node = page.locator('.catalog-menu-tree-select').filter({ hasText: title }).first();
    if (await node.count()) {
      await node.click();
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator('.catalog-menu-editor-head button.danger').click();
    }
  }
  if (await page.locator('.catalog-menu-tree-toolbar button').count()) await save().click().catch(() => {});
  await context.tracing.stop({ path: ".tmp/mega-sort-mobile-acceptance.zip" }).catch(() => {});
  await browser.close();
}
assert.deepEqual(errors, [], `browser errors: ${errors.join("\n")}`);
console.log("sorting, child move, public order and mobile admin checks passed");
