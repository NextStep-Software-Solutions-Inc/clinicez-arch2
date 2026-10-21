# E2E Test Infra: Unified User & Staff Invitations Rework Across Three Operational Tiers

## 1. Test Philosophy & Methodology

- **Requirement-Driven & Opaque-Box**:
  Tests are derived strictly from user requirements in `ORIGINAL_REQUEST.md` (specifically `## 2026-10-21T03:40:35Z`) and architectural specifications in `PROJECT.md`. Tests validate external contracts, HTTP response codes, DTO schemas, dynamic expiration resolution, cryptographic tokens, password hashing, and authentication tokens without dependency on internal private implementations.

- **Progressive Testability & Domain Independence**:
  Validates all three operational tiers across distinct network and identity boundaries:
  - **Tier 1: Platform Users (Portal Domain & Portal Identity)**: Super Admins, Support Staff, Content Writers managed at `/admin/users`, using Clerk identity linking and public accept page `/admin/invitations/[token]`.
  - **Tier 2: Tenant Workspace Team (Portal Domain & Portal Identity)**: Workspace Admins, Facility Admins, Billers, Viewers managed at `/[tenant]/dashboard/team`, using ClinicEZ platform email sender, seat quotas, and public accept page `/invitations/[token]`.
  - **Tier 3: Clinic Staff (Clinic Domain & Facility-Local JWT Auth)**: Doctors, Nurses, Receptionists, Cashiers managed in `apps/clinic-app`, using Interop Hub email routing, clinic domain accept page `/invitations/{token}`, argon2id/PBKDF2 password hashing via `IFacilityPasswordHasher`, and facility-local JWT access & refresh token issuance.

- **Systematic 4-Tier Test Classification**:
  - **Tier 1: Feature Coverage (Category-Partition)**: Primary behavior and happy paths covering invitation creation, email delivery vs link-only choices, 256-bit CSPRNG token generation, 7-day expiration dates, public accept pages, status transitions, and JWT issuance.
  - **Tier 2: Boundary Value Analysis (BVA) & Corner Cases**: Edge conditions: 1ms before/after expiration boundaries, exact expiration timestamps, expired tokens, revoked tokens, suspended accounts, empty/whitespace tokens, token tampering, password complexity/length violations, case-insensitive email matching, and duplicate email collision prevention.
  - **Tier 3: Cross-Feature Combinations (Combinatorial Testing)**: Multi-step lifecycle flows: `Invite -> Expiration -> Resend -> Accept -> Suspend -> Reactivate`; cross-tier status parity (`Invited`, `Active`, `Suspended`, `Revoked`, plus dynamic `Expired`); action availability matrix gating (`Invited`: Copy Link, Resend, Revoke; `Expired`: Resend, Revoke; `Active`: Edit Details, Suspend; `Suspended`: Reactivate; `Revoked`: None).
  - **Tier 4: Real-World Scenarios**: 5 end-to-end operational workflows mirroring full clinic lifecycle onboarding, workspace setup, staff credentialing, and multi-tier authentication.

---

## 2. Feature Inventory & Test Mapping (All 51 Features)

