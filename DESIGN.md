---
name: TaskFlow
description: The M0 web interface for authentication, personal navigation and account details.
colors:
  canvas: "#f7f8f4"
  panel: "#ffffff"
  ink: "#182b27"
  muted: "#566761"
  line: "#dbe2db"
  accent: "#125942"
  dark-canvas: "#12221d"
  dark-panel: "#1a2b24"
  dark-ink: "#edf3ea"
  dark-muted: "#bcc9bf"
  dark-line: "#3e5145"
  dark-accent: "#246747"
  rail: "#142f29"
  nav-selected: "#2d4d40"
  nav-text: "#d1e0d4"
  welcome: "#183f36"
  hero-link: "#e4f1cf"
  hero-ink: "#203d2c"
  control-border: "#7a8a80"
  focus: "#a56512"
  focus-on-dark: "#ffe3a8"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(38px, 4.4vw, 64px)"
    fontWeight: 400
    lineHeight: 0.99
    letterSpacing: "-0.7px"
  headline:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "clamp(32px, 4vw, 42px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-1.8px"
  title:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.6px"
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 600
rounded:
  nav: "8px"
  control: "9px"
  brand: "11px"
  card: "15px"
  welcome: "16px"
spacing:
  label-gap: "7px"
  input-inset: "12px"
  detail-gap: "16px"
  field-gap: "21px"
  card-gap: "22px"
  section-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.panel}"
    rounded: "{rounded.control}"
    padding: "12px 19px"
  welcome-link:
    backgroundColor: "{colors.hero-link}"
    textColor: "{colors.hero-ink}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  text-input:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "{spacing.input-inset}"
  nav-current:
    backgroundColor: "{colors.nav-selected}"
    textColor: "{colors.panel}"
    rounded: "{rounded.nav}"
    padding: "11px 14px"
  profile-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.card}"
    padding: "24px clamp(20px, 3vw, 32px)"
---

# Design System: TaskFlow

## Overview

TaskFlow is an editorial workspace. On the personal dashboard, a large serif greeting gives the user's name prominence, while the deep green rail locates the current page. The account details below use plain labels, aligned values and thin dividers. The sign-in and registration screens use the same green landscape beside a single column of fields. The decorative lines carry no information.

This baseline covers the M0 web app. The CSS owns the theme and dimensions. The frontmatter records its light-theme defaults and dark overrides; the spacing and radius names describe observed uses. The [stylesheet](apps/web/src/app/globals.css), [auth form](apps/web/src/features/auth/auth-form.tsx), [protected shell](apps/web/src/features/shell/protected-shell.tsx) and [review screenshots](docs/review/issue-7) show the implementation.

## Colors

| CSS role       | Light     | Dark      | Where it appears                                    |
| -------------- | --------- | --------- | --------------------------------------------------- |
| Canvas         | `#f7f8f4` | `#12221d` | Page behind dashboard sections                      |
| Panel          | `#ffffff` | `#1a2b24` | Auth form surface, inputs, top bar and account card |
| Ink            | `#182b27` | `#edf3ea` | Headings and values                                 |
| Muted          | `#566761` | `#bcc9bf` | Instructions, field hints, labels and breadcrumbs   |
| Line           | `#dbe2db` | `#3e5145` | Surface borders and row dividers                    |
| Control border | `#7a8a80` | `#7a8a80` | Editable field boundaries                           |
| Focus          | `#a56512` | `#ffe3a8` | Keyboard focus on the surrounding surface           |
| Accent         | `#125942` | `#246747` | Primary button behind white text                    |

The OS color preference selects the theme. The rail changes from `#142f29` to `#0e211b`. The welcome panel keeps its `#183f36` background and `#f4f9eb` text, with the user's name in `#dcefbc`. Keyboard focus uses a 3px outline with a 4px offset. Use the pale amber focus token on the dark rail, drawer and welcome panel in either theme. Field boundaries and focus indicators need at least 3:1 contrast against their adjacent surface.

Invalid inputs use a `#c45145` border and an associated text error. Error text uses `#9a2e21` in light mode and `#ffb9aa` in dark mode. Form-level notices use `#fff1eb` behind the light error text and `#59392e` behind `#ffe1d7` in dark mode.

## Typography

