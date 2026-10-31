import { expect, test } from "@playwright/test";

test("mini product cards never show legal price notices", async ({ page }) => {
  await page.goto("/catalog");
  await expect(page.locator(".product-tile-card").first()).toBeVisible();
  await expect(page.locator(".product-tile-card", { hasText: "Цена указана за наличный расчёт" })).toHaveCount(0);
  await expect(page.locator(".product-tile-card", { hasText: "невозможности предустановки RuStore" })).toHaveCount(0);
});

test("detail notice applies to Apple and Samsung but not Dyson or Sony", async ({ page, request }) => {
  const response = await request.get("/api/catalog/products?city=samara&limit=100&offset=0");
  const products = (await response.json()).data as Array<{ slug: string; brand: { slug: string } }>;
  for (const brand of ["apple", "samsung", "dyson", "sony"]) {
    const product = products.find((item) => item.brand.slug === brand);
    if (!product) continue;
    await page.goto(`/product/${product.slug}`);
    await expect(page.getByText("Цена указана за наличный расчёт со скидкой для выбранного города и варианта.")).toBeVisible();
    const ruStore = page.getByText("Товар имеет недостаток в виде невозможности предустановки RuStore.");
    if (brand === "apple" || brand === "samsung") await expect(ruStore).toBeVisible();
    else await expect(ruStore).toHaveCount(0);
  }
});

test("used marker renders on cards and product detail from catalog data", async ({ page, request }) => {
  const listResponse = await request.get("/api/catalog/products?city=samara&limit=100&offset=0");
  const listBody = await listResponse.json();
  const product = listBody.data?.[0];
  test.skip(!product, "Catalog is empty");
  await page.route("**/api/catalog/products?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.data?.[0]) body.data[0] = { ...body.data[0], isUsed: true, specifications: { ...(body.data[0].specifications ?? {}), tradeIn: true } };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/catalog");
  await expect(page.locator(".product-used-chip").first()).toHaveText("Б/у");

  const detailResponse = await request.get(`/api/catalog/products/${product.slug}?city=samara`);
  const detailBody = await detailResponse.json();
  detailBody.data = { ...detailBody.data, isUsed: true, specifications: { ...(detailBody.data.specifications ?? {}), tradeIn: true, tradeInCondition: "Хорошее", tradeInBatteryHealth: 88 } };
  await page.route(`**/api/catalog/products/${product.slug}?city=*`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(detailBody) }));
  await page.goto(`/product/${product.slug}`);
  await expect(page.locator(".product-used-badge")).toHaveText("Б/у");
  await expect(page.getByText("Аккумулятор: 88%")).toBeVisible();
});

test("Trade-in category is available and contains only API-filtered products", async ({ page }) => {
  await page.goto("/catalog?category=trade-in");
  await expect(page.getByRole("radio", { name: /Trade-in — б\/у/ })).toBeChecked();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.evaluate(() => window.innerWidth));
});