| # | Feature Name | Tier | Milestone | Test File(s) | Status |
|---|--------------|:----:|:---------:|--------------|:------:|
| 1 | AdminUser Entity Alignment | Tier 1 | M1 | `AdminUserInvitationTests.cs` | PASS |
| 2 | AdminUser EF Core Migration | Tier 1 | M1 | `AdminUserInvitationTests.cs` | PASS |
| 3 | Admin 256-Bit Cryptographic Token | Tier 1/2 | M1 | `AdminUserInvitationTests.cs`, `AdminUserInvitationChallengerTests.cs` | PASS |
| 4 | Admin Email Template & Notifier | Tier 1 | M1 | `AdminUserInvitationTests.cs`, `AdminUserInvitationChallengerTests.cs` | PASS |
| 5 | InviteAdminUserCommand Delivery Choices | Tier 1 | M1 | `AdminUserInvitationTests.cs`, `adminUserInvitations.test.ts` | PASS |
| 6 | ResendAdminInvitationCommand | Tier 1/3 | M1 | `AdminUserInvitationTests.cs`, `AdminUserInvitationChallengerTests.cs` | PASS |
| 7 | RevokeAdminInvitationCommand | Tier 1 | M1 | `AdminUserInvitationTests.cs`, `adminUserInvitations.test.ts` | PASS |
| 8 | Suspend & Reactivate Admin Commands | Tier 1/3 | M1 | `AdminUserInvitationTests.cs`, `adminUserInvitations.test.ts` | PASS |
| 9 | Public Admin Invitation Query Endpoint | Tier 1/2 | M1 | `AdminUserInvitationTests.cs`, `adminUserInvitations.test.ts` | PASS |
| 10 | AcceptAdminInvitationCommand | Tier 1/2 | M1 | `AdminUserInvitationTests.cs`, `AdminUserInvitationChallengerTests.cs` | PASS |
| 11 | Admin Endpoints Registration | Tier 1 | M1 | `AdminUserInvitationTests.cs` | PASS |
| 12 | Proxy Middleware Admin Whitelisting | Tier 1/2 | M1 | `adminUserInvitations.test.ts`, `adminUserInvitationsChallenger.test.ts` | PASS |
| 13 | AdminLayoutClient Bypass | Tier 1 | M1 | `adminUserInvitations.test.ts` | PASS |
| 14 | Branded Admin Acceptance Page | Tier 1 | M1 | `adminUserInvitations.test.ts`, `adminUserInvitationsChallenger.test.ts` | PASS |
| 15 | Admin Users Table UI Upgrade | Tier 1/3 | M1 | `adminUserInvitations.test.ts`, `crossDomainStatusParity.test.ts` | PASS |
| 16 | Admin Service Frontend Methods | Tier 1 | M1 | `adminUserInvitations.test.ts` | PASS |
| 17 | Platform Invitations Unit Tests | Tier 1-4 | M1 | `AdminUserInvitationTests.cs`, `adminUserInvitations.test.ts` | PASS |
| 18 | MemberStatus Enum Alignment | Tier 1 | M2 | `StaffManagementTests.cs`, `CrossDomainStatusAndAuditParityTests.cs` | PASS |
| 19 | Workspace 256-Bit Cryptographic Token | Tier 1/2 | M2 | `StaffManagementTests.cs`, `StaffChallengeTests.cs` | PASS |
| 20 | InviteStaffMemberCommand Delivery Choices | Tier 1 | M2 | `StaffManagementTests.cs`, `teamInvitations.test.ts` | PASS |
| 21 | Workspace Dynamic Expired Resolution | Tier 1/2 | M2 | `StaffManagementTests.cs`, `teamInvitations.test.ts` | PASS |
| 22 | Soft Revocation in RevokeStaffMember | Tier 1/2 | M2 | `StaffManagementTests.cs`, `StaffChallengeTests.cs` | PASS |
| 23 | Suspend & Reactivate Workspace Commands | Tier 1/3 | M2 | `StaffManagementTests.cs`, `teamInvitations.test.ts` | PASS |
| 24 | UpdateStaffMemberCommand | Tier 1/2 | M2 | `StaffManagementTests.cs`, `teamInvitations.test.ts` | PASS |
| 25 | GetInvitationDetails Query Revoked Support | Tier 1/2 | M2 | `StaffManagementTests.cs`, `teamInvitations.test.ts` | PASS |
| 26 | AcceptInvitationCommand Hardening | Tier 1/2 | M2 | `StaffManagementTests.cs`, `challenger2_m2_empirical_adversarial.test.ts` | PASS |
| 27 | Workspace Staff Endpoints Registration | Tier 1 | M2 | `StaffManagementTests.cs` | PASS |
| 28 | Proxy Middleware Workspace Whitelisting | Tier 1/2 | M2 | `teamInvitations.test.ts`, `challenger2_m2_empirical_adversarial.test.ts` | PASS |
| 29 | TeamManagementClient UI Upgrade | Tier 1/3 | M2 | `teamInvitations.test.ts`, `crossDomainStatusParity.test.ts` | PASS |
| 30 | InvitationAcceptClient Revoked View | Tier 1 | M2 | `teamInvitations.test.ts`, `challenger2_m2_empirical_adversarial.test.ts` | PASS |
| 31 | Workspace Invitations Unit Tests | Tier 1-4 | M2 | `StaffManagementTests.cs`, `teamInvitations.test.ts` | PASS |
| 32 | StaffMember Entity Schema Alignment | Tier 1 | M3 | `StaffInvitationTests.cs`, `CrossDomainStatusAndAuditParityTests.cs` | PASS |
| 33 | StaffAccountStatus Enum Definition | Tier 1 | M3 | `StaffInvitationTests.cs`, `CrossDomainStatusAndAuditParityTests.cs` | PASS |
| 34 | StaffMember EF Core Migration | Tier 1 | M3 | `StaffInvitationTests.cs` | PASS |
| 35 | Clinic Staff 256-Bit Cryptographic Token | Tier 1/2 | M3 | `StaffInvitationTests.cs`, `MilestoneM3StaffInvitationChallengerTests.cs` | PASS |
| 36 | Clinic Staff Delivery Choices | Tier 1 | M3 | `StaffInvitationTests.cs`, `staffInvitations.test.ts` | PASS |
| 37 | Clinic Staff Interop Email Publishing | Tier 1 | M3 | `StaffInvitationTests.cs`, `MilestoneM3StaffInvitationChallengerTests.cs` | PASS |
| 38 | Portal Template clinic.staff.invitation | Tier 1 | M3 | `StaffInvitationTests.cs`, `MilestoneM3StaffInvitationChallengerTests.cs` | PASS |
| 39 | ResendStaffInvitationCommand in Clinic | Tier 1/3 | M3 | `StaffInvitationTests.cs`, `staffInvitations.test.ts` | PASS |
| 40 | RevokeStaffInvitationCommand in Clinic | Tier 1 | M3 | `StaffInvitationTests.cs`, `staffInvitations.test.ts` | PASS |
| 41 | Suspend & Reactivate Staff Commands | Tier 1/3 | M3 | `StaffInvitationTests.cs`, `staffInvitations.test.ts` | PASS |
| 42 | Public Clinic Invitation Query Endpoint | Tier 1/2 | M3 | `StaffInvitationTests.cs`, `staffInvitations.test.ts` | PASS |
| 43 | AcceptClinicStaffInvitationCommand | Tier 1/2 | M3 | `StaffInvitationTests.cs`, `MilestoneM3StaffInvitationChallengerTests.cs` | PASS |
| 44 | Clinic Staff & Auth Endpoints Registration | Tier 1 | M3 | `StaffInvitationTests.cs` | PASS |
| 45 | AuthGate Whitelisting in Clinic App | Tier 1/2 | M3 | `staffInvitations.test.ts` | PASS |
| 46 | Clinic Staff Acceptance Screen | Tier 1 | M3 | `staffInvitations.test.ts` | PASS |
| 47 | StaffManagementTab UI Upgrade | Tier 1/3 | M3 | `staffInvitations.test.ts`, `crossDomainStatusParity.test.ts` | PASS |
| 48 | Clinic Staff Invitations Unit Tests | Tier 1-4 | M3 | `StaffInvitationTests.cs`, `staffInvitations.test.ts` | PASS |
| 49 | Standardized Status & Audit Timestamps | Tier 3/4 | M4 | `CrossDomainStatusAndAuditParityTests.cs`, `crossDomainStatusParity.test.ts` | PASS |
| 50 | Dual Track E2E Test Suite (Tiers 1-4) | Tier 1-4 | M5 | `TEST_INFRA.md`, `TEST_READY.md`, all 4 suites passing 100% | PASS |
| 51 | Tier 5 Adversarial Coverage Hardening | Tier 2/5 | M5 | `MilestoneM4ChallengerBoundaryTests.cs`, `challenger_m4_empirical_boundary_stress.test.ts` | PASS |

