# Project: Clinic Administrator Account Recovery Mechanism

## Architecture
ClinicEZ is a multi-tenant clinical workstation and EHR system. This project introduces a first-class, cryptographically verified Clinic Administrator Account Recovery mechanism across:
- **Backend API (`services/clinic-api`)**: Anonymous, rate-limited endpoint `POST /api/v1/auth/recover-admin` validating facility license tokens via `IFacilityLicenseValidator`, resetting passwords and lockouts for administrators, incrementing `TokenVersion`, revoking refresh tokens across the LAN, and invalidating `StaffAccessCache`.
- **Workstation Frontend (`apps/clinic-app`)**: React Native / Expo web application adhering to the ClinicEZ design system (Teal `#0D6963`). Features `AdminRecoveryScreen.tsx` with client-side defensive validation, toggle navigation in `LoginScreen.tsx`, session management in `authSession.ts`, and context state transitions in `AuthContext.tsx`.
- **Operational CLI Tooling (`scripts/`)**: Symmetric Bash (`reset-admin-credentials.sh`) and PowerShell (`reset-admin-credentials.ps1`) scripts for VPS administrators and developers to safely clear lockouts or generate cryptographically secure one-time invitation links without writing raw SQL.
- **Verification Suite**: Full automated test coverage in .NET (`ClinicAuthServiceTests.cs`) and Bun (`adminRecovery.test.ts`), plus adversarial verification and forensic integrity audits.

```
                    ┌───────────────────────────────┐
                    │ Workstation UI: clinic-app    │
                    │  - LoginScreen (Toggle)       │
                    │  - AdminRecoveryScreen        │
                    │  - authSession.recoverAdmin   │
                    └───────────────┬───────────────┘
                                    │ POST /api/v1/auth/recover-admin
                                    ▼
                    ┌───────────────────────────────┐
                    │ Backend API: clinic-api       │
                    │  - AuthController             │
                    │  - ClinicAuthService          │
                    │  - IFacilityLicenseValidator  │
                    │  - StaffAccessCache (MemCache)│
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │ PostgreSQL 17 Database        │
                    │  - StaffMembers               │
                    │  - RefreshTokens (Revoked)    │
                    │  - Settings / LicenseToken    │
                    └───────────────────────────────┘
                                    ▲
                                    │ Operational Break-Glass
                    ┌───────────────┴───────────────┐
                    │ Scripts: reset-admin-...sh/ps1│
                    │  - List / ClearLockout / Link │
                    └───────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | API Controller Endpoint | Expose `POST /api/v1/auth/recover-admin` with `[AllowAnonymous]` in `AuthController.cs` with HTTP 400/409/429 status mapping | M1 | Survey Backend |
| 2 | License Mismatch Mapping | Align `ClinicAuthService.RecoverAdminAsync` to return `AuthFailure.InvalidRequest` on facility mismatch (HTTP 400) | M1 | Survey Backend |
| 3 | Backend Recovery Unit Tests | 8 comprehensive tests in `ClinicAuthServiceTests.cs` (valid recovery, tampered/foreign license, non-admin rejection, weak password, session revocation) | M1 | Survey Backend |
| 4 | Auth Session Client Method | Add `AdminRecoveryInput` and `recoverAdmin` in `services/authSession.ts` saving tokens to secure storage | M2 | Survey Frontend |
| 5 | Auth Context Integration | Expose `recoverAdmin` in `AuthContext.tsx` and transition `AuthState` to `'signedIn'` on success | M2 | Survey Frontend |
| 6 | Admin Recovery UI Component | Create `components/auth/AdminRecoveryScreen.tsx` with Teal `#0D6963` tokens, defensive validation, and clear error banners | M2 | Survey Frontend |
| 7 | Login Screen Entry Point | Add accessible toggle link ("Are you the clinic admin? Recover account") in `components/auth/LoginScreen.tsx` | M2 | Survey Frontend |
| 8 | Frontend Automated Tests | Bun test suite in `apps/clinic-app/tests/adminRecovery.test.ts` covering password validation, API payload, context transitions, and screen toggles | M2 | Survey Frontend |
| 9 | Operational Bash Tool | Create `scripts/reset-admin-credentials.sh` with `--list`, `--clear-lockout`, and `--generate-invite` supporting Docker & host PostgreSQL | M3 | Survey Ops |
| 10 | Operational PowerShell Tool | Create `scripts/reset-admin-credentials.ps1` with symmetric parameters and secure token generation | M3 | Survey Ops |
| 11 | Full Verification & Hardening | Run complete test suite, Challenger verification, and Forensic Integrity Audit | M4 | Survey Ops |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Admin Recovery API & Tests | `services/clinic-api/` controller, status mapping, and 8 unit tests in `ClinicAuthServiceTests.cs` | none | DONE |
| M2 | Frontend Workstation Recovery Screen & Tests | `apps/clinic-app/` service, context, `AdminRecoveryScreen.tsx`, `LoginScreen.tsx`, and Bun unit tests | M1 | DONE |
| M3 | Operational Recovery CLI Tooling | `scripts/reset-admin-credentials.sh` and `scripts/reset-admin-credentials.ps1` | none | DONE |
| M4 | Final Integration, Verification & Forensic Audit | End-to-end verification, adversarial challenge tests, and forensic integrity audit | M1, M2, M3 | DONE |

