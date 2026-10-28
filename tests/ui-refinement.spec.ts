import { expect, test, type Page } from "@playwright/test";

async function seedCart(page: Page) {
  const response = await page.request.get("/api/catalog/products?city=samara&limit=10");
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { data?: Array<{ slug: string; variants?: Array<{ id: string }>; images?: Array<{ src: string | null }> }> };
  const product = body.data?.find((item) => item.variants?.length && item.images?.some((image) => image.src)) ?? body.data?.find((item) => item.variants?.length);
  expect(product?.variants?.[0]).toBeTruthy();
  await page.goto("/");
  await page.evaluate(({ slug, variantId }) => {
    localStorage.setItem("icenter-city", "samara");
    localStorage.setItem("icenter-cart-v2", JSON.stringify([{ slug, variantId, quantity: 1 }]));
  }, { slug: product!.slug, variantId: product!.variants![0].id });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
  test(`cart, checkout and catalog refinement ${viewport.width}`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.setViewportSize(viewport);
    await seedCart(page);
    await page.goto("/cart");
    await expect(page.locator(".store-page-heading h1")).toHaveText("Корзина");
    await expect(page.locator(".store-page-heading p")).toHaveText("Проверьте выбранные товары перед оформлением заявки");
    const quantity = page.locator(".cart-row .quantity b").first();
    await expect(quantity).toHaveText("1");
    const increase = page.locator(".cart-row .quantity button[aria-label='Увеличить']").first();
    const decrease = page.locator(".cart-row .quantity button[aria-label='Уменьшить']").first();
    for (let value = 2; value <= 6; value += 1) {
      await increase.click();
      await expect(quantity).toHaveText(String(value));
    }
    for (let value = 5; value >= 1; value -= 1) {
      await decrease.click();
      await expect(quantity).toHaveText(String(value));
    }
    await page.screenshot({ path: `.tmp/ui-refinement/cart-${viewport.width}.png`, fullPage: true });
    await page.goto("/checkout");
    await expect(page.locator(".store-page-heading h1")).toHaveText("Оформление заявки");
    await page.goto("/catalog");
    await expect(page.locator(".store-page-heading h1")).toHaveText("Каталог");
    await expect(page.locator(".store-page-heading p")).toHaveText("Выбирайте технику и аксессуары по выгодным ценам");
    await expect(page.getByText("Каталог iCenter", { exact: true })).toHaveCount(0);
    await expect(page.locator(".catalog-grid .product-tile-card, .empty-state").first()).toBeVisible();
    await page.screenshot({ path: `.tmp/ui-refinement/catalog-${viewport.width}.png`, fullPage: true });
    expect(browserErrors).toEqual([]);
  });
}

test("banner editor exposes image and video modes", async ({ page }) => {
  await page.goto("/admin/banners");
  test.skip(page.url().includes("/admin/login"), "Admin credentials are not available in the local test browser.");
  await page.getByRole("button", { name: /Добавить медиа|Настроить/ }).first().click();
  const typeSelect = page.getByLabel("Тип медиа");
  await expect(typeSelect).toBeVisible();
  await typeSelect.selectOption("video");
  await expect(page.locator("input[type=file][accept*='.mp4']")).toBeAttached();
});
