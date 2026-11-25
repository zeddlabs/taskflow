import { expect, test, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { expectControlContrast } from "./contrast";

async function register(page: Page, name: string, email: string) {
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: "Create account" }).click();
}
async function mail(email: string, invitation = false) {
  const filename = join(
    process.env.TASKFLOW_TEST_MAILBOX!,
    (invitation ? "invite-" : "") +
      createHash("sha256").update(email).digest("hex"),
  );
  await expect
    .poll(async () =>
      readFile(filename, "utf8").then(
        () => true,
        () => false,
      ),
    )
    .toBe(true);
  const text = await readFile(filename, "utf8");
  await unlink(filename);
  return text;
}
function token(message: string) {
  const value = /Invitation token: ([A-Za-z0-9_-]{43})/.exec(message)?.[1];
  if (!value) throw new Error("Expected a token in the test mailbox");
  return value;
}

test("two users verify, join, manage roles, transfer ownership and lose stale access", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const nonce = randomUUID().slice(0, 8);
  const recipient = "riley." + nonce + "@example.invalid";
  await page.goto("/register");
  await register(page, "Morgan Ellis", "morgan." + nonce + "@example.invalid");
  await page.getByRole("link", { name: "Create workspace" }).click();
  await page.getByLabel("Workspace name").fill("Northline Studio");
  await page.getByLabel("Workspace address").fill("northline-" + nonce);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("link", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/members$/);
  const membersUrl = page.url();
  const invite = async (email: string) => {
    await page.getByRole("button", { name: "Invite member" }).click();
    const field = page.getByLabel("Email address");
    await expect(field).toBeFocused();
    await field.fill(email);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(
      page.getByText("Invitation sent to " + email + "."),
    ).toBeVisible();
  };
  await invite(recipient);
  const first = await mail(recipient, true);
  const invitationLink =
    /https?:\/\/[^\s]+\/app\/account\?join=1#join-workspace/.exec(first)?.[0];
  if (!invitationLink) throw new Error("Missing acceptance link");
  await page
    .getByRole("button", { name: "Resend invitation to " + recipient })
    .click();
  await expect(
    page.getByText("New invitation sent to " + recipient + "."),
  ).toBeVisible();
  const renewed = await mail(recipient, true);
  const second = await browser.newContext({
    baseURL: new URL(membersUrl).origin,
  });
  try {
    const user = await second.newPage();
    await user.goto(invitationLink);
    await expect(user).toHaveURL(/\/login\?join=1$/);
    await user.getByRole("link", { name: "Create an account" }).click();
    await register(user, "Riley Chen", recipient);
    await expect(user).toHaveURL(/\/app\/account\?join=1#join-workspace$/);
    await expect(user.getByLabel("Invitation token")).toHaveCount(0);
    await user.getByRole("button", { name: "Send verification code" }).click();
    await user
      .getByLabel("Verification code")
      .fill((await mail(recipient)).trim());
    await user.getByRole("button", { name: "Verify email" }).click();
    await user.getByLabel("Invitation token").fill(token(first));
    await user.getByRole("button", { name: "Join workspace" }).click();
    await expect(
      user.getByRole("region", { name: "Join a workspace" }).getByRole("alert"),
    ).toContainText("no longer valid");
    await user.getByLabel("Invitation token").fill(token(renewed));
    await user.getByRole("button", { name: "Join workspace" }).click();
    await expect(
      user.getByRole("heading", { name: "Northline Studio" }),
    ).toBeVisible();
    await user.goto(membersUrl);
    await expect(user.getByText("Morgan Ellis", { exact: true })).toBeVisible();
    await expect(
      user.getByRole("button", { name: "Invite member" }),
    ).toHaveCount(0);
    await expect(
      user.getByRole("heading", { name: "Pending invitations" }),
    ).toHaveCount(0);
    await page.reload();
    const manage = page.getByRole("button", {
      name: "Manage Riley Chen",
      exact: true,
    });
    await manage.click();
    await page.getByLabel("Workspace role").selectOption("GUEST");
    await page.getByRole("button", { name: "Save role" }).click();
    await expect(page.getByText("Role updated for Riley Chen.")).toBeVisible();
    await user.reload();
    await expect(user.getByRole("main").getByRole("alert")).toContainText(
      "guest role",
    );
    await manage.click();
    await page.getByLabel("Workspace role").selectOption("MEMBER");
    await page.getByRole("button", { name: "Save role" }).click();
    await expect(manage).toBeVisible();
    const pending = "casey." + nonce + "@example.invalid";
    await invite(pending);
    await page.getByRole("button", { name: "Invite member" }).click();
    for (const width of [1360, 768, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const path = info.outputPath("members-" + width + ".png");
      await page.screenshot({ path, fullPage: true });
      await info.attach("Members " + width, { path, contentType: "image/png" });
    }
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectControlContrast(
        page.getByLabel("Email address"),
        page.locator(".team-invite"),
        "borderTopColor",
      );
      await expectControlContrast(
        page.getByLabel("Email address"),
        page.locator(".team-invite"),
        "outlineColor",
      );
    }
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Invite member" }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Revoke invitation to " + pending })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Confirm revocation" }).click();
    await expect(
      page.getByText("There are no pending invitations."),
    ).toBeVisible();
    await manage.click();
    await page
      .getByRole("button", { name: "Transfer ownership", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Confirm transfer" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Ownership transferred to Riley Chen."),
    ).toBeVisible();
    await expect(manage).toHaveCount(0);
    await user.reload();
    await user.getByRole("button", { name: "Manage Morgan Ellis" }).click();
    await user.getByRole("button", { name: "Remove member" }).click();
    await user.getByRole("button", { name: "Confirm removal" }).click();
    await expect(user.getByText("Morgan Ellis was removed.")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Workspace unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Invite member" }),
    ).toHaveCount(0);
  } finally {
    await second.close();
  }
});
