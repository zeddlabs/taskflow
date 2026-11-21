import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}
async function createAccount(page: Page) {
  const email = "avery." + randomUUID().slice(0, 8) + "@example.invalid";
  const password = randomUUID();
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Avery Lane");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  return { email, password };
}
test("anonymous routes redirect and form errors are accessible", async ({
  page,
}, info) => {
  await page.goto("/app/account");
  await expect(page).toHaveURL(/\/login$/);
  await screenshot(page, info, "sign-in");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Email address")).toBeFocused();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter a valid email address." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("unknown@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: "Sign in" }).click();
  const formAlert = page.locator("form").getByRole("alert");
  await expect(formAlert).toHaveText("The email or password is incorrect.");
  // This origin serves the same web app but is outside the API's configured WEB_ORIGIN.
  const alternate = new URL(page.url());
  alternate.hostname = "localhost";
  await page.goto(alternate.href);
  await page.getByLabel("Email address").fill("unknown@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(formAlert).toHaveText(
    "Access denied. Reload the page and try again.",
  );
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Avery");
  await page.getByLabel("Email address").fill("avery@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByLabel("Password", { exact: true }),
  ).toHaveAccessibleDescription("Use at least 15 characters.");
});
test("registration, two-tab renewal, account navigation and logout use real sessions", async ({
  page,
  context,
}, info) => {
  const { email, password } = await createAccount(page);
  await expect(page.getByText(email)).toBeVisible();
  await screenshot(page, info, "desktop-overview");
  const second = await context.newPage();
  await second.goto("/app/account");
  await expect(second.getByText(email)).toBeVisible();
  let renewals = 0;
  context.on("request", (req) => {
    if (
      req.method() === "POST" &&
      new URL(req.url()).pathname === "/api/v1/auth/refresh"
    )
      renewals++;
  });
  await context.clearCookies({ name: "access_token" });
  await Promise.all([page.reload(), second.reload()]);
  await expect(page.getByText(email)).toBeVisible();
  await expect(second.getByText(email)).toBeVisible();
  expect(renewals).toBe(1);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(second).toHaveURL(/\/login$/);
  expect(
    (await context.cookies()).some((c) =>
      ["access_token", "refresh_token", "logout_session"].includes(c.name),
    ),
  ).toBe(false);
  await second.goto("/app/account");
  await expect(second).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(email)).toBeVisible();
});
test("mobile navigation traps focus, closes with Escape and opens the account", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(page);
  const menu = page.getByRole("button", { name: "Open navigation" });
  await screenshot(page, info, "mobile-overview");
  await menu.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      dialog.evaluate((node) => node.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await dialog.getByRole("link", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Profile details" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

function luminance(rgb: string) {
  const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgb);
  if (!channels) throw new Error(`Expected an opaque RGB color, got ${rgb}`);
  const [red, green, blue] = channels.slice(1).map((channel) => {
    const value = Number(channel) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

async function expectControlContrast(
  control: Locator,
  surface: Locator,
  property: "borderTopColor" | "outlineColor",
) {
  if (property === "outlineColor") {
    await control.focus();
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("outline-style", "solid");
    await expect(control).toHaveCSS("outline-width", "3px");
  }
  const foreground = await control.evaluate(
    (el, prop) => getComputedStyle(el)[prop],
    property,
  );
  const background = await surface.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  const a = luminance(foreground);
  const b = luminance(background);
  expect(
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    `${property}: ${foreground} on ${background}`,
  ).toBeGreaterThanOrEqual(3);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`fields and keyboard focus have sufficient contrast in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    for (const route of ["/login", "/register"]) {
      await page.goto(route);
      const panel = page.locator(".auth-content");
      const field = page.getByLabel("Email address");
      await page.keyboard.press("Tab");
      await expectControlContrast(field, panel, "borderTopColor");
      for (const control of [
        field,
        page.getByRole("button", { name: "Show password" }),
        page.locator("button[type=submit]"),
        page.locator(".auth-switch a"),
      ]) {
        await expectControlContrast(control, panel, "outlineColor");
      }
      await page.locator("button[type=submit]").click();
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expectControlContrast(field, panel, "borderTopColor");
    }

    await createAccount(page);
    await page.keyboard.press("Tab");
    await expectControlContrast(
      page.locator(".sidebar a").first(),
      page.locator(".sidebar"),
      "outlineColor",
    );
    await expectControlContrast(
      page.getByRole("link", { name: "View account" }),
      page.locator(".welcome"),
      "outlineColor",
    );
    await expectControlContrast(
      page.getByRole("button", { name: "Sign out" }),
      page.locator(".topbar"),
      "outlineColor",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.getByRole("button", { name: "Open navigation" });
    await expectControlContrast(menu, page.locator(".topbar"), "outlineColor");
    await menu.press("Enter");
    const drawer = page.getByRole("dialog");
    await expectControlContrast(
      drawer.getByRole("link", { name: "Account" }),
      drawer,
      "outlineColor",
    );
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
  });
}
