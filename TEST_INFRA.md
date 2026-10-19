# E2E Test Infra: Universal Pluggable Search Provider Framework

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests are derived strictly from user requirements in `ORIGINAL_REQUEST.md` and user-facing specifications, with zero coupling to implementation internals.
- **Methodology**: Systematic 4-tier testing combining Category-Partition, Boundary Value Analysis, Pairwise Combinatorial Testing, and Real-World Workload Testing.
- **Independence**: The E2E test suite validates the system through public HTTP endpoints (`GET /api/v1/search`), TypeScript exported registries (`universalSearchRegistry`), and workstation UI command palette interactions without internal database patching or private member access.

---

## Feature Inventory & Test Mapping
| # | Feature | Requirement Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-------------------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | `ISearchProvider` & Shared Contracts | R1 | 5 | 5 | ✓ | ✓ |
| 2 | Reflection Assembly Scanning | R1, R2 | 5 | 5 | ✓ | ✓ |
| 3 | Shared TS Registry & Contributor | R1 | 5 | 5 | ✓ | ✓ |
| 4 | Concurrent `Task.WhenAll` Execution | R2 | 5 | 5 | ✓ | ✓ |
| 5 | Multi-Tenant Clinic Isolation | R2 | 5 | 5 | ✓ | ✓ |
| 6 | Staff RBAC Permission Gating | R2 | 5 | 5 | ✓ | ✓ |
| 7 | `PatientSearchProvider` | R2 | 5 | 5 | ✓ | ✓ |
| 8 | `ConsultationSearchProvider` | R2 | 5 | 5 | ✓ | ✓ |
| 9 | `AppointmentSearchProvider` | R2 | 5 | 5 | ✓ | ✓ |
| 10 | `QueueSearchProvider` | R2 | 5 | 5 | ✓ | ✓ |
| 11 | `LabOrderSearchProvider` | R2 | 5 | 5 | ✓ | ✓ |
| 12 | `BillingSearchProvider` | R2 | 5 | 5 | ✓ | ✓ |
| 13 | `SettingSearchProvider` | R2 | 5 | 5 | ✓ | ✓ |
| 14 | `SearchController` REST Endpoint | R2 | 5 | 5 | ✓ | ✓ |
| 15 | Header Search Trigger Pill | R3 | 5 | 5 | ✓ | ✓ |
| 16 | Workstation Hotkeys (`Cmd+K`, `/`, `Esc`) | R3 | 5 | 5 | ✓ | ✓ |
| 17 | Debounced 200ms Execution | R3 | 5 | 5 | ✓ | ✓ |
| 18 | Command Palette 4 UI States | R3 | 5 | 5 | ✓ | ✓ |
| 19 | Dynamic Category Filter Tabs | R3 | 5 | 5 | ✓ | ✓ |
| 20 | Keyboard Up/Down & Enter Navigation | R3 | 5 | 5 | ✓ | ✓ |
| 21 | Deep Navigation Dispatching | R4 | 5 | 5 | ✓ | ✓ |
| 22 | Urgency Badges & Design Tokens | R3 | 5 | 5 | ✓ | ✓ |
| 23 | Portal Web Cross-App Integration | R4 | 5 | 5 | ✓ | ✓ |

---

## Test Architecture
- **E2E Test Runners**:
  - Backend Suite: `packages/shared-dotnet.Tests` and `services/clinic-api/ClinicEz.Clinic.Application.Tests` (`dotnet test`)
  - Shared TS Suite: `packages/shared-ts/search.test.ts` (`bun test packages/shared-ts`)
  - Clinic Workstation Suite: `apps/clinic-app/tests/globalSearchModal.test.ts` (`bun test apps/clinic-app/tests/globalSearchModal.test.ts`)
  - Design Token Guard: `node apps/clinic-app/scripts/check-tokens.mjs --strict`
  - Portal Web Suite: `apps/portal-web/tests/workspaceSearchDialog.test.tsx` (`bun --filter @clinicez/portal-web test`)
- **Pass / Fail Semantics**:
  - Exit code `0` on all runners.
  - Zero unhandled exceptions.
  - Latency under 150ms for concurrent provider aggregation.
  - Zero design token violations.

---

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| 1 | **Emergency Patient Triage Lookup**: Nurse presses `Cmd+K`, types patient name or PhilHealth PIN, immediately sees patient code and urgent allergy alerts, presses Enter to open patient chart. | F7, F15, F16, F21, F22 | Patient chart opens with triage details loaded under 150ms. |
| 2 | **Critical Lab Panic Alert Discovery**: Doctor opens search with `/`, queries "panic" or abnormal lab order number, spots `emergency` red badge `"PANIC"`, navigates directly to `ResultReview`. | F11, F16, F20, F21, F22 | Deep links to lab result review with panic readback alert visible. |
| 3 | **Receptionist Queue & Appointment Handoff**: Front desk receptionist searches queue ticket `"Q-001"`, views patient status and station assignment, switches category tab to Appointments to check scheduling. | F9, F10, F18, F19, F20 | Dynamic category filter switches instantly without refetching unrelated categories. |
| 4 | **Administrator Services Catalog Fee Update**: Clinic admin uses search to jump directly to `"Services"`, queries price or PhilHealth benefit code, presses Enter to navigate to `Settings` -> `services` tab. | F13, F16, F20, F21 | Settings screen opens directly on `services` tab with active catalog item focused. |
| 5 | **Cashier Invoice Clearance**: Cashier types invoice number `"INV-2026-00001"`; system displays unpaid amount with `urgent` badge; clinician lacking `BillingRead` permission gets 0 billing results. | F5, F6, F12, F21, F22 | Strict permission filtering verified; authorized cashier navigates to Billing invoice. |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 test cases per feature (23 features × 5 = 115 tests minimum).
- **Tier 2 (Boundary & Corner Cases)**: ≥5 test cases per feature (empty strings, whitespace, null parameters, SQL wildcards, long strings, rapid hotkey toggles, special regex chars).
- **Tier 3 (Cross-Feature Combinations)**: Pairwise coverage across category filtering + permissions + deep navigation params + keyboard selection.
- **Tier 4 (Real-World Workloads)**: 5 comprehensive clinical workflow scenarios.
- **Acceptance Criterion**: Test suite publishable as `TEST_READY.md` once all test cases are executed and passing.