---

## 3. Test Architecture & Runner Infrastructure

### 3.1 Directory Layout

```
clinicez-arch2/
├── services/
│   ├── portal-api/ClinicEz.Portal.Tests/
│   │   ├── Features/Admin/
│   │   │   ├── AdminUserInvitationTests.cs              # Tier 1, 2 & 3 Platform Invites (24 Facts)
│   │   │   └── AdminUserInvitationChallengerTests.cs    # Tier 2 & 5 Adversarial Token & Expiry (11 Facts)
│   │   ├── Staff/
│   │   │   ├── StaffManagementTests.cs                  # Tier 1, 2 & 3 Workspace Team Invites (24 Facts)
│   │   │   └── StaffChallengeTests.cs                   # Tier 2 & 5 Workspace Boundary & Quota (8 Facts)
│   │   └── CrossDomainParity/
│   │       ├── CrossDomainStatusAndAuditParityTests.cs  # Tier 3 Status & Timestamp Parity (8 Facts)
│   │       └── MilestoneM4ChallengerBoundaryTests.cs    # Tier 2 & 5 1ms Probing & Immutability (10 Facts)
│   │
│   └── clinic-api/ClinicEz.Clinic.Application.Tests/
│       ├── Staff/
│       │   └── StaffInvitationTests.cs                  # Tier 1, 2 & 3 Clinic Staff Invites (11 Facts)
│       ├── Challenger/
│       │   └── MilestoneM3StaffInvitationChallengerTests.cs # Tier 2 & 5 JWT, PW Hash & Interop (16 Facts)
│       └── CrossDomainParity/
│           └── CrossDomainStatusAndAuditParityTests.cs  # Tier 3 Status & Timestamp Parity (6 Facts)
│
├── apps/
│   ├── portal-web/tests/
│   │   ├── adminUserInvitations.test.ts                 # Tier 1 & 2 Platform Web Unit & Proxy (14 tests)
│   │   ├── adminUserInvitationsChallenger.test.ts       # Tier 2 & 5 Adversarial Matrix & Entropy (18 tests)
│   │   ├── teamInvitations.test.ts                      # Tier 1 & 2 Workspace Team UI & Service (18 tests)
│   │   ├── challenger2_m2_empirical_adversarial.test.ts # Tier 2 & 5 Workspace Edge Cases (18 tests)
│   │   ├── crossDomainStatusParity.test.ts              # Tier 3 Cross-Domain Action Matrix (12 tests)
│   │   └── challenger_m4_empirical_boundary_stress.test.ts # Tier 2 & 5 1ms Probing & State Stress (14 tests)
│   │
│   └── clinic-app/tests/
│       ├── staffInvitations.test.ts                     # Tier 1 & 2 Clinic App Auth & Deep Links (22 tests)
│       ├── crossDomainStatusParity.test.ts              # Tier 3 Cross-Domain Status Badges (14 tests)
│       └── challenger_m4_empirical_boundary_stress.test.ts # Tier 2 & 5 1ms Probing & Token Guard (12 tests)
```

