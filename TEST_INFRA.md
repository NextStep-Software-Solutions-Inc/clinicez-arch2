# E2E Test Infra: ClinicEZ Tri-Domain Decoupling & Publishing Governance

## Test Philosophy
- Opaque-box, requirement-driven verification across multi-tenant governance, resilient Interop Hub synchronization, and hybrid gated patient intake.
- Methodology: Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Testing, and Real-World Application Scenarios.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Master Directory Eligibility (`IsPatientDiscoveryEligible`) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 2 | Facility Readiness Evaluation & Checklist | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 3 | Clinic Publishing & Dynamic Booking Pause | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | Resilient Interop Directory Sync to `patient-api` | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 5 | Catalog Seeder Isolation & Real Clinic Prioritization | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 6 | Hybrid Gated Intake Access Backend | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 7 | Workspace Governance UI (`portal-web`) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | Clinic Governance & Capacity Workstation (`clinic-app`) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Patient App Discovery of Published Clinics | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 10 | Hybrid Gated Service Catalog UI (`patient-app`) | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 11 | Join Code & QR Scan Unlock Modal (`patient-app`) | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 12 | Design System Compliance & Quality Tokens | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

## Test Architecture
- **Unit & Token Linter Runners**:
  - `bun test packages/design-tokens/src/tokens.test.ts`
  - `node apps/clinic-app/scripts/check-tokens.mjs --strict`
  - `node apps/patient-app/scripts/check-tokens.mjs --strict`
- **TypeScript Typecheck**:
  - `bun run typecheck:all` (or app-specific typechecks)
- **Backend .NET Test Suites**:
  - `dotnet test services/patient-api/ClinicEz.Patient.Application.Tests`
  - `dotnet test services/portal-api/ClinicEz.Portal.Tests`
  - `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | University Health Center (USTP CDO - UHC): Public discovery card, locked service catalog, unlocked via student QR scan / 6-char join code | F1, F2, F3, F4, F6, F9, F10, F11 | High |
| 2 | High-Volume General Walk-In Clinic: Fully published public catalog, dynamic capacity surge triggers "Pause Online Booking", instant status reflection | F1, F2, F3, F4, F8, F9 | Medium |
| 3 | Newly Provisioned Clinic in Private Workspace: Verifies strict default to Draft/Private, attempts to publish blocked until readiness checklist (hours, doctors, services) is 100% satisfied | F1, F2, F3, F7, F8 | Medium |
| 4 | Catalog Seeder Immunity: Service restart in development mode does not purge real synced clinics from PostgreSQL | F4, F5 | Medium |
| 5 | Cross-Tenant Interop Linkage with Restricted Consumer Directory: Workspace enables B2B B2B Public interop routing for lab diagnostics while keeping consumer patient app discovery disabled | F1, F4, F7 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (happy-path isolated feature checks)
- Tier 2: ≥5 boundary & corner test cases per feature (e.g. invalid join codes, expired codes, missing hours, edge states)
- Tier 3: Pairwise coverage of major feature interactions
- Tier 4: ≥5 realistic application scenarios
