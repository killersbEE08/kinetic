import { expect, test } from "@playwright/test";
import { addComment, createSampleDeck, exportBoth, expectSaved, openTab, presentTwoSlides, renameDeck, resolveComment, restoreFirstVersion, runDeckPass, trashAndRestore } from "./flows";

// Demo mode: everything is stored in this browser and the AI is the offline engine.
// One test walks the whole path a new user takes; the others check single features.

test("health check reports demo mode", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  expect(await r.json()).toMatchObject({ ok: true, mode: "demo" });
});

test("create, edit, review, comment, restore, export, present and trash a deck", async ({ page }) => {
  const id = await createSampleDeck(page);
  const original = await page.getByLabel("Deck title").inputValue();

  await renameDeck(page, "E2E pitch");
  await runDeckPass(page);

  await addComment(page, "Check the churn number with finance");
  await resolveComment(page, "Check the churn number with finance");

  await restoreFirstVersion(page, original);
  await renameDeck(page, "E2E pitch");

  await exportBoth(page);
  await presentTwoSlides(page, id);
  await trashAndRestore(page, "E2E pitch");

  // Activation funnel: the steps were recorded in order.
  const events = await page.evaluate(() => (JSON.parse(localStorage.getItem("kinetic.demo.events.v1") ?? "[]") as { name: string; deckId?: string }[]).map((e) => e.name));
  for (const name of ["outline_created", "deck_created", "deck_edited", "deck_pass_applied", "comment_added", "deck_downloaded", "deck_presented"]) expect(events).toContain(name);
  expect(events.indexOf("deck_created")).toBeLessThan(events.indexOf("deck_edited"));
  expect(events).toContain("timing");
});

test("review list fixes problems in one click, and undo brings them back", async ({ page }) => {
  const id = await createSampleDeck(page);
  // Mark two elements as AI-written details that aren't in the notes, like Gemini output would be.
  await page.evaluate((deckId) => {
    const all = JSON.parse(localStorage.getItem("kinetic.demo.decks.v1")!);
    const d = all[deckId];
    d.slides[1].elements[0].aiSuggested = true;
    d.slides[2].elements[0].aiSuggested = true;
    localStorage.setItem("kinetic.demo.decks.v1", JSON.stringify(all));
  }, id);
  await page.reload();
  await openTab(page, "Review");
  const markAll = page.getByRole("button", { name: /^Mark as checked: all \d+$/ });
  await expect(markAll).toBeVisible();
  const n = Number((await markAll.textContent())!.match(/\d+$/)![0]);
  expect(n).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(`${n} details not found in your notes`, { exact: false })).toBeVisible();

  await markAll.click();
  await expectSaved(page);
  await expect(page.getByRole("button", { name: /^Mark as checked/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.getByRole("button", { name: `Mark as checked: all ${n}` })).toBeVisible();

  // Each row opens its slide.
  await page.getByRole("button", { name: /^Slide 3 · / }).click();
  await expect(page.getByRole("navigation", { name: "Slides" }).getByRole("button", { name: /^Slide 3( \(|$)/ })).toHaveAttribute("aria-current", "true");
});

test("share links explain that they need an account", async ({ page }) => {
  await createSampleDeck(page);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByText("Share links need an account.")).toBeVisible();
});


test("start editing slide 1 while the rest are still being written", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "Fill in a sample memo" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Choose a style" }).click();
  await page.getByRole("button", { name: /^Generate \d+ slides/ }).click();
  const total = Number((await page.getByRole("status").filter({ hasText: /of \d+ slides written/ }).textContent())!.match(/of (\d+)/)![1]);
  await page.getByRole("button", { name: "Start editing now" }).click();
  await page.waitForURL(/\/d\/[a-z0-9_-]{8,32}$/);

  // Edit slide 1 right away; it must survive the rest arriving.
  const title = page.getByLabel("Deck title");
  await title.fill("Early edit");
  await title.press("Enter");

  await expect(page.getByText(/^Writing slides:/)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Slides" }).getByRole("button", { name: /^Slide \d+( \(|$)/ })).toHaveCount(total);
  await expect(page.getByText("Writing this slide…")).toHaveCount(0);
  await expect(title).toHaveValue("Early edit");
  await expectSaved(page);

  // Everything is saved: a reload shows the same finished deck.
  await page.reload();
  await expect(page.getByLabel("Deck title")).toHaveValue("Early edit");
  await expect(page.getByRole("navigation", { name: "Slides" }).getByRole("button", { name: /^Slide \d+( \(|$)/ })).toHaveCount(total);
});

test("report page loads", async ({ page }) => {
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Report a shared deck" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send report" })).toBeDisabled();
});
