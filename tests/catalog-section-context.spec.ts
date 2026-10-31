import { expect, test } from "@playwright/test";

const city = "samara";

const sections = [
  { name: "iPhone", url: "/catalog?section=apple-iphone&scopeBrand=apple&scopeType=iphone", brand: "apple", type: "iphone" },
  { name: "iPad", url: "/catalog?section=apple-ipad&scopeBrand=apple&scopeType=ipad", brand: "apple", type: "ipad" },
  { name: "Смартфоны Samsung", url: "/catalog?section=samsung-smartphones&scopeBrand=samsung&scopeType=galaxy", brand: "samsung", type: "galaxy" },
  { name: "Пылесосы Dyson", url: "/catalog?section=dyson-vacuums&scopeBrand=dyson&scopeType=vacuum-cleaner", brand: "dyson", type: "vacuum-cleaner" },
  { name: "Sony PlayStation", url: "/catalog?section=consoles-playstation&scopeBrand=sony&scopeType=playstation", brand: "sony", type: "playstation" },
] as const;

for (const section of sections) {
  test(`${section.name} keeps its hidden catalog scope`, async ({ page, request }) => {
    const params = new URLSearchParams({ city, limit: "100", scopeBrand: section.brand, scopeType: section.type });
    const response = await request.get(`/api/catalog/products?${params}`);
    expect(response.ok()).toBeTruthy();
    const products = (await response.json()).data as Array<{ brand: { slug: string }; type: { slug: string }; variants: unknown[] }>;
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((product) => product.brand.slug === section.brand && product.type.slug === section.type)).toBeTruthy();

    await page.goto(section.url);
    await expect(page.getByRole("heading", { level: 1, name: section.name })).toBeVisible();
    await expect(page.locator(".catalog-grid .product-tile-card")).toHaveCount(products.reduce((count, product) => count + product.variants.length, 0));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`section=${section.url.match(/section=([^&]+)/)?.[1]}`));
    await expect(page.getByRole("heading", { level: 1, name: section.name })).toBeVisible();
  });
}

test("visible filters cannot expand an iPhone section beyond its scope", async ({ request }) => {
  const scoped = await request.get(`/api/catalog/products?city=${city}&limit=100&scopeBrand=apple&scopeType=iphone`);
  const conflicting = await request.get(`/api/catalog/products?city=${city}&limit=100&scopeBrand=apple&scopeType=iphone&brand=samsung`);
  const scopedProducts = (await scoped.json()).data as unknown[];
  const conflictingProducts = (await conflicting.json()).data as unknown[];
  expect(scopedProducts.length).toBeGreaterThan(0);
  expect(conflictingProducts).toEqual([]);
});

test("reset keeps section scope while pagination remains scoped", async ({ page, request }) => {
  await page.goto("/catalog?section=apple-iphone&scopeBrand=apple&scopeType=iphone&brand=samsung&sort=priceDesc");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page.locator(".filter-reset").click();
  await expect(page).toHaveURL(/section=apple-iphone/);
  await expect(page).toHaveURL(/scopeBrand=apple/);
  await expect(page).toHaveURL(/scopeType=iphone/);
  await expect(page).not.toHaveURL(/brand=samsung/);
  await expect(page.locator(".catalog-grid .product-tile-card").first()).toBeVisible();

  for (const offset of [0, 1]) {
    const response = await request.get(`/api/catalog/products?city=${city}&limit=1&offset=${offset}&scopeBrand=apple&scopeType=iphone`);
    expect(response.ok()).toBeTruthy();
    const products = (await response.json()).data as Array<{ brand: { slug: string }; type: { slug: string } }>;
    expect(products.every((product) => product.brand.slug === "apple" && product.type.slug === "iphone")).toBeTruthy();
  }
});

test("general catalog remains unrestricted and Trade-in keeps its used-product rule", async ({ request }) => {
  const general = await request.get(`/api/catalog/products?city=${city}&limit=100`);
  expect(general.ok()).toBeTruthy();
  const generalProducts = (await general.json()).data as Array<{ brand: { slug: string } }>;
  expect(new Set(generalProducts.map((product) => product.brand.slug)).size).toBeGreaterThan(1);

  const tradeIn = await request.get(`/api/catalog/products?city=${city}&limit=100&scopeCategory=trade-in`);
  expect(tradeIn.ok()).toBeTruthy();
  const usedProducts = (await tradeIn.json()).data as Array<{ isUsed?: boolean }>;
  expect(usedProducts.every((product) => product.isUsed === true)).toBeTruthy();
});
