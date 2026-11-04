import { expect, test } from "./fixtures";

test("the sidebar is a hamburger drawer on mobile and closes after navigation", async ({ page }) => {
  await page.goto("/products");
  const hamburger = page.getByRole("button", { name: "Open navigation menu" });
  await expect(hamburger).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

  await hamburger.click();
  const drawer = page.getByRole("dialog", { name: "Mia navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Quiz" })).toBeVisible();
  await drawer.getByRole("link", { name: "Quiz" }).click();
  await expect(page).toHaveURL(/\/quiz$/);
  await expect(drawer).toBeHidden();
});

test("Escape closes the drawer and returns focus to the hamburger button", async ({ page }) => {
  await page.goto("/quiz");
  const hamburger = page.getByRole("button", { name: "Open navigation menu" });
  await hamburger.click();
  await expect(page.getByRole("dialog", { name: "Mia navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Mia navigation" })).toBeHidden();
  await expect(hamburger).toBeFocused();
});

test("the drawer has an accessible close button and traps focus inside", async ({ page }) => {
  await page.goto("/quiz");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Mia navigation" });
  await expect(drawer.getByRole("button", { name: "Close" })).toBeVisible();
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
});

test("the disclaimer, composer and privacy notice are visible without scrolling on a phone viewport", async ({ page }) => {
  await page.goto("/chat/new");
  await expect(page.getByText("Mia is a learning tool and does not replace advice from a pharmacist or doctor.")).toBeInViewport();
  await expect(page.getByPlaceholder("Ask Mia about a product or symptom...")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Send" })).toBeInViewport();
  await expect(page.getByText("Do not enter personal health information.")).toBeInViewport();
  const horizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(horizontalScroll).toBe(false);
});

test("controls are at least 44 px high on mobile", async ({ page }) => {
  await page.goto("/chat/new");
  for (const locator of [
    page.getByRole("button", { name: "Send" }),
    page.getByRole("button", { name: "Attach File" }),
    page.getByRole("button", { name: "Advanced settings" }),
    page.getByRole("button", { name: "Manage Prompts" }),
  ]) {
    const box = await locator.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  }
});

test("dialogs open full-screen on mobile", async ({ page }) => {
  await page.goto("/chat/new");
  await page.getByRole("button", { name: "Advanced settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Advanced settings" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
});

test("the delete-chat icon stays visible on mobile once a chat exists", async ({ page }) => {
  await page.goto("/chat/new");
  await page.getByRole("button", { name: "What helps with hay fever?" }).click();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/, { timeout: 15_000 });
  // Wait for the saved chat to render so the route change has fully committed;
  // otherwise the "close drawer on navigation" effect can close a drawer opened too early.
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const trash = page.getByRole("button", { name: /^Delete chat:/ }).first();
  await expect(trash).toBeVisible();
  const box = await trash.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(43.5);
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
});
