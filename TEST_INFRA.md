# E2E Test Infra: Clinic-Wide Audit Log and Forensic Activity Trail

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Regulatory Auditing Workloads.
- Philippine Data Privacy Act (RA 10173) & HIPAA compliance verification.
- Immutability and multi-tenant facility isolation verification.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | WORM Immutability Guard | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 2 | Multi-Tenant Clinic Isolation | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 3 | Medical Prose Redaction Engine | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | Authentication Secrets Sanitization | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Patient Identity Masking | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Structural Forensic Metadata Preservation | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Security & Auth Interception | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 8 | Clinic Administration Interception | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 9 | Patient Access & Directory Interception | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 10 | Appointments & Queue Interception | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 11 | Clinical Care & EMR Interception | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 12 | Billing & Cashier Interception | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 13 | PhilHealth Yakap Statutory Interception | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 14 | Auditing the Auditor | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 15 | RBAC Permissions & Query Gating | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 16 | Admin Workstation Navigation & Routing | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 17 | Categorized Multi-Filter Controls | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 18 | Severity Visual Coding (@clinicez/design-tokens) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 19 | Defensive States & Date Bounds | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 20 | Desktop Inspection Drawer (>=1024px) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 21 | Backward Cursor Pagination (before) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 22 | Strict Token Compliance (0 hex literals) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- Test Runner:
  - Backend: `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj`
  - Frontend: `bun test apps/clinic-app/tests/auditWorkstation.test.ts`
  - Token Audit: `node apps/clinic-app/scripts/check-tokens.mjs --strict`
- Test Case Formats:
  - xUnit + FluentAssertions for backend C# tests
  - Bun test runner for TypeScript React Native tests
- Directory Layout:
  - Backend: `services/clinic-api/ClinicEz.Clinic.Application.Tests/Features/Audit/`
  - Frontend: `apps/clinic-app/tests/`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Clinical Encounter & PhilHealth Transmittal Audit Trail | F1.4, F1.5, F1.7, F2.1, F2.4, F2.5 | High |
| 2 | Cashier Void & Refund Regulatory Compliance Audit | F1.6, F2.5, F3.3, F3.5 | High |
| 3 | Compromised Staff Account Forensic Investigation | F1.1, F2.3, F3.2, F3.3, F3.5 | High |
| 4 | External DPO / NPC Compliance Audit Export | F1.8, F2.1, F2.4, F3.6, F4.2 | High |
| 5 | Cross-Facility Multi-Tenant Data Leakage Attack | F2.6, F4.3, F5.1 | Critical |

## Coverage Thresholds
- Tier 1: >=5 per feature (Happy path)
- Tier 2: >=5 per feature (Boundary, corner cases, error inputs)
- Tier 3: Pairwise coverage of cross-feature interactions
- Tier 4: >=5 realistic clinic audit scenarios