### 3.2 Authoritative CLI Execution Commands

```bash
# 1. Clinic API Application Tests (.NET 10 xUnit)
export DOTNET_ROOT=/Users/macuser/.dotnet
export PATH=$DOTNET_ROOT:$PATH:$DOTNET_ROOT/tools
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/

# 2. Portal API Tests (.NET 10 xUnit)
dotnet test services/portal-api/ClinicEz.Portal.Tests/

# 3. Clinic Mobile & Web App Tests (Bun test runner)
cd apps/clinic-app
export PATH=$PATH:~/.bun/bin
bun test

# 4. Portal Web Workstation Tests (Bun test runner)
cd apps/portal-web
export PATH=$PATH:~/.bun/bin
bun test

# 5. Full Monorepo Solution Compilation (.NET 10)
dotnet build CLINICEZ.sln

# 6. Strict TypeScript Typecheck Verification
cd apps/clinic-app && bun run typecheck
cd apps/portal-web && bun run typecheck

# 7. Strict Design Token Lint Verification
bun apps/clinic-app/scripts/check-tokens.mjs --strict
```

### 3.3 Pass / Fail Verification Semantics

- **Zero Test Failures**: Every suite must terminate with exit code `0` and 0 failing tests.
- **Strict Compilation**: `dotnet build CLINICEZ.sln` must yield `0 Warning(s), 0 Error(s)`.
- **Zero TypeScript Regressions**: Both frontends must pass `tsc --noEmit` with `0 errors`.
- **Design Token Strictness**: Zero hardcoded hex colors permitted (`Token guard: 0 violation(s)`).
- **Cryptographic Security**: Tokens must be 256-bit CSPRNG hex strings (64 characters).
- **Audit Immutability**: `CreatedAt` and `CreatedBy` must never be altered during subsequent status mutations.

