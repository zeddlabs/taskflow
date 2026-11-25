import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expectControlContrast } from "./contrast";

async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Morgan Ellis");
  await page
    .getByLabel("Email address")
    .fill(randomUUID() + "@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
}
async function snapshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}
test("onboard from Overview, switch tenants, edit settings and recover an archived selection", async ({
  page,
}, info) => {
  test.slow();
  await register(page);
  await expect(
    page.getByText("Create your first workspace", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create workspace" }).click();
  const name = page.getByLabel("Workspace name", { exact: true });
  const address = page.getByLabel("Workspace address", { exact: true });
  const create = page.getByRole("button", { name: "Create workspace" });
  await create.click();
  await expect(name).toBeFocused();
  await name.fill("Northline Studio");
  await expect(address).toHaveValue("northline-studio");
  await address.fill("Not valid!");
  await create.click();
  await expect(address).toBeFocused();
  const slug = "northline-" + randomUUID().slice(0, 8);
  await address.fill(slug);
  await snapshot(page, info, "onboarding");
  await create.click();
  await expect(
    page.getByRole("heading", { name: "Northline Studio" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Workspace created.");
  await page.getByRole("link", { name: "Create workspace" }).click();
  await name.fill("Northline Studio");
  await address.fill(slug);
  await create.click();
  await expect(address).toHaveAccessibleDescription(/already in use/);
  const second = "design-" + randomUUID().slice(0, 8);
  await address.fill(second);
  await create.click();
  const switcher = page.getByLabel("Switch workspace");
  await expect(switcher).toHaveValue(second);
  await switcher.selectOption(slug);
  await expect(page).toHaveURL(new RegExp("/w/" + second));
  await switcher.press("Tab");
  await expect(
    page.getByRole("button", { name: "Switch", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(switcher).toHaveValue(slug);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(name).toHaveValue("Northline Studio");
  const zone = page.getByLabel("Time zone", { exact: true });
  const save = page.getByRole("button", { name: "Save changes" });
  await zone.fill("Missing/Zone");
  await save.click();
  await expect(zone).toBeFocused();
  await zone.fill("Asia/Jakarta");
  await page.getByLabel("Allow members to create projects").check();
  await page.route("**/api/v1/workspaces/*", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({ status: 503 });
    else await route.continue();
  });
  await save.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "try again",
  );
  await page.unroute("**/api/v1/workspaces/*");
  const pending = Promise.withResolvers<void>();
  await page.route("**/api/v1/workspaces/*", async (route) => {
    if (route.request().method() === "PATCH") await pending.promise;
    await route.continue();
  });
  await save.click();
  try {
    await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  } finally {
    pending.resolve();
  }
  await expect(page.getByText("Workspace settings saved.")).toBeVisible();
  await page.unroute("**/api/v1/workspaces/*");
  await page.reload();
  await expect(zone).toHaveValue("Asia/Jakarta");
  await expect(
    page.getByLabel("Allow members to create projects"),
  ).toBeChecked();
  for (const width of [1360, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await snapshot(page, info, "settings-" + width);
  }
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectControlContrast(
      zone,
      page.locator(".ws-form"),
      "borderTopColor",
    );
    await expectControlContrast(zone, page.locator(".ws-form"), "outlineColor");
  }
  await snapshot(page, info, "settings-dark-320");
  await page.emulateMedia({ colorScheme: "light" });
  await page
    .getByRole("button", { name: "Archive workspace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Keep workspace" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Archive workspace", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Confirm archive" }).click();
  await expect(page.getByText("Workspace archived.")).toBeVisible();
  await expect(page.locator(".ws-list a")).toHaveCount(1);
  await page.goto("/w/" + slug + "/settings");
  await expect(
    page.getByRole("heading", { name: "Workspace unavailable" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to workspaces" }).click();
  await page.locator(".ws-list a").click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(zone).toHaveValue("UTC");
  await expect(
    page.getByLabel("Allow members to create projects"),
  ).not.toBeChecked();
});

test("a second account cannot open a workspace URL from the owner's session", async ({
  page,
  browser,
}) => {
  test.slow();
  await register(page);
  const slug = "private-" + randomUUID().slice(0, 8);
  await page.getByRole("link", { name: "Create workspace" }).click();
  await page.getByLabel("Workspace name").fill("Restricted team");
  await page.getByLabel("Workspace address").fill(slug);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Restricted team" }),
  ).toBeVisible();
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const outsider = await context.newPage();
    await register(outsider);
    await outsider.goto("/w/" + slug + "/settings");
    await expect(
      outsider.getByRole("heading", { name: "Workspace unavailable" }),
    ).toBeVisible();
    await expect(outsider.getByText("Restricted team")).toHaveCount(0);
    await expect(
      outsider.getByRole("button", { name: "Save changes" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