## Interface Contracts

### Backend API Contract (`clinic-api`)
- **Route**: `POST /api/v1/auth/recover-admin`
- **Request Body (`RecoverAdminRequest`)**:
  ```json
  {
    "workspace": "facility-slug-optional",
    "licenseToken": "base64-encoded-ecdsa-signed-token",
    "email": "admin@clinic.ph",
    "newPassword": "NewStrongPassword123!",
    "deviceLabel": "workstation-1"
  }
  ```
- **Responses**:
  - `200 OK`: `ApiResponse<AuthTokensDto>` with `AccessToken`, `RefreshToken`, expiry dates, and `AuthUserDto`.
  - `400 Bad Request`: Validation failure (weak password, empty fields, non-admin email, tampered/mismatched license key).
  - `404 Not Found`: No staff member found matching email in facility, or workspace not found.
  - `429 Too Many Requests`: Triggered by rate limiter (30 requests/minute).

### Frontend Contract (`clinic-app`)
- **Input Type (`AdminRecoveryInput`)**:
  ```typescript
  export interface AdminRecoveryInput {
    licenseToken: string;
    email?: string;
    newPassword: string;
    workspace?: string;
  }
  ```
- **Service Method (`authSession.ts`)**:
  `export async function recoverAdmin(input: AdminRecoveryInput): Promise<AuthResult<AuthUser>>`
- **Context Method (`AuthContext.tsx`)**:
  `recoverAdmin: (input: AdminRecoveryInput) => Promise<string | null>`
- **Component Props (`AdminRecoveryScreen.tsx`)**:
  ```typescript
  export interface AdminRecoveryScreenProps {
    onBackToLogin: () => void;
    onSuccess?: () => void;
    initialEmail?: string;
  }
  ```

### CLI Tooling Contract (`scripts/`)
- **Parameters**:
  - `--action <list|clear-lockout|generate-invite>` (default: `generate-invite`)
  - `--email <admin-email>` (optional if only 1 admin exists)
  - `--app-url <url>` (default: `http://localhost:8081` or production host)
  - `--use-docker` / `--container <name>` (default: `postgres`)
  - `--db <name>` (auto-resolves `CLINICEZ-CLINIC_DB` / `CLINICEZ_CLINIC_DB`)
- **Outputs**:
  - Action `list`: Formatted table of admin accounts with status and lockout flags.
  - Action `clear-lockout`: Resets `FailedLoginCount` and `LockoutEnd`, increments `TokenVersion`, outputs success confirmation.
  - Action `generate-invite`: Generates 64-char hex token, sets 7-day expiration, updates `Status = Invited`, clears lockout, increments `TokenVersion`, revokes active refresh tokens, and outputs one-time URL.

## Code Layout & Ownership
- **Milestone 1**:
  - `services/clinic-api/ClinicEz.Clinic.Api/Controllers/AuthController.cs`
  - `services/clinic-api/ClinicEz.Clinic.Infrastructure/Auth/ClinicAuthService.cs`
  - `services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicAuthServiceTests.cs`
- **Milestone 2**:
  - `apps/clinic-app/services/authSession.ts`
  - `apps/clinic-app/context/AuthContext.tsx`
  - `apps/clinic-app/components/auth/AdminRecoveryScreen.tsx`
  - `apps/clinic-app/components/auth/LoginScreen.tsx`
  - `apps/clinic-app/tests/adminRecovery.test.ts`
- **Milestone 3**:
  - `scripts/reset-admin-credentials.sh`
  - `scripts/reset-admin-credentials.ps1`
- **Milestone 4**:
  - Full suite verification across all targets
  - Adversarial & Forensic audit evidence records