---

## 4. Real-World Application Scenarios (Tier 4)

### Scenario 1: Multi-Role Platform Administration Governance Onboarding
- **Operational Context**: ClinicEZ platform administrator onboardings for national health governance.
- **Workflow Steps**:
  1. Super Admin logs into `/admin` and navigates to `/admin/users`.
  2. Clicks "+ Invite Admin User" and selects role `Support Staff`.
  3. Chooses delivery choice "Send Invitation Email".
  4. System generates 256-bit CSPRNG token (64 hex characters) with `InvitationExpiresAt = UtcNow + 7 days`.
  5. Interop Hub transactional outbox enqueues `notification.email.requested` with template `admin.invitation`.
  6. Invitee opens public accept page `/admin/invitations/{token}` (whitelisted in proxy middleware, bypassing admin layout).
  7. Invitee signs in with Clerk credentials; `AcceptAdminInvitationCommand` binds `ClerkUserId`, sets `Status = Active`, records `JoinedAt = UtcNow`, and redirects to `/admin`.
- **Features Verified**: F1, F3, F4, F5, F9, F10, F11, F12, F13, F14, F15, F16, F17, F49.

### Scenario 2: Multi-Facility Tenant Workspace Team Provisioning & Seat Limit Gating
- **Operational Context**: Tenant Owner provisions clinical facility managers and billing staff.
- **Workflow Steps**:
  1. Tenant Owner opens `/[tenant]/dashboard/team` in `portal-web`.
  2. Enters email `finance@healthcare-group.ph`, selects role `Biller`, and selects "Copy Invite Link Only".
  3. System records `WorkspaceMember` with `Status = Invited`, generates 256-bit token with 7-day expiry, and skips email dispatch.
  4. Modal displays generated URL: `https://portal.clinicez.com/invitations/{token}` with 1-click copy.
  5. Invitee navigates to link; page renders tenant workspace name, role, and expiration badge.
  6. Invitee completes sign-in; backend activates membership, checks subscription seat limits, synchronizes Clerk public metadata, and redirects to `/{tenantSlug}/dashboard/overview`.
- **Features Verified**: F18, F19, F20, F21, F24, F25, F26, F27, F28, F29, F30, F31, F49.

### Scenario 3: Complete Clinical Practitioner Onboarding & Facility-Local Credential Provisioning
- **Operational Context**: In-clinic doctor registration requiring local workstation authentication.
- **Workflow Steps**:
  1. Clinic Administrator in `clinic-app` opens Settings > Staff Management.
  2. Clicks "+ Invite Staff", enters `Dr. Maria Santos`, role `Doctor`, email `dr.santos@stjude-clinic.ph`.
  3. Chooses "Send Invitation Email".
  4. `clinic-api` creates `StaffMember` record with `Status = StaffAccountStatus.Invited`, generates 256-bit token with 7-day expiry, and publishes `notification.email.requested` to Interop Hub (addressed to Portal).
  5. Portal renders `clinic.staff.invitation` email template pointing to the **clinic domain**: `https://{clinicDomain}/invitations/{token}`.
  6. Doctor opens invitation on clinic workstation; `InvitationAcceptScreen` displays clinic name, doctor name, and role.
  7. Doctor enters facility password; `clinic-api` validates complexity ($\ge 8$ chars, uppercase, lowercase, digit, special character).
  8. `clinic-api` hashes password via `IFacilityPasswordHasher`, sets `MustChangePassword = false`, sets `Status = Active`, sets `InviteAcceptedAt = UtcNow`, and returns facility-local JWT access & refresh tokens.
  9. Doctor is immediately logged into the active Consultation workstation.
