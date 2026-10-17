import { expect, type Download, type Page } from "@playwright/test";

// Steps shared by the demo and signed-in browser tests. They use roles and labels the way a
// person (or a screen reader) finds things, so a renamed button fails loudly here.

/** New deck from the sample memo: input → outline → style → generate → editor. Returns the deck id. */
export async function createSampleDeck(page: Page): Promise<string> {
  await page.goto("/new");
  await page.getByRole("button", { name: "Fill in a sample memo" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Fix the story first" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Choose a style" }).click();
  await expect(page.getByRole("heading", { name: "Pick a style" })).toBeVisible();
  await page.getByRole("button", { name: /^Generate \d+ slides/ }).click();
  await page.waitForURL(/\/d\/[a-z0-9_-]{8,32}$/, { timeout: 120_000 });
  await expect(page.getByLabel("Deck title")).toBeVisible();
  await expectSaved(page);
  return new URL(page.url()).pathname.split("/").pop()!;
}

export async function expectSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 20_000 });
}

export async function renameDeck(page: Page, title: string) {
  const input = page.getByLabel("Deck title");
  await input.fill(title);
  await input.press("Enter");
  await expect(input).toHaveValue(title);
  await expectSaved(page);
}

export async function openTab(page: Page, name: "Design" | "Motion" | "Ask" | "Review" | "Comments") {
  await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
}

/** Review tab: the AI pass "Shorten every title", applied to every changed slide. */
export async function runDeckPass(page: Page) {
  await openTab(page, "Review");
  await page.getByRole("button", { name: "Shorten every title" }).click();
  const apply = page.getByRole("button", { name: /^Apply \d+ slides?$/ });
  await expect(apply).toBeVisible();
  // Untick one slide: it must stay as it was.
  const boxes = page.getByRole("checkbox", { name: /Apply the change to slide/ });
  if ((await boxes.count()) > 1) await boxes.first().uncheck();
  await apply.click();
  await expect(page.getByText(/Applied changes to \d+ slides?/)).toBeVisible();
  await expectSaved(page);
}

export async function addComment(page: Page, text: string) {
  await openTab(page, "Comments");
  await page.getByPlaceholder(/^Comment on slide \d+$/).fill(text);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: text })).toBeVisible();
}

export async function resolveComment(page: Page, text: string) {
  const thread = page.getByRole("article").filter({ hasText: text });
  await thread.getByRole("button", { name: "Resolve thread" }).click();
  await expect(thread).toHaveCount(0);
}

/** Restores "Deck created" from version history; the renamed title goes back to the original. */
export async function restoreFirstVersion(page: Page, originalTitle: string) {
  await page.getByRole("button", { name: "Version history" }).click();
  await page.getByRole("button", { name: /Deck created/ }).first().click();
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.getByLabel("Deck title")).toHaveValue(originalTitle);
  await expect(page.getByText(/^Restored "/)).toBeVisible();
  await expectSaved(page);
}

async function download(page: Page, format: "PowerPoint" | "PDF", button: string): Promise<Download> {
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Download" });
  await dialog.getByRole("radio", { name: new RegExp(`^${format}`) }).click();
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), dialog.getByRole("button", { name: button }).click()]);
  await dialog.getByRole("button", { name: "Close" }).click();
  return file;
}

export async function exportBoth(page: Page) {
  const pptx = await download(page, "PowerPoint", "Download .pptx");
  expect(pptx.suggestedFilename()).toMatch(/\.pptx$/);
  const pdf = await download(page, "PDF", "Download PDF");
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  // The files are real: PowerPoint is a ZIP ("PK"), PDF starts with "%PDF".
  const head = async (d: Download) => (await (await import("node:fs/promises")).readFile((await d.path())!)).subarray(0, 4).toString("latin1");
  expect(await head(pptx)).toBe("PK\u0003\u0004");
  expect(await head(pdf)).toBe("%PDF");
}

export async function presentTwoSlides(page: Page, deckId: string) {
  await page.goto(`/d/${deckId}/present?slide=1`);
  await expect(page.getByRole("img", { name: /^Slide 1 of \d+/ })).toBeVisible();
  // Builds can take several presses before the next slide.
  const second = page.getByRole("img", { name: /^Slide 2 of \d+/ });
  for (let i = 0; i < 12 && !(await second.isVisible()); i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }
  await expect(second).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForURL(new RegExp(`/d/${deckId}`));
}

export async function trashAndRestore(page: Page, title: string) {
  await page.goto("/decks");
  await page.getByRole("button", { name: `More actions for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await page.getByRole("tab", { name: /Trash/ }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("tab", { name: /^All/ }).click();
  await expect(page.getByRole("button", { name: `More actions for ${title}` })).toBeVisible();
}
