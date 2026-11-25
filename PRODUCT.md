# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Project managers plan work across a team, assign ownership and follow up on blockers. Team members need to find their priorities, update progress and give colleagues enough context to act. These are the two day-to-day perspectives in the [PRD personas and role model](docs/PRD.md).

Workspace owners and admins organize membership and access. Guests and clients participate in the projects to which they have been invited. Platform operators need service health and operational metadata. A person's workspace role and their access to a private project are separate decisions.

## Product Purpose

TaskFlow is a B2B project management service for teams whose plans, assignments and updates are scattered across chats and spreadsheets. Its goal is to let a manager and a contributor answer three questions from the same project record: what needs doing, who owns it, and what is blocking progress?

The PRD's activation target is for at least 80% of testers to create a workspace, a project and a first task without assistance. That is a roadmap success criterion; M0 delivers the account and session foundation.

## Positioning

A workspace represents an organization. Projects group work within it, and tasks give an assignment an owner and a status. This hierarchy lets a team share progress while keeping private projects and client participation scoped. One account may belong to multiple workspaces.

## Operating Context

| Journey             | What the user does                                                                                 | Delivery       |
| ------------------- | -------------------------------------------------------------------------------------------------- | -------------- |
| Establish a session | Register or sign in, reach Overview, reload the page, inspect personal account details, sign out.  | Shipped in M0. |
| Set up a team       | Create or join a workspace, invite colleagues, create a project and grant the right people access. | M1 roadmap.    |
| Coordinate delivery | Create a task, assign it, update its status and discuss the work in comments.                      | M2 roadmap.    |
| Review progress     | Use the board and personal views to identify pending work and blockers.                            | M3 roadmap.    |

The primary working context is a desktop browser. The same account and navigation flows must remain usable on a phone. The MVP interface is in English. Where dates are introduced, distinguish stored UTC timestamps from the user's or workspace's display time zone.

## Capabilities and Constraints

The public login and registration forms lead to a protected personal overview. Account shows name, email and time zone. Users can verify their address there with an emailed code before accepting an invitation. A restored session must identify the current user before showing protected data. Signing out clears cached account data across tabs.

Keep authentication and authorization on the backend. The browser uses the existing same-origin API integration, cookie-based session and CSRF protection. Keep session secrets out of browser storage and protected responses out of shared caches. Membership in one workspace conveys no access to another. Workspace administration alone conveys no right to read a private project's contents. The [technical design](docs/TDD.md) defines the security boundary and milestone dependencies.

## Brand Commitments

TaskFlow should feel clean, modern, efficient and trustworthy. Use the product name consistently and keep instructions concrete. For example, a sign-in failure should tell the user what they can try next while preserving account privacy. The current visual expression is recorded in [DESIGN.md](DESIGN.md).

## Evidence on Hand

The [PRD](docs/PRD.md) supplies personas, goals, permissions and acceptance criteria. The [TDD](docs/TDD.md) sets the delivery sequence, API contracts and test strategy. The [M0 review captures](docs/review/issue-7) show sign-in and the desktop and mobile dashboard. The [browser tests](apps/web/test/e2e) exercise the actual account journey. The [implementation status](docs/IMPLEMENTATION_STATUS.md) links shipped work to reviewed pull requests.

## Product Principles

- Orient people before they act. Identify the current account, location and available destination. When workspaces arrive, make the active scope equally clear.
- Put the next action beside the information needed to take it. Use the same words for a project, task, assignee and status across views.
- Represent the real state of work. Distinguish a loading account, an expired session, a failed request and an empty list. Give each a recovery action where one exists.
- Show people only the data and actions their scope permits. The API enforces access even when navigation hides an unavailable action.

## Accessibility & Inclusion

The PRD targets WCAG 2.2 AA for primary journeys. Verify them with both automated checks and manual keyboard use. Preserve visible focus, labels and errors associated with their fields, meaningful link and button names, and text cues alongside color. The mobile navigation needs a named dialog, a reachable close action, Escape dismissal and predictable focus return. Allow long names and email addresses to wrap and verify the reading order on narrow screens.