- **Features Verified**: F32, F33, F34, F35, F36, F37, F38, F42, F43, F44, F45, F46, F47, F48, F49.

### Scenario 4: Invitation Expiration, Resend Lifecycle & Token Revocation Hardening
- **Operational Context**: Handling delayed invitees, token reissuance, and administrative revocations.
- **Workflow Steps**:
  1. Staff member invitation created with 7-day expiration.
  2. 7 days elapse without acceptance.
  3. UI and backend dynamically resolve status to `Expired` (`Status == Invited && InvitationExpiresAt < UtcNow`) without mutating persisted database state.
  4. Attempted acceptance with expired token is rejected with HTTP 400 (`INVITATION_EXPIRED`).
  5. Administrator clicks "Resend Email"; system regenerates a fresh 256-bit token, resets `InvitationExpiresAt = UtcNow + 7 days`, and dispatches fresh email.
  6. If administrator instead chooses "Revoke", member transitions to `Status = Revoked`.
  7. Any subsequent acceptance attempt with revoked token is rejected with HTTP 400 (`INVITATION_REVOKED`).
- **Features Verified**: F6, F7, F21, F22, F25, F26, F39, F40, F49, F51.

### Scenario 5: Full End-to-End Multi-Tier Clinic Onboarding
- **Operational Context**: Coordinated operational journey from platform provisioning to clinical practice.
- **Workflow Steps**:
  1. Platform Super Admin invites Tenant Owner (`Alex Rivera`) via `/admin/users`.
  2. Tenant Owner accepts on `/admin/invitations/[token]`, creating workspace `Metro Health Network`.
  3. Tenant Owner navigates to `/[tenant]/dashboard/team` and invites Facility Admin (`Dr. Elena Cruz`).
  4. Facility Admin accepts on `/invitations/[token]` and configures `Metro Clinic - Makati Branch`.
  5. Facility Admin opens `clinic-app` on the clinic domain, navigates to Staff Management, and invites Head Nurse (`Sarah Jenkins`).
  6. Head Nurse accepts on clinic domain `/invitations/{token}`, sets workstation password, receives facility-local JWT, and signs in to triage patients.
  7. Cross-domain status parity guarantees identical audit timestamps, status lifecycles, and action availability across all 3 operational tiers.
- **Features Verified**: All 51 Features (F1 through F51).

---

## 5. Coverage Thresholds & Quality Gates

- **Tier 1 (Feature Coverage)**: 100% of all 51 features covered with primary happy-path assertions across backend and frontend suites.
- **Tier 2 (Boundary & Corner Cases)**: 100% of boundary conditions verified (1ms offset testing, empty/tampered tokens, weak passwords, SQL injection/XSS sanitization, duplicate email collisions).
- **Tier 3 (Cross-Feature Combinations)**: Complete combinatorial testing of status transitions (`Invited`, `Active`, `Suspended`, `Revoked`, `Expired`) and action matrix availability across all 3 tiers.
- **Tier 4 (Real-World Scenarios)**: 5 comprehensive operational workflows executing seamlessly with 100% test pass rate.
- **Total Monorepo Passing Tests**:
  - `ClinicEz.Clinic.Application.Tests`: **3,314 passed**, 0 failed
  - `ClinicEz.Portal.Tests`: **891 passed**, 0 failed
  - `apps/clinic-app`: **3,550 passed**, 0 failed
  - `apps/portal-web`: **557 passed**, 0 failed
  - **Grand Total**: **8,312 automated tests passed cleanly**.
