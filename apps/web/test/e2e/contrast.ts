import { expect, type Locator } from "@playwright/test";

function luminance(rgb: string) {
  const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgb);
  if (!channels) throw new Error(`Expected an opaque RGB color, got ${rgb}`);
  const [red, green, blue] = channels.slice(1).map((channel) => {
    const value = Number(channel) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export async function expectControlContrast(
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
