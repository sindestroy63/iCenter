import { expect, test } from "@playwright/test";

test.describe("cinematic product reveal", () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`catalog transition ${viewport.width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.setViewportSize(viewport);
      await page.goto("/catalog");
      const link = page.locator(".product-tile-image-link:has(img)").first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      const source = await link.locator("img").getAttribute("src");
      expect(href).toContain("/product/");
      expect(href).toContain("?variant=");
      await link.click();
      await page.waitForURL((url) => url.pathname.startsWith("/product/") && url.searchParams.has("variant"));
      const productPage = page.locator(".product-page");
      await expect(productPage).toBeVisible();
      await expect(productPage).toHaveClass(/is-cinematic-arrival/);
      await expect(page.locator(".product-reveal")).toHaveCount(0);
      await expect(page.locator(".gallery-main-photo")).toHaveAttribute("src", source!);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.goBack();
      await expect(page).toHaveURL(/\/catalog/);
      expect(errors).toEqual([]);
    });
  }

  test("direct URL and reduced motion do not run the overlay", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/catalog");
    const href = await page.locator(".product-tile-image-link:has(img)").first().getAttribute("href");
    await page.goto(href!);
    await expect(page.locator(".product-page")).toBeVisible();
    await expect(page.locator(".product-page")).not.toHaveClass(/is-cinematic-arrival/);
    await expect(page.locator(".product-reveal")).toHaveCount(0);
    await page.goto("/catalog");
    await page.locator(".product-tile-image-link:has(img)").first().click();
    await expect(page.locator(".product-reveal")).toHaveCount(0);
    await expect(page.locator(".product-page")).not.toHaveClass(/is-cinematic-arrival/);
  });

  for (const width of [1440, 390]) {
    test(`home collections ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto("/");
      const tiles = page.locator(".home-brand-card");
      await expect(tiles).toHaveCount(4);
      const expectedHeight = width === 1440 ? 198 : 213;
      await expect.poll(() => tiles.first().evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(expectedHeight);
      await expect(page.locator(".home-brand-card video.is-ready")).toHaveCount(4);
      await expect.poll(() => page.locator(".home-brand-card video").first().evaluate((video) => {
        const media = video as HTMLVideoElement;
        const style = getComputedStyle(media);
        return media.videoWidth > 0 && media.videoHeight > 0 && style.objectFit === "cover" && style.objectPosition.length > 0;
      })).toBe(true);
      await expect(page.locator(".home-offers .product-tile-card").first()).toBeVisible();
      await expect(page.locator(".popular .product-tile-card").first()).toBeVisible();
      await expect(page.locator(".home-offers .product-tile-image-link").first()).toHaveAttribute("href", /\?variant=/);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
