import { expect, test } from "@playwright/test";

for (const path of ["/trade-in", "/installment"] as const) {
  test(`${path} renders mobile form with independent consents`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator(".lead-request-form")).toBeVisible();
    const checks = page.locator(".request-consents input[type=checkbox]");
    await expect(checks).toHaveCount(2);
    await expect(checks.nth(0)).not.toBeChecked();
    await expect(checks.nth(1)).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("trade-in API rejects either missing consent before persistence", async ({ request }) => {
  const base = { name: "Тест", phone: "+7 (999) 123-45-67", city: "samara", personalDataConsent: true, privacyConsent: true };
  for (const missing of ["personalDataConsent", "privacyConsent"] as const) {
    const response = await request.post("/api/trade-in", { headers: { origin: "http://localhost:3000", "idempotency-key": `consent-${missing}-1234567890` }, data: { ...base, [missing]: false } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_REQUEST");
    expect(Object.keys(body.fields ?? {}).sort()).toEqual([missing]);
  }
});

test("trade-in submits with only contacts and both consents", async ({ page }) => {
  await page.route("**/api/trade-in", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ requestNumber: "TEST-100" }) }));
  await page.goto("/trade-in");
  await page.getByLabel("Имя *").fill("Тестовый клиент");
  await page.getByLabel("Телефон *").fill("9991234567");
  const body = page.locator(".request-consents input[type=checkbox]");
  await body.nth(0).check();
  await body.nth(1).check();
  const posted = page.waitForRequest((request) => request.url().endsWith("/api/trade-in"));
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  const request = await posted;
  expect(request.postData()).toContain("Тестовый клиент");
  expect(request.postData()).toContain("+7 (999) 123-45-67");
  for (const field of ["brand", "deviceType", "device", "configuration", "color", "batteryHealth", "condition"]) {
    expect(request.postData()).not.toContain(`name="${field}"`);
  }
  await expect(page.getByText("TEST-100")).toBeVisible();
});

test("lead photos are not publicly accessible", async ({ request }) => {
  const response = await request.get("/api/admin/lead-photo?path=%2Fuploads%2F2026%2F10%2Flead-0123456789abcdef0123456789abcdef.jpg");
  expect(response.status()).toBe(401);
  expect((await response.json()).error).toBe("UNAUTHORIZED");
});

test("trade-in device details are independent free-text fields", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/trade-in");
  const brand = page.getByLabel("Бренд");
  const type = page.getByLabel("Линейка / тип");
  const model = page.getByLabel("Модель");
  await expect(brand).toHaveJSProperty("tagName", "INPUT");
  await expect(type).toHaveJSProperty("tagName", "INPUT");
  await expect(model).toHaveJSProperty("tagName", "INPUT");
  await brand.fill("Xiaomi");
  await model.fill("14 Pro+");
  await expect(model).toHaveValue("14 Pro+");
  await expect(page.getByText("Нет нужной модели", { exact: true })).toHaveCount(0);
  const battery = page.locator('input[type="number"]');
  await battery.fill("101");
  expect(await battery.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);
});

test("trade-in submits arbitrary brand, type and model text unchanged", async ({ page }) => {
  await page.route("**/api/trade-in", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ requestNumber: "TEXT-100" }) }));
  await page.goto("/trade-in");
  await page.getByLabel("Имя *").fill("Тестовый клиент");
  await page.getByLabel("Телефон *").fill("9991234567");
  await page.getByLabel("Бренд").fill("Xiaomi");
  await page.getByLabel("Линейка / тип").fill("Redmi Note");
  await page.getByLabel("Модель").fill("14 Pro+");
  const consents = page.locator(".request-consents input[type=checkbox]");
  await consents.nth(0).check(); await consents.nth(1).check();
  const posted = page.waitForRequest((request) => request.url().endsWith("/api/trade-in"));
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  const request = await posted;
  for (const value of ["Xiaomi", "Redmi Note", "14 Pro+"]) expect(request.postData()).toContain(value);
  await expect(page.getByText("TEXT-100")).toBeVisible();
});

for (const width of [320, 375, 390, 430]) {
  test(`trade-in page has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/trade-in");
    await expect(page.locator(".lead-page-benefits")).toBeVisible();
    await expect(page.locator(".lead-request-form")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator(".trade-in-page .lead-page-hero").evaluate((el) => getComputedStyle(el).textAlign)).toBe("center");
  });
}

test("trade-in form is usable on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/trade-in");
  await expect(page.locator(".lead-request-form")).toBeVisible();
  await expect(page.getByText("Устройство для оценки")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("product trade-in keeps free-text device fields unpopulated", async ({ page, request }) => {
  const response = await request.get("/api/catalog/products?city=samara&limit=100&offset=0");
  const products = (await response.json()).data as Array<{ id: string; slug: string; name: string; brand: { name: string }; type: { name: string }; variants: Array<{ attributes: Record<string, unknown>; color: { name: string; nameRu?: string | null } | null }> }>;
  const product = products.find((item) => typeof item.variants[0]?.attributes.storage === "string" || typeof item.variants[0]?.attributes.memory === "string");
  test.skip(!product, "No catalog product with a storage variant is available");
  const variant = product!.variants[0];
  await page.route("**/api/catalog/trade-in-banner", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { isActive: true, mediaUrl: null, mediaType: null } }) }));
  await page.goto(`/product/${product!.slug}`);
  await page.getByRole("button", { name: "Узнать стоимость" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Бренд")).toHaveValue("");
  await expect(dialog.getByLabel("Линейка / тип")).toHaveValue("");
  await expect(dialog.getByLabel("Модель")).toHaveValue("");
  await expect(dialog.getByLabel("Объём памяти / конфигурация")).toHaveValue("");
  await expect(dialog.getByLabel("Цвет")).toHaveValue("");
  await expect(dialog.getByLabel("Модель")).toBeEditable();
});
