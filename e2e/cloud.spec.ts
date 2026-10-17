import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createSampleDeck, exportBoth, expectSaved, openTab, presentTwoSlides, renameDeck, restoreFirstVersion, runDeckPass, trashAndRestore, addComment } from "./flows";

// Signed-in mode against real Clerk + Supabase (see playwright.cloud.config.ts for setup).
// Covers what demo mode can't: the API, row-level security, version snapshots in the database,
// Trash, share links with a password, viewer comments and owner alerts.

const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to run signed-in tests.");

async function signIn(page: Page) {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "New deck" }).first()).toBeVisible();
}

const title = `E2E ${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

test.describe.serial("signed-in", () => {
  let deckId = "";
  let shareUrl = "";

  test("health check: every migration is applied", async ({ request }) => {
    const r = await request.get("/api/health");
    const body = await r.json();
    expect(body, JSON.stringify(body.database)).toMatchObject({ ok: true, mode: "cloud" });
  });

  test("create, edit, AI pass, comment and restore", async ({ page }) => {
    await signIn(page);
    deckId = await createSampleDeck(page);
    const original = await page.getByLabel("Deck title").inputValue();
    await renameDeck(page, title);
    await runDeckPass(page);
    await addComment(page, "Owner note on slide 1");

    // The saved deck comes back from the server after a reload.
    await page.reload();
    await expect(page.getByLabel("Deck title")).toHaveValue(title);
    await openTab(page, "Comments");
    await expect(page.getByRole("article").filter({ hasText: "Owner note on slide 1" })).toBeVisible();

    await restoreFirstVersion(page, original);
    await page.reload();
    await expect(page.getByLabel("Deck title")).toHaveValue(original);
    await renameDeck(page, title);
  });

  test("share with a password, comment as a viewer, and alert the owner", async ({ page, browser }) => {
    await signIn(page);
    await page.goto(`/d/${deckId}`);
    await page.getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog", { name: "Share" });
    await dialog.getByLabel(/Who is it for/).fill("E2E reviewer");
    await dialog.getByLabel(/^Password/).fill("e2e-pass");
    await dialog.getByLabel("Let viewers comment").check();
    await dialog.getByRole("button", { name: "Create link and copy it" }).click();
    const link = dialog.getByRole("textbox", { name: "Share link" }).first();
    await expect(link).toHaveValue(/\/v\//);
    shareUrl = await link.inputValue();

    // A viewer in a fresh browser (not signed in).
    const viewer = await (await browser.newContext()).newPage();
    await viewer.goto(shareUrl);
    await viewer.getByLabel("Password").fill("wrong");
    await viewer.getByRole("button", { name: "Open deck" }).click();
    await expect(viewer.getByText("That password isn\u2019t right.")).toBeVisible();
    await viewer.getByLabel("Password").fill("e2e-pass");
    await viewer.getByRole("button", { name: "Open deck" }).click();
    await expect(viewer.getByRole("img", { name: /^Slide 1 of/ })).toBeVisible();
    await viewer.getByRole("button", { name: /^Comment/ }).click();
    await viewer.getByLabel("Your name").fill("Riya (E2E)");
    await viewer.getByLabel(/^Comment on slide 1/).fill("Can we add the pricing slide earlier?");
    await viewer.getByRole("button", { name: "Send comment" }).click();
    await expect(viewer.getByText("Can we add the pricing slide earlier?")).toBeVisible();
    await viewer.waitForTimeout(11_000); // long enough for a view summary
    await viewer.close();

    // A second viewer reports the comment: it disappears for viewers, the owner sees it flagged.
    const other = await (await browser.newContext()).newPage();
    await other.goto(shareUrl);
    await other.getByLabel("Password").fill("e2e-pass");
    await other.getByRole("button", { name: "Open deck" }).click();
    await other.getByRole("button", { name: /^Comment/ }).click();
    await other.getByRole("button", { name: "Report comment by Riya (E2E)" }).click();
    await other.getByRole("radio", { name: /^Spam/ }).check();
    await other.getByRole("button", { name: "Send report" }).click();
    await expect(other.getByText("Thanks, we got your report.")).toBeVisible();
    await other.close();

    // The owner opening their own link isn't counted.
    await page.goto(shareUrl);
    await page.getByLabel("Password").fill("e2e-pass");
    await page.getByRole("button", { name: "Open deck" }).click();
    await expect(page.getByText("Your link · views not counted")).toBeVisible();
    await page.goto(`/d/${deckId}`);

    await page.reload();
    await openTab(page, "Comments");
    await page.getByRole("radio", { name: /^All/ }).click();
    await expect(page.getByRole("article").filter({ hasText: "Can we add the pricing slide earlier?" })).toContainText("via E2E reviewer");
    await expect(page.getByRole("article").filter({ hasText: "Can we add the pricing slide earlier?" })).toContainText("A viewer reported this");
    await page.getByRole("button", { name: "Keep it" }).click();
    await page.getByRole("button", { name: /^Alerts/ }).first().click();
    await expect(page.getByRole("menu", { name: "Alerts" }).getByText(/Riya \(E2E\) commented on slide 1/)).toBeVisible();
    await expect(page.getByRole("menu", { name: "Alerts" }).getByText(/E2E reviewer (opened|viewed)/).first()).toBeVisible();
  });

  test("export and present", async ({ page }) => {
    await signIn(page);
    await page.goto(`/d/${deckId}`);
    await expectSaved(page);
    await exportBoth(page);
    await presentTwoSlides(page, deckId);
  });

  test("Trash closes share links until the deck is restored", async ({ page, request }) => {
    await signIn(page);
    await page.goto("/decks");
    await page.getByRole("button", { name: `More actions for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Move to Trash" }).click();
    const id = shareUrl.split("/v/")[1];
    const closed = await request.post(`/api/v/${id}`, { data: { password: "e2e-pass" } });
    expect(closed.status()).toBe(410);
    await page.getByRole("tab", { name: /Trash/ }).click();
    await page.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Restore" }).click();
    const open = await request.post(`/api/v/${id}`, { data: { password: "e2e-pass" } });
    expect(open.status()).toBe(200);
    await trashAndRestore(page, title);
  });

  test("clean up", async ({ page }) => {
    await signIn(page);
    await page.goto("/decks");
    await page.getByRole("button", { name: `More actions for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Move to Trash" }).click();
    await page.getByRole("tab", { name: /Trash/ }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Delete forever" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
  });
});
