import { expect, test } from "./fixtures";

const DISCLAIMER = "Mia is a learning tool and does not replace advice from a pharmacist or doctor.";

test("first visit: / opens the unsaved new-chat composer and issues an HttpOnly owner cookie", async ({ page, context }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat\/new$/);
  await expect(page.getByRole("heading", { name: "Hi, I’m Mia!" })).toBeVisible();
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "mia_owner");
  expect(cookie).toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe("Lax");
  expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test("welcome state shows clickable examples and the required placeholder and privacy notice", async ({ page }) => {
  await page.goto("/chat/new");
  await expect(page.getByRole("button", { name: "What helps with hay fever?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How should I take ibuprofen?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Which products contain paracetamol?" })).toBeVisible();
  await expect(page.getByPlaceholder("Ask Mia about a product or symptom...")).toBeVisible();
  await expect(page.getByText("Do not enter personal health information.")).toBeVisible();
  await expect(page.getByText("Demo simulation — no external AI model is called.")).toBeVisible();
});

test("sending an example creates the chat, shows a product card and survives a reload", async ({ page }) => {
  await page.goto("/chat/new");
  await page.getByRole("button", { name: "Which products contain paracetamol?" }).click();
  await expect(page.getByText("Mia is typing...")).toBeVisible();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("article", { name: "Product: Paracetamol 500 mg tablets" })).toBeVisible();
  await expect(page.getByText("Ask a pharmacist if you’re unsure.").first()).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("article", { name: "Product: Paracetamol 500 mg tablets" })).toBeVisible();
  // The new chat appears in the history sidebar and `/` now opens it.
  await page.goto("/");
  await expect(page).toHaveURL(url);
});

test("empty and over-long messages show friendly validation without sending", async ({ page }) => {
  await page.goto("/chat/new");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Please enter a message" })).toBeVisible();
  await page.getByLabel("Message").fill("a".repeat(2001));
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/too long/i)).toBeVisible();
  await expect(page).toHaveURL(/\/chat\/new$/);
});

test("an emergency message returns only the urgent notice and no product cards", async ({ page }) => {
  await page.goto("/chat/new");
  await page.getByLabel("Message").fill("My throat is swelling after taking ibuprofen.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("This may be urgent. Contact your local emergency number or a doctor right away.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("attachment: unsupported types are rejected, supported ones show only the name and a demo note", async ({ page }) => {
  await page.goto("/chat/new");
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByText(/isn’t supported/)).toBeVisible();
  await input.setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("png") });
  await expect(page.getByText("photo.png")).toBeVisible();
  await expect(page.getByText("Demo only — the file will not be uploaded or read.")).toBeVisible();
  await page.getByRole("button", { name: "Remove attachment" }).click();
  await expect(page.getByText("photo.png")).toHaveCount(0);
});

test("a missing chat ID shows the generic 404 'Chat not found'", async ({ page }) => {
  const response = await page.goto("/chat/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Chat not found" })).toBeVisible();
});

test("products: lists the 7 seeded products, searches by symptom, and the detail is URL-driven", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(page.getByRole("link", { name: /tablets|capsules|spray/ })).toHaveCount(7);
  await page.getByLabel("Search products by name, active substance or symptom").fill("hay fever");
  await expect(page.getByRole("link", { name: /Cetirizine 10 mg tablets/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ibuprofen/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Cetirizine 10 mg tablets/ }).click();
  await expect(page).toHaveURL(/\/products\?product=/);
  await expect(page.getByRole("dialog").getByText("cetirizine")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/products$/);
});

test("products: category filter works and an unknown product ID shows 'Product not found'", async ({ page }) => {
  await page.goto("/products");
  await page.getByLabel("Filter by category").selectOption("Digestion");
  await expect(page.getByRole("link", { name: /Loperamide/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ibuprofen/ })).toHaveCount(0);
  await page.goto("/products?product=nope");
  await expect(page.getByRole("dialog").getByText("Product not found")).toBeVisible();
});

test("seeded products are read-only: Manage Products offers Duplicate but no Edit/Delete for them", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("button", { name: "Manage Products" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Seeded products (read-only)")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Duplicate / })).toHaveCount(7);
  await expect(dialog.getByRole("button", { name: /^Edit / })).toHaveCount(0);
});

test("browser Back and Forward move between views", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("link", { name: "Quiz" }).click();
  await expect(page).toHaveURL(/\/quiz$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/products$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/quiz$/);
  await expect(page.getByRole("heading", { name: "Quiz" })).toBeVisible();
});

test("quiz: five questions with immediate feedback, a final score and a saved result", async ({ page }) => {
  await page.goto("/quiz");
  await page.getByRole("button", { name: "Start quiz" }).click();
  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(`Question ${i} of 5`)).toBeVisible();
    await page.locator("section ul button").first().click();
    await expect(page.getByRole("status").filter({ hasText: /Correct!|Not quite\./ })).toBeVisible();
    await page.getByRole("button", { name: i === 5 ? "See my score" : "Next question" }).click();
  }
  await expect(page.getByRole("heading", { name: "Your score" })).toBeVisible();
  await expect(page.getByText(/^\d \/ 5$/).first()).toBeVisible();
  await expect(page.locator('section[aria-labelledby="last-results"] li')).toHaveCount(1, { timeout: 10_000 });
});

test("mutating requests from another origin are rejected", async ({ request }) => {
  const response = await request.post("/api/quiz/results", {
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    data: { score: 5, total: 5 },
  });
  expect(response.status()).toBe(403);
});

test("health endpoint reports ok and never sets an owner cookie", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["set-cookie"]).toBeUndefined();
});
