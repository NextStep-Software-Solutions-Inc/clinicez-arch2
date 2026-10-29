# E2E Test Infra: ClinicEZ Admin Panel Migration & Governance Workstation

## Test Philosophy
- Opaque-box, requirement-driven. Derives strictly from `ORIGINAL_REQUEST.md` and user specifications, not internal implementation details.
- 4-Tier Methodology:
  - **Tier 1 (Feature Coverage)**: >=5 tests per feature covering representative inputs in isolation.
  - **Tier 2 (Boundary & Corner Cases)**: >=5 tests per feature at limits, empty inputs, extreme values, error conditions.
  - **Tier 3 (Cross-Feature Combinations)**: Pairwise coverage across features sharing data/control flow (e.g. Plan limits ↔ Tenant entitlements ↔ Payment recording).
  - **Tier 4 (Real-World Application Scenarios)**: >=5 realistic end-to-end governance operations (e.g., onboarding a new tenant from lead, configuring limits, recording offline payment, archiving/purging orphaned workspaces).
- Publishes `TEST_READY.md` when the test suite is complete and runnable.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Stateless `AdminBaseUrl` Provider & Resolution | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 2 | Clean Root Path Email & DTO URLs | ORIGINAL_REQUEST §1, §3 | 5 | 5 | ✓ |
| 3 | RBAC Hardening on Newsletter Subscribers | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 4 | Clerk Authorized Parties (`*.localhost`, `*.lvh.me`) | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 5 | Docker Compose & Env Variables | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 6 | Zero Database Migrations Constraint | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 7 | Standalone `apps/admin-web` Scaffold | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 8 | Edge Security Headers & Robots | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 9 | 15-Minute Cross-Tab Idle Session Auto-Logout Guard | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 10 | Configurable Admin MFA Gate | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ |
| 11 | Headless Boot Diagnostic Screen (`VITE_CLERK_PUBLISHABLE_KEY` unset) | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 12 | Clean Root Route Tree (Zero `/admin/*` prefix) | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 13 | Cross-Surface URL Resolvers (Tenant Portal & Public Site) | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 14 | Governance Workstation Shell, Sidebar & Sticky Command Bar (`⌘K`) | ORIGINAL_REQUEST §2 | 5 | 5 | ✓ |
| 15 | Design System Strict Compliance (Teal/Slate, 0 Hex Literals) | ORIGINAL_REQUEST §2 | 5 | 5 | ✓ |
| 16 | Upgraded Overview Dashboard (KPIs, Velocity Chart 7d/14d/30d) | ORIGINAL_REQUEST §2 | 5 | 5 | ✓ |
| 17 | Tenants Directory & Detail Workstation | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 18 | Operational Dialogs (PlanEditor, RecordPayment, TenantCleanup, Entitlements) | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 19 | Plans, Leads, Blog CRM & Subscribers Directory (CSV Export) | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 20 | Roles, Admin Accounts, Self-Action Guards & Password Resets | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 21 | Platform Settings & N-Bank JSON Builder | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 22 | Invitation Acceptance & Password Reset Public Workstations | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ |
| 23 | Clean Deletion of Admin Files from `apps/portal-web` (Zero Shims) | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ |
| 24 | Shared Touchpoint Decoupling (Billing, SelfAction, Proxy, SyncAuth) | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ |
| 25 | Monorepo Scripts & CI/CD Orchestration | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ |
| 26 | Test Suite Migration & Decoupling | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ |

## Test Architecture
- Test Runner: Bun test runner (`bun test`) for frontend/monorepo tests, `dotnet test` for backend portal-api tests.
- Locations:
  - `apps/admin-web/tests/`: E2E, component, security, route, and token compliance tests.
  - `apps/portal-web/tests/`: Decoupled portal-web tests ensuring 0 admin dependencies and 0 regressions.
  - `services/portal-api/ClinicEz.Portal.Api.Tests/`: `AdminBaseUrl` and RBAC authorization tests.
- Invocation:
  - `bun run test:admin`
  - `bun run test:portal`
  - `dotnet test services/portal-api/ClinicEz.Portal.Api.Tests`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Complete Tenant Lifecycle (Lead -> Active Tenant -> Entitlements Override -> Manual Offline Payment -> Inactivity Cleanup Preflight -> Soft Archive / Purge) | F17, F18, F19, F13 | High |
| 2 | Commercial Plan Authoring & Validation (Create new Plan with 14 limits & 10 flags, async slug availability check, VAT calculation, and subscribe tenant) | F18, F19, F17 | High |
| 3 | Platform Admin Onboarding & Security Lifecycle (Invite new Admin via Link mode, Accept on public `/invitations/$token`, Self-Action Protection checks, Password Reset flow, 15m Idle Logout & MFA Gating) | F2, F9, F10, F20, F22 | High |
| 4 | Governance Workstation Operations & Restyle Verification (Command Bar `⌘K` jumps, registration velocity window switching 7d/14d/30d, N-bank JSON CRUD builder, BIR VAT config, CSV subscriber export, Theme toggle) | F14, F15, F16, F19, F21 | High |
| 5 | Clean Monorepo Isolation & Boundary Protection (Verify `apps/portal-web` has zero admin routes/files, `RESERVED_SUBDOMAINS` protects 'admin', cross-surface links point to proper domains, CI scripts pass) | F12, F13, F23, F24, F25 | High |

## Coverage Thresholds
- Tier 1: >=5 test cases per feature
- Tier 2: >=5 test cases per feature (where boundaries exist)
- Tier 3: >=26 test cases covering major feature interactions
- Tier 4: >=5 realistic end-to-end application scenarios
- Total Target: >=150 comprehensive tests across all tiers
