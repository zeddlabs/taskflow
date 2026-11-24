---
name: "TaskFlow"
description: "Cove sign-in, registration and personal workspace."
colors:
  control-border: "#888298"
  dark-control-border: "#aaa2bb"
  cove-ink: "#29273b"
  cove-canvas: "#f9f9fc"
  cove-panel: "#fff"
  cove-line: "#dbd9e5"
  cove-muted: "#585567"
  cove-accent: "#51468b"
  cove-focus: "#5744a5"
  cove-rail: "#eeedf6"
  cove-selected: "#dcd9ef"
  cove-selected-ink: "#493d80"
  cove-identity: "#e8e4f6"
  cove-wave: "#a59bcf"
  cove-session: "#33705c"
  cove-dark-canvas: "#1b1925"
  cove-dark-panel: "#252231"
  cove-dark-ink: "#f5f2fb"
  cove-dark-muted: "#c6c1d4"
  cove-dark-line: "#4b4659"
  cove-dark-accent: "#6557a4"
  cove-dark-focus: "#d3c5ff"
  cove-dark-rail: "#211e2d"
  cove-dark-selected: "#403752"
  cove-dark-selected-ink: "#e6deff"
  cove-dark-identity: "#373044"
  cove-dark-wave: "#6e6186"
  cove-dark-session: "#92d4b3"
  field-invalid: "#c45145"
  error-text: "#9a2e21"
  error-fill: "#fff1eb"
  dark-error-text: "#ffb9aa"
  dark-alert-text: "#ffe1d7"
  dark-error-fill: "#59392e"
  drawer-scrim: "#201e32aa"
  on-accent: "#ffffff"
