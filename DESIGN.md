---
name: "TaskFlow"
description: "Cove workspace and public authentication interfaces."
colors:
  auth-canvas: "#f7f8f4"
  auth-panel: "#ffffff"
  auth-ink: "#182b27"
  auth-muted: "#566761"
  auth-line: "#dbe2db"
  auth-control-border: "#7a8a80"
  auth-focus: "#a56512"
  auth-focus-on-dark: "#ffe3a8"
  auth-accent: "#125942"
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
  auth-dark-canvas: "#12221d"
  auth-dark-panel: "#1a2b24"
  auth-dark-ink: "#edf3ea"
  auth-dark-muted: "#bcc9bf"
  auth-dark-line: "#3e5145"
  auth-dark-accent: "#246747"
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
  auth-art: "#183f36"
  auth-art-text: "#f4f9eb"
  auth-brand-fill: "#c8ecaf"
  auth-brand-ink: "#193b31"
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
  auth-headline:
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
  auth-brand: "11px"
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
  auth-submit:
    backgroundColor: "{colors.auth-accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "12px 19px"
  account-link:
    backgroundColor: "{colors.cove-accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  text-input:
    backgroundColor: "{colors.auth-panel}"
    textColor: "{colors.auth-ink}"
    rounded: "{rounded.control}"
    padding: "12px"
    height: "48px"
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

A project manager or contributor opening TaskFlow can locate the current page, identify the signed-in account and read its details in one column. A pale lavender rail anchors the workspace. The same hue recurs in the identity strip and the action that opens Account.

Sign-in and registration use a forest-green landscape beside a short form. Across both surfaces, the TaskFlow wordmark, DM Sans typography and visible field labels keep the transition familiar.

- A stable navigation rail on desktop and a labeled navigation dialog on phones.
- One tinted identity strip above a bordered list of account details.
- Visible text for session status and field errors.

## Colors

Cove uses violet for primary actions and the initials tile. The current navigation link has a lavender fill, darker ink and a heavier label. Porcelain, white and a fine cool-gray divider separate the canvas, toolbar and profile rows. A small green dot accompanies the written session status.

Public forms use forest green for submission, sage for the brand mark and neutral ink for help text. Invalid controls acquire a contrasting border and a written error. The user's dark color scheme activates separate graphite-violet and deep-green palettes. Dark public forms use the pale amber focus color.

**The Surface Palette Rule.** Resolve text, focus and action colors against the palette of the enclosing surface, including the portaled mobile drawer.

## Typography

DM Sans Variable is self-hosted with a sans-serif fallback. Page titles are the largest text. The signed-in name ranks above the profile heading, and their shared weight ties them together. The name and heading reduce in size on mobile. Read-only values sit beside quieter labels and icons. Sentence case carries through the navigation, buttons, form hints and status text.

## Layout

| Surface              | Desktop                                                                                                                                                                       | Mobile                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Protected navigation | A 230px sticky rail contains the brand, Overview, Account and the personal account footer. The toolbar starts at 64px and holds the breadcrumb and sign-out.                  | At 740px and below a menu button opens the drawer. The toolbar starts at 60px and can wrap when text is enlarged. Menu and sign-out each have at least a 44px touch target.    |
| Overview and Account | The centered work area has a maximum width of 1180px. A 30px gap follows the page title. The identity strip is at least 152px high and the profile card starts 32px below it. | Content has 16px side gutters. The identity strip starts at 124px and the space above the profile card falls to 20px. The decorative wave drops out to make room for the name. |
| Profile rows         | Labels use 36% of the row with a 110px minimum. Values can wrap. Each row is at least 62px high.                                                                              | Rows are at least 70px high. At 420px and below each value moves under its label, aligned with the label text past its icon.                                                   |
| Public forms         | The artwork and form use two columns. The form caps at 390px. Labels sit 7px above the inputs and fields have 21px of space below.                                            | At 740px and below, the brand moves above the heading and the form occupies a single column with 24px side padding.                                                            |

## Elevation & Depth

The toolbar and profile card use a one-pixel divider or border. These surfaces remain flat. Opening the navigation drawer places a translucent ink scrim over the page. The drawer sits above it and scrolls independently. Selection, hover and focus take effect immediately.

## Shapes

The brand keeps its layered icon and wordmark on both surfaces. The public mark uses a 35px sage tile. Inside the workspace it becomes a 32px violet tile. The identity strip and account panel share 14px corners. The account holder's initials appear in a rounded square in the strip and a smaller circle in the rail footer.

## Components

- **Navigation.** Use links for Overview and Account. Set `aria-current="page"` on the active route. Hover fills the target. The mobile dialog presents the same destinations, contains keyboard focus and returns focus to its opener on Escape. A skip link targets the main region.
- **Identity strip.** Pair the account holder's name with “Signed in to TaskFlow.” Keep space for the name to wrap. The fine violet wave sits at the far edge on desktop and carries no information.
- **Profile card.** Render full name, email address and time zone as a definition list with a rule above each row. Overview places the View account link beside the section heading. The heading and action can wrap onto separate lines. Account labels this section “Profile details.”
- **Actions.** Use the shared Button for form submission and for the styled account link. The public submit fills the form width. Both primary actions have at least 44px height and brighten on hover. The toolbar keeps sign-out as a button. Pending actions show their busy label.
- **Fields and recovery.** Inputs have a 48px height and a visible label. Password fields reserve 48px for the show/hide control. Associate help and error text with its field. A lost session explains the return to sign-in and focuses email. A failed profile load offers retry and a route back to sign-in.
- **Keyboard focus.** Controls use a three-pixel solid outline with four pixels of offset. Select the focus color for the surface and color scheme. Keep space for the ring around drawer links and toolbar actions.

## Do's and Don'ts

- Do keep visible labels paired with values when account rows stack.
- Do preserve the current-page indication, skip link and drawer focus return.
- Do let long names and email addresses wrap in the main content.

- Don't rely on color alone to identify a field error or the current page.
- Don't add project or task metrics to the personal account overview without a corresponding product feature.
