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
async function createAccount(page: Page, name = "Avery Lane") {
  const email = "avery." + randomUUID() + "@example.invalid";
  const password = randomUUID();
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
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
  await expect(
    page.getByText("Sign in to your TaskFlow account."),
  ).toBeVisible();
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
  for (const tab of [page, second]) {
    await expect(
      tab.getByText("Sign in to your TaskFlow account."),
    ).toBeVisible();
    await expect(tab.getByLabel("Email address")).toHaveAccessibleDescription(
      "",
    );
  }
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
test("a lost session explains why sign-in is needed and returns to the dashboard", async ({
  page,
  context,
}, info) => {
  const { email, password } = await createAccount(page);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await context.clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);

  const explanation = "Your session has ended. Sign in again to continue.";
  const emailField = page.getByLabel("Email address");
  await expect(page.getByText(explanation)).toBeVisible();
  await expect(emailField).toBeFocused();
  await expect(emailField).toHaveAccessibleDescription(explanation);
  await screenshot(page, info, "session-ended");
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByText(explanation)).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await screenshot(page, info, "session-ended-mobile");
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});
test.describe("mobile header", () => {
  test.use({ hasTouch: true });

  for (const width of [320, 390]) {
    test(`navigation and sign-out at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await createAccount(page);
      const header = page.getByRole("banner");
      const menu = header.getByRole("button", { name: "Open navigation" });
      const signOut = header.getByRole("button", { name: "Sign out" });
      const drawer = page.getByRole("dialog", { name: "Navigation" });

      for (const view of ["Overview", "Account"]) {
        await expect(
          page.getByRole("heading", { name: view, exact: true }),
        ).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => true));
        const crumb = header.locator(".crumb");
        await expect(header).toHaveCSS("height", "60px");
        await expect(menu.locator("svg")).toHaveCSS("width", "21px");
        await expect(signOut.locator("svg")).toHaveCSS("width", "16px");
        const [left, middle, right] = await Promise.all([
          menu.boundingBox(),
          crumb.boundingBox(),
          signOut.boundingBox(),
        ]);
        if (!left || !middle || !right)
          throw new Error("Header controls must be visible");
        await info.attach(view + "-geometry", {
          body: JSON.stringify({
            viewport: width,
            menu: left,
            breadcrumb: middle,
            signOut: right,
          }),
          contentType: "application/json",
        });
        for (const box of [left, right]) {
          expect
            .soft(box.width, view + " target width")
            .toBeGreaterThanOrEqual(44);
          expect
            .soft(box.height, view + " target height")
            .toBeGreaterThanOrEqual(44);
          expect(box.y).toBeLessThanOrEqual(middle.y);
          expect(box.y + box.height).toBeGreaterThanOrEqual(
            middle.y + middle.height,
          );
        }
        expect(left.x).toBeGreaterThanOrEqual(0);
        expect(left.x + left.width).toBeLessThan(middle.x);
        expect(middle.x + middle.width).toBeLessThan(right.x);
        expect(right.x + right.width).toBeLessThanOrEqual(width);

        await menu.tap({ position: { x: 1, y: 1 } });
        await expect(drawer).toBeVisible();
        await page.keyboard.press("Shift+Tab");
        await expect
          .poll(() =>
            drawer.evaluate((el) => el.contains(document.activeElement)),
          )
          .toBe(true);
        await page.keyboard.press("Escape");
        await expect(menu).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(signOut).toBeFocused();
        await header.screenshot({
          path: info.outputPath(view + "-header.png"),
        });
        await page.keyboard.press("Shift+Tab");
        await expect(menu).toBeFocused();
        if (view === "Overview") {
          await screenshot(page, info, "mobile-overview");
          await page.keyboard.press("Enter");
          await drawer
            .getByRole("link", { name: "Account", exact: true })
            .tap();
        }
      }
      await signOut.tap({ position: { x: 1, y: 1 } });
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

test("the profile card stays in place when the dashboard font arrives", async ({
  page,
  browser,
}) => {
  const name = "Amelia Noor van der Linden";
  await createAccount(page, name);
  const cold = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 1360, height: 880 },
  });
  const { promise: holdFonts, resolve: releaseFonts } =
    Promise.withResolvers<void>();
  try {
    const overview = await cold.newPage();
    await overview.route("**/dm-sans-*.woff2", async (route) => {
      await holdFonts;
      await route.continue();
    });
    await overview.goto(page.url(), { waitUntil: "domcontentloaded" });
    await expect(
      overview.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    const face = '600 30px "DM Sans Variable"';
    expect(
      await overview.evaluate((font) => document.fonts.check(font), face),
    ).toBe(false);
    const card = overview.locator(".profile-card");
    const top = await card.evaluate((el) => el.getBoundingClientRect().top);

    releaseFonts();
    await overview.evaluate(() => document.fonts.ready.then(() => true));
    expect(
      await overview.evaluate((font) => document.fonts.check(font), face),
    ).toBe(true);
    const finalTop = await card.evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    // Allow small font metric differences while catching the original 59px jump.
    expect(Math.abs(finalTop - top)).toBeLessThanOrEqual(4);
  } finally {
    releaseFonts();
    await cold.close();
  }
});

async function doubleText(container: Locator) {
  await container.evaluate((root) => {
    // Read the original sizes first so inherited text is enlarged exactly once.
    const elements = [root, ...root.querySelectorAll("*")].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    const sizes = elements.map((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    elements.forEach((el, i) => {
      el.style.fontSize = sizes[i] * 2 + "px";
    });
  });
}

test("dashboard controls and account details reflow with enlarged text", async ({
  page,
}) => {
  const name = "Amelia Noor van der Linden";
  const { email } = await createAccount(page, name);
  for (const route of ["/app", "/app/account"]) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 568 });
      await page.goto(route);
      await expect(page.getByText(email, { exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => true));
      for (const scale of [1, 2]) {
        if (scale === 2) await doubleText(page.locator("body"));
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await expect(
          page.getByRole("button", { name: "Sign out" }),
        ).toBeInViewport({ ratio: 1 });
        for (const value of [name, email]) {
          const detail = page.locator("dd").filter({ hasText: value });
          await expect(detail).toHaveText(value);
          expect(
            await detail.evaluate(
              (el) =>
                el.scrollWidth <= el.clientWidth &&
                el.scrollHeight <= el.clientHeight,
            ),
          ).toBe(true);
        }
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/app/account");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await doubleText(page.locator("body"));
  const brandBox = await drawer.locator(".brand").boundingBox();
  const close = drawer.getByRole("button", { name: "Close navigation" });
  const closeBox = await close.boundingBox();
  if (!brandBox || !closeBox) throw new Error("Drawer header is not visible");
  expect(
    brandBox.x + brandBox.width <= closeBox.x ||
      brandBox.y + brandBox.height <= closeBox.y,
  ).toBe(true);
  await close.press("Escape");
  await expect(trigger).toBeFocused();
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
  }, info) => {
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
    await screenshot(page, info, "overview-" + colorScheme);
    const accountLink = page.getByRole("link", { name: "View account" });
    await accountLink.click();
    await expect(
      page.getByRole("heading", { name: "Profile details" }),
    ).toBeVisible();
    await screenshot(page, info, "account-" + colorScheme);
    await page.getByRole("link", { name: "Overview" }).click();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expectControlContrast(
      page.locator(".sidebar a").first(),
      page.locator(".sidebar"),
      "outlineColor",
    );
    await expectControlContrast(
      page.getByRole("link", { name: "View account" }),
      page.locator(".profile-card"),
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
