import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createSampleDeck, openTab } from "./flows";

// Automated accessibility checks (axe) on the main screens. Fails on serious and critical
// problems. The slide canvas itself still needs a manual screen-reader pass (see README).

async function check(page: Page, what: string) {
  // label-content-name-mismatch is off: slide thumbnails show slide text as a picture, and their
  // buttons are named by slide number ("Slide 3"), which is what a screen-reader user needs.
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).disableRules(["label-content-name-mismatch"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
  expect(bad, `${what}:\n${report}`).toEqual([]);
}

test("landing page", async ({ page }) => {
  // Reduced motion first, so axe never measures text halfway through a fade-in.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await check(page, "landing");
});

test("dashboard and new deck", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).or(page.getByRole("complementary", { name: "Main navigation" }))).toBeVisible();
  await check(page, "dashboard");
  await page.goto("/new");
  await check(page, "new deck");
});

test("editor with review and comments", async ({ page }) => {
  await createSampleDeck(page);
  await check(page, "editor");
  await openTab(page, "Review");
  await check(page, "review tab");
  await openTab(page, "Comments");
  await check(page, "comments tab");
});