DM Sans Variable carries page headings, navigation, forms and data. Body copy is 15px with a 1.5 line height. Page headings scale from 32px to 42px. Card titles are 20px at weight 600, field labels 14px at 600, and field hints and errors 13px. Navigation group labels are 11px uppercase at 650 with 1.7px tracking.

Instrument Serif appears in the welcome greeting at 38–64px with a 0.99 line height. Only the user's name takes the italic face. Both font families ship with the frontend and have system fallbacks.

## Layout

| Surface         | Desktop                                                                                                                                                 | At 740px and below                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication  | Full-height grid with `minmax(280px, 0.85fr) 1.15fr`. The form caps at 390px and its parent has 40px vertical and 28px horizontal padding.              | A single panel with the brand above the form, 32px vertical and 24px horizontal padding. The illustration is hidden.                                       |
| App shell       | Sticky 238px sidebar, flexible content and a 70px top bar.                                                                                              | A 60px bar contains a 42px menu trigger. The dialog drawer is `min(82vw, 300px)` wide.                                                                     |
| Dashboard       | Centered, 1150px maximum including gutters. Top padding is 39px; horizontal padding scales from 20px to 72px. The welcome panel is at least 240px tall. | Top padding drops to 26px and the welcome panel to a 214px minimum.                                                                                        |
| Account details | Two columns, `minmax(120px, 0.65fr) 1fr`, with a 16px gap.                                                                                              | The first column shrinks to `minmax(94px, 0.68fr)` and the gap to 8px. At 420px and below, each value sits below its label with a 3px gap and 27px indent. |

Use the spacing of the enclosing component. In auth forms, leave 7px between label and input and 21px after each field. The dashboard leaves 24px after the page heading and 22px before the account card. Detail rows have 13px of vertical padding. Long account values and greeting names wrap.

## Elevation & Depth

Panel fills and one-pixel borders distinguish the card and top bar. Resting surfaces have no drop shadow. The selected navigation link uses an inset 3px pale green stripe. On mobile the translucent `#071b15aa` scrim sits at z-index 7 and the navigation dialog at 8. Current component states change without authored animation.

## Shapes

Controls and icon tiles have 9px corners. Navigation items and error notices have 8px corners. The account card uses 15px and the welcome panel 16px. The brand pairs a 35px pale green tile with 11px corners and a layered icon with a 24px wordmark. The 37px circular avatar holds the user's initial. See the [brand component](apps/web/src/components/brand.tsx).

## Components

- **Primary action.** Use the shared [Button](apps/web/src/components/ui/button.tsx) for actions. It defaults to `type="button"`; auth forms explicitly use submit. The primary style has a 44px minimum height and fills the auth form width. Hover brightens it by 10%. Disabled buttons use 70% opacity and a wait cursor. The welcome panel uses `Button asChild` around the account link, with a pale green fill, dark text and an arrow.
- **Form controls.** Inputs are 48px tall with 12px padding and a one-pixel border. Keep visible labels, appropriate autocomplete and associated hint/error IDs. Password fields reserve 48px on the right for the 46 × 48px reveal button. Preserve its accessible name and pressed state. Announce submission errors and keep the user's entered values available for correction.
- **Navigation.** Overview and Account share a Personal group. The current link uses `aria-current="page"`, a heavier weight, a `#2d4d40` fill and a `#c6e8a9` inset stripe. Hover uses `#28483c`. The account identity sits at the foot of the rail; sign-out is in the top bar. The mobile Radix dialog gives these same links a named, focus-contained surface with a close control and Escape dismissal.
- **Account data.** Use a heading, icon tile and definition list for read-only name, email and time zone. Put the muted label before the value in reading order. Separate rows with thin rules inside one card. The overview link opens the account view.
- **Keyboard access.** The shell's first skip link becomes visible on focus and targets the focusable main region. Keep the focus ring visible on controls, maintain source order across breakpoints, and return focus to the menu trigger when dismissing the drawer with Escape.

## Do's and Don'ts

- Do use the paired foreground and surface roles in both color schemes.
- Do keep route links navigable as anchors and use buttons for actions such as sign-out.
- Do test the drawer with a keyboard and the account card with a long email at 420px.
- Don't use the welcome display face for fields or tabular information.
- Don't convey a field error or the selected navigation item through color alone.
- Don't populate the personal overview with placeholder projects or task counts.
