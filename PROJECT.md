# Project: ClinicEZ Platform Administration Panel Migration & Governance Workstation Restyle

## Architecture
- Standalone SPA `@clinicez/admin-web` located in `apps/admin-web` running on Vite + React 19 + TanStack Router + Tailwind CSS v4 and `@clerk/clerk-react` (local dev port 3001, production `admin.{domain}`).
- Backend API: `services/portal-api` ASP.NET Core 9 Minimal APIs hosting 42 `/api/v1/admin/*` endpoints and 2 public password reset endpoints.
- Design System: `@clinicez/design-tokens` with strict CSS variable tokens (`lightColors` Teal `#0D6963` / `darkColors` Teal `#34C3A6` on deep Slate `#0A1020`/`#0F172A`). Zero hardcoded hex literals in TSX.
- Zero Legacy Shims: All routes use clean root paths (`/`, `/tenants`, `/plans`, `/users`, etc.). No `/admin/*` prefix in `apps/admin-web`, and all `/admin/*` files completely deleted from `apps/portal-web`.
- Zero Database Changes: Completely stateless backend configuration and URL generation updates. 0 migrations, 0 entity changes.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Stateless `AdminBaseUrl` Provider | `IFrontendUrlProvider.GetAdminBaseUrl()` resolving from `AdminBaseUrl` config, falling back to origin/domain | M1 | Survey BE |
| 2 | Clean Root Path Email & DTO URLs | Admin invitation emails, `AdminUserDto.InviteUrl`, password reset links, and pending self-invites emit `{AdminBaseUrl}/invitations/{token}` and `{AdminBaseUrl}/reset-password/{token}` | M1 | Survey BE |
| 3 | RBAC on Newsletter Subscribers | Secure `GET /api/v1/admin/newsletter-subscribers` requiring `manage:blogs` or `view:tenants` | M1 | Survey BE |
| 4 | Clerk Authorized Parties Update | Add `*.localhost` and `*.lvh.me` to `appsettings.Development.json` `Clerk:AuthorizedParties` for local port 3001 AZP validation | M1 | Survey BE |
| 5 | Docker Compose & Env Config | Forward `AdminBaseUrl` and `Cors__AllowedOrigins` in `deploy/portal-api/docker-compose.yml` and `.env.example` | M1 | Survey BE |
| 6 | Zero DB Migration Invariant | Confirm 0 database migrations, 0 entity schema changes in `services/portal-api` | M1 | Survey BE |
| 7 | Standalone `apps/admin-web` Scaffold | Vite + React 19 + TanStack Router + Tailwind CSS v4 + `@clerk/clerk-react` project structure | M2 | Survey FE |
| 8 | Edge Security Headers & Robots | Strict CSP (`frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `X-Robots-Tag`, `robots.txt Disallow: /` | M2 | Survey BE/FE |
| 9 | 15-Min Cross-Tab Idle Session Guard | Multi-tab idle tracking (`admin_last_active_at`), 60s warning countdown modal, Clerk `signOut()` on timeout | M2 | Survey BE/FE |
| 10 | Configurable Admin MFA Gate | `VITE_ADMIN_REQUIRE_MFA` gate enforcing Clerk 2FA/TOTP before workstation access | M2 | Survey BE/FE |
| 11 | Headless Boot Diagnostic Screen | `<ClerkConfigDiagnosticScreen>` rendered when `VITE_CLERK_PUBLISHABLE_KEY` is missing in CI/smoke environments | M2 | Survey FE |
| 12 | Clean Root Routing Tree | TanStack Router setup with `/`, `/tenants`, `/tenants/$slug`, `/plans`, `/leads`, `/blog`, `/subscribers`, `/roles`, `/users`, `/settings`, `/invitations/$token`, `/sign-in`, `/sign-up`, `/sync-auth`, `/reset-password/$token` | M2 | Survey FE |
| 13 | Cross-Surface Origin Resolvers | `getTenantWorkspaceUrl` and `getPublicSiteUrl` directing to `{slug}.{domain}` / `localhost:3000` | M2 | Survey FE |
| 14 | Governance Workstation Shell & Command Bar | Collapsible sidebar, sticky command bar with `⌘K` palette, environment badge (`LOCAL`/`DEV`/`PROD`), session/MFA indicator, theme toggle | M3 | Survey FE |
| 15 | Design System Strict Compliance | Token-driven styling via `@clinicez/design-tokens`, 0 hardcoded `#hex` literals, 4-state UX, responsive parity | M3 | Survey FE |
| 16 | Upgraded Governance Dashboard (`/`) | Semantic KPI cards, Registration Velocity chart with `7d`/`14d`/`30d` toggles using CSS variables, operational activity, quick actions | M3 | Survey FE |
| 17 | Tenants Registry & Workstation | Search, filters, subscription toggle, cleanup trigger, telemetry overrides, entitlements | M3 | Survey FE |
| 18 | Operational Governance Dialogs | `PlanEditorDialog` (14 limits, 10 flags, async slug check), `RecordPaymentDialog` (5 methods, VAT calc, receipt), `TenantCleanupDialog` (preflight, archive/purge), `TenantEntitlementsCard` | M3 | Survey FE |
| 19 | Plans, Leads, Blog & Subscribers CRM | Commercial plan ladder, leads table, Markdown blog editor, subscriber directory with browser CSV export | M3 | Survey FE |
| 20 | Roles, Admin Accounts & Password Reset | RBAC role editor, admin invite modal, self-action guards (`isSelfAdminUser`, `getAdminUserActionRestriction`), 3-mode password resets, suspend/reactivate | M3 | Survey FE |
| 21 | Platform Settings & N-Bank Builder | 6 setting categories, N-bank JSON CRUD builder, BIR VAT, online checkout switch, orphan purge policies | M3 | Survey FE |
| 22 | Invitation Accept & Reset Public Routes | Public token acceptance with role display and Clerk sign-in/up integration, password reset client | M3 | Survey FE |
| 23 | Clean Deletion of Admin in `portal-web` | Complete removal of 27 admin files (21 routes, 4 dialogs, `admin.service.ts`, `permissions.ts`) with zero legacy shims | M4 | Survey Test |
| 24 | Shared Touchpoint Decoupling | Decouple `billing.service.ts`, `selfActionGuard.ts`, `invitationCookie.ts`, `sync-auth/page.tsx`, `proxy.ts` (retain `'admin'` in `RESERVED_SUBDOMAINS`), `nav-user.tsx`, `join.ts` | M4 | Survey Test |
| 25 | Monorepo Orchestration Scripts | Wire `apps/admin-web` into `package.json` (`dev:admin`, `lint:admin`, `typecheck:admin`, `test:admin`, `build:admin`, `typecheck:all`), `check-no-broker.ps1`, `.github/workflows/apps-ci.yml`, and deploy workflows | M4 | Survey Test |
| 26 | Test Suite Migration & Decoupling | Migrate 5 pure admin test suites to `apps/admin-web/tests/`, decouple 7 shared test suites in `apps/portal-web/tests/` | M4 | Survey Test |
| 27 | 100% E2E Test Suite Pass (Tiers 1-4) | Pass all functional, boundary, cross-feature, and real-world application test cases published in `TEST_READY.md` | M5 | Survey Test |
| 28 | Adversarial Coverage Hardening (Tier 5) | White-box stress testing, AST token linting, edge security verification, and Forensic Audit verification | M5 | Survey Test |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Stateless Hardening & URL Resolution | `services/portal-api` `AdminBaseUrl` provider, clean root paths in email/invites/resets, newsletter RBAC, Clerk AZP dev parties, docker-compose/env, zero DB changes | none | DONE |
| M2 | Standalone `apps/admin-web` Scaffold, Security & Routing | Vite + React 19 + TanStack Router + Tailwind v4 scaffold, security headers, idle timeout, MFA gate, diagnostic screen, clean root routes, cross-surface URLs | none | DONE |
| M3 | Governance Workstation UI/UX Restyle & Governance Modules | Workstation shell, command bar (`⌘K`), design token restyle, upgraded `/` dashboard, all governance pages & operational dialogs, 4-state UX | M2 | DONE |
| M4 | Monorepo Decoupling, Removal & Build Orchestration | Delete 27 admin files from `portal-web`, decouple shared utilities, wire root scripts/workflows, migrate pure admin test suites | M1, M2, M3 | DONE |
| M5 | Final Milestone: 100% E2E Pass & Adversarial Hardening | Pass 100% of E2E test suite (Tiers 1-4 from `TEST_READY.md`), Phase 2 Tier 5 Adversarial Coverage Hardening & Forensic Audit | M4, E2E Track | DONE |

## Interface Contracts

### Backend `services/portal-api` ↔ Frontend `apps/admin-web`
- Base URL config: `AdminBaseUrl` (e.g. `http://localhost:3001` in dev, `https://admin.clinicez.com` in prod).
- Clean root invitation path: `{AdminBaseUrl}/invitations/{token}`.
- Clean root password reset path: `{AdminBaseUrl}/reset-password/{token}`.
- API endpoints: 42 `/api/v1/admin/*` endpoints and 2 `/api/v1/public/password-reset/{token}` endpoints accepting `Authorization: Bearer <ClerkJWT>`.
- Newsletter subscribers endpoint: `GET /api/v1/admin/newsletter-subscribers` strictly requires admin profile with `manage:blogs` or `view:tenants`.

### Frontend `apps/admin-web` ↔ Multi-Tenant Portal `apps/portal-web`
- Cross-surface links:
  - `getTenantWorkspaceUrl(slug, path)` -> `{slug}.{baseDomain}{path}` or `http://localhost:3000/{slug}{path}`.
  - `getPublicSiteUrl(path)` -> `{baseDomain}{path}` or `http://localhost:3000{path}`.
- Shared domain: `clinicez.com` (prod) or `localhost` (dev).
- Reserved subdomain: `'admin'` remains reserved in `RESERVED_SUBDOMAINS` on `apps/portal-web/src/proxy.ts`.

## Code Layout
- `apps/admin-web/`:
  - `src/main.tsx`: Entrypoint with diagnostic boot screen fallback.
  - `src/routes/`: TanStack Router file-based tree with clean root paths (`__root.tsx`, `_auth.tsx`, `index.tsx`, `tenants/`, `plans.tsx`, `leads.tsx`, `blog.tsx`, `subscribers.tsx`, `roles.tsx`, `users.tsx`, `settings.tsx`, `invitations/$token.tsx`, `reset-password/$token.tsx`, `sign-in.tsx`, `sign-up.tsx`, `sync-auth.tsx`).
  - `src/components/`: Governance workstation shell, command bar, KPI cards, velocity chart, `PlanEditorDialog`, `RecordPaymentDialog`, `TenantCleanupDialog`, `TenantEntitlementsCard`, 4-state primitives.
  - `src/lib/`: Cross-surface `urls.ts`, `selfActionGuard.ts`, `api.ts`, `idleGuard.ts`, `mfaGuard.ts`.
  - `src/services/admin.service.ts`: Axios client for all 42 `/api/v1/admin/*` endpoints.
  - `tests/`: Migrated and new test suites.
  - `vercel.json`: Edge security headers (`CSP`, `X-Frame-Options: DENY`, `X-Robots-Tag: noindex...`).
  - `public/robots.txt`: `Disallow: /`.
- `apps/portal-web/`: Cleanly purged of all 27 admin files, decoupled `billing.service.ts`, `selfActionGuard.ts`, `invitationCookie.ts`, `sync-auth/page.tsx`, `proxy.ts`, `nav-user.tsx`.
- `services/portal-api/`: `FrontendUrlProvider.cs`, `AdminInvitationNotifier.cs`, `AdminUserDto.cs`, `ResetAdminUserPasswordCommand.cs`, `GetPendingSelfInvitationQuery.cs`, `NewsletterEndpoints.cs`, `appsettings.Development.json`.