typography:
  headline:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "clamp(34px, 3.1vw, 48px)"
    fontWeight: 620
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  form-title:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "clamp(28px, 4vw, 36px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  gate-title:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "clamp(32px, 4vw, 42px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-1.8px"
  identity-name:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "30px"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  identity-name-mobile:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "24px"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  title:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "21px"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-0.026em"
  title-mobile:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "18px"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-0.026em"
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  value:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 520
  label:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  supporting:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  caption:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  wordmark:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "24px"
    fontWeight: 690
    letterSpacing: "-1.3px"
rounded:
  utility: "7px"
  navigation: "8px"
  control: "9px"
  mobile-initials: "13px"
  panel: "14px"
  initials: "18px"
  circle: "50%"
spacing:
  paired: "8px"
  inline: "12px"
  gutter: "16px"
  group: "20px"
  section: "32px"
components:
  auth-panel:
    backgroundColor: "{colors.cove-panel}"
    textColor: "{colors.cove-ink}"
    rounded: "{rounded.panel}"
  auth-submit:
    backgroundColor: "{colors.cove-accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "12px 19px"
  account-link:
    backgroundColor: "{colors.cove-accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  text-input:
    backgroundColor: "{colors.cove-panel}"
    textColor: "{colors.cove-ink}"
    rounded: "{rounded.control}"
    padding: "12px"
  nav-current:
    backgroundColor: "{colors.cove-selected}"
    textColor: "{colors.cove-selected-ink}"
    rounded: "{rounded.navigation}"
    padding: "8px 14px"
  identity-strip:
    backgroundColor: "{colors.cove-identity}"
    textColor: "{colors.cove-ink}"
    rounded: "{rounded.panel}"
    padding: "30px 36px"
  profile-card:
    backgroundColor: "{colors.cove-panel}"
    textColor: "{colors.cove-ink}"
    rounded: "{rounded.panel}"
    padding: "12px 30px"
---

# Design System: TaskFlow

## Overview

**Creative North Star: "Cove"**

The same violet wordmark greets people at sign-in and in the workspace. A centered form gives returning users a direct route to their account. Registration adds the name field and password guidance within the same layout.

In the workspace, the route title orients the reader before the name, signed-in status and account details. The lavender wave appears beside the brand on public forms and beside the account identity on the desktop dashboard.

**Key characteristics**

- One reading column for the form, its validation messages and the link to the other route.
- A fixed position for the current destination in desktop navigation and a keyboard-accessible drawer on phones.
- Plain-language status, field labels and account values in both color schemes.

## Colors

Porcelain provides the canvas, white holds the content and cool-gray lines divide rows and panel edges. Violet fills primary actions, the logo tile and the account initials. Lavender marks the navigation rail and the area behind the wave. The active route combines a stronger tint with darker text and a heavier label.

The dark scheme pairs a graphite-violet canvas with lighter panel surfaces, pale text and a lavender focus ring. Input borders have separate light and dark values. A green dot accompanies the written session status. Errors use red text or a tinted notice and a message describing the problem.

**The Surface Palette Rule.** Resolve the palette on the page shell and on the mobile drawer, which renders outside that shell. The authentication page, protected shell, drawer and session gate all apply scoped Cove colors over the generic document defaults.

## Typography

TaskFlow self-hosts DM Sans Variable. Body text uses 15px type with a 1.5 line height. The public form title scales from 28px to 36px. Workspace page titles scale from 34px to 48px. Both have tight tracking and a heavier weight than the supporting sentence below a form title.

The profile name uses 30px on desktop and 24px on phones. Field labels use 14px semibold, hints and validation messages use 13px, and account values use 15px medium. Keep visible labels even when a field is empty.

## Layout

- **Public forms.** Sign-in and registration center a single panel up to 480px wide. Outer gutters scale from 12px to 32px. The masthead and form share an inset ranging from 20px to 38px. The 84px minimum masthead leaves room for the brand and wave. The form starts 28px below it. The alternate-route link follows the primary action, separated by a divider and 16px of padding.
- **Field rhythm.** Place labels 7px above their controls. Leave 6px before a hint or field error and 18px between field groups. The form grows vertically when validation messages appear or text is enlarged.
- **Workspace.** A sticky 230px left rail frames the desktop work area. The toolbar starts at 64px. The centered main column caps at 1180px. The identity strip is at least 152px high, followed by 32px of space before the profile details.
- **Small screens.** At 740px and below the workspace switches to a drawer and a toolbar that starts at 60px and can wrap. The identity strip shrinks to a 124px minimum and drops its wave. At 420px and below, profile values stack under their labels. Public forms keep their single column and fluid gutters across widths.

## Elevation & Depth

Panels and toolbars use a one-pixel edge. The lavender masthead and identity strip distinguish related content by tone. A translucent ink scrim separates the open drawer from the page. The drawer scrolls independently so its close control and destinations remain reachable.

## Shapes

The layered TaskFlow mark sits in a 32px violet tile with 9px corners on public and protected pages. Panels use 14px corners. The masthead clips its wave to the panel’s upper corners. Inputs and primary buttons use 9px corners. Workspace initials use a rounded square in the identity strip and a circle in the rail footer.

## Components

- **Authentication panel.** Place the brand first, followed by a single page heading, the introduction, labeled inputs, one submit action and the link to the other public route. Registration shows the 15-character password hint. Connect hints, errors and the expired-session explanation to their corresponding input.
- **Controls.** Inputs span the form and have a 48px minimum height. Password inputs reserve 48px on the right for the show/hide button. Its accessible name and pressed state follow password visibility. The submit button spans the form and shows a pending label while disabled. Primary buttons brighten on hover.
- **Feedback.** Identify invalid inputs with a border and a written error. Put request-level errors above the submit button. After session expiry, focus the email input and explain why another sign-in is needed. A failed protected profile request offers retry and a link to sign in.
- **Navigation.** Mark the active Overview or Account link with `aria-current="page"`. The mobile menu and sign-out controls have at least 44px touch targets. The drawer handles Escape and restores focus. The skip link leads directly to the main workspace region.
- **Profile.** Pair the account name with the signed-in message above a definition list containing full name, email address and time zone. Overview places View account beside the section title. Long values can wrap onto additional lines.
- **Focus.** A three-pixel solid outline with four pixels of offset follows keyboard focus, using the enclosing surface’s focus color in each theme.

## Do's and Don'ts

- Do give password hints and errors space below their field.
- Do keep the navigation dialog’s focus inside the drawer and return focus to its opener when dismissed.
- Do allow account values and form messages to wrap as text grows.

- Don't let the decorative wave cover a label, control or account name.
- Don't use a color change as the only indication of an invalid field, active route or session state.
