import { expect, test } from "@playwright/test";

for (const width of [320, 375, 390, 430]) {
  test(`mobile navigation and catalog drawer ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", width);

    const menuButton = page.getByRole("button", { name: "Открыть меню" });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Основное меню" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Открыть каталог" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(page.locator("#store-mobile-menu")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");

    await page.locator(".catalog-btn").click();
    await expect(page).toHaveURL(/\/catalog$/);
    await page.getByRole("button", { name: "Фильтры" }).click();
    const filters = page.locator(".filters");
    await expect(filters).toHaveClass(/filters-open/);
    await filters.getByRole("button", { name: "Закрыть фильтры" }).click();
    await expect(filters).not.toHaveClass(/filters-open/);
  });
}

test("mobile hero uses playable CMS video", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const heroVideo = page.locator(".home-hero-video");
  await expect(heroVideo).toHaveAttribute("src", /\/uploads\/\d{4}\/\d{2}\/.+\.mp4$/);
  await expect.poll(() => heroVideo.evaluate((video: HTMLVideoElement) => ({ readyState: video.readyState, width: video.videoWidth }))).toMatchObject({ readyState: 4, width: 1920 });
});
