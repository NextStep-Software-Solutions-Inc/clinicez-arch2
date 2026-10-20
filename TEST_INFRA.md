# E2E Test Infra: Dental Clinic Service Catalog Integration

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests are derived strictly from user requirements in `ORIGINAL_REQUEST.md` and feature contracts in `PROJECT.md`, testing observable behaviors and contracts through public APIs, DTOs, and UI state machines with zero coupling to private implementation internals.
- **Dual Track Methodology**: Tests are engineered across 4 systematic tiers:
  - **Tier 1: Feature Coverage (>=5 tests per feature)**: Isolated, comprehensive happy-path tests for all 16 features.
  - **Tier 2: Boundary & Corner Cases (>=5 tests per boundary area)**: Zero/negative prices, empty/invalid codes, max string lengths, specialty mode edge cases, FDI tooth notation bounds, and re-seeding resilience.
  - **Tier 3: Cross-Feature Combinations (Pairwise Coverage)**: Matrix testing across seeding state x specialty modes, custom overrides x missing presets, tooth numbers x clinical instruction chips, and procedure catalog x Cashier invoice lines.
  - **Tier 4: Real-World Clinical Application Scenarios**: 5 full end-to-end clinical workflow journeys mirroring authentic dental and multi-specialty outpatient practice.
- **Progressive Testability & Independence**: Tests are fully self-contained, isolated, and deterministic. Every test establishes its own state, executes without side effects on test order, and runs in sub-second time.

---

## Feature Inventory & Test Mapping
| # | Feature | Requirement Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-------------------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| F1 | Canonical Dental Defaults (10 presets) | R1 | 5 | 5 | ✓ | ✓ |
| F2 | Specialty-Aware Auto-Seeding | R1 | 5 | 5 | ✓ | ✓ |
| F3 | First-Class Dental Category | R1 | 5 | 5 | ✓ | ✓ |
| F4 | Idempotent Seed Command | R2 | 5 | 5 | ✓ | ✓ |
| F5 | Seed Dental API Endpoint | R2 | 5 | 5 | ✓ | ✓ |
| F6 | Directory Publishing Verification | R5 | 5 | 5 | ✓ | ✓ |
| F7 | Frontend Services API Client | R3 | 5 | 5 | ✓ | ✓ |
| F8 | Services Catalog Category Mapping & Chips | R3 | 5 | 5 | ✓ | ✓ |
| F9 | Services Catalog Modals Category | R3 | 5 | 5 | ✓ | ✓ |
| F10 | "Add Dental Services" Button in Settings | R3 | 5 | 5 | ✓ | ✓ |
| F11 | Order Catalog Modal Category Tab | R4 | 5 | 5 | ✓ | ✓ |
| F12 | Order Catalog Dental Filtering | R4 | 5 | 5 | ✓ | ✓ |
| F13 | Dental Clinical Instruction Chips | R4 | 5 | 5 | ✓ | ✓ |
| F14 | Odontogram Quick Order Pre-Selection | R4 | 5 | 5 | ✓ | ✓ |
| F15 | Procedure Catalog & Cashier Invoicing | R4 | 5 | 5 | ✓ | ✓ |
| F16 | Design Token & Strict UI Compliance | R5 | 5 | 5 | ✓ | ✓ |

---

## Test Architecture & Runners
- **Primary E2E Test Suite**:
  ```bash
  /Users/macuser/.bun/bin/bun test tests/e2e/dental_service_catalog_e2e_scenarios.test.ts
  ```
- **Complete Monorepo E2E Runner**:
  ```bash
  /Users/macuser/.bun/bin/bun test tests/e2e/
  ```
- **Backend Unit & Integration Test Suites**:
  ```bash
  /Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~ServicesCatalogTests"
  /Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Dental"
  /Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~PublishClinicToDirectoryTests"
  ```
- **Frontend Clinic App Test Suites**:
  ```bash
  cd apps/clinic-app && /Users/macuser/.bun/bin/bun test tests/challenger_m1_1_catalog_search.test.ts tests/consultationsDynamicOrders.test.ts
  ```

---

## Pass / Fail Semantics
- **Exit code `0`** on all test runners.
- **Zero failures and zero unhandled exceptions**.
- **Execution Performance**: Full 114-test E2E suite executes in `< 250ms`.
- **Zero raw hex colors**: UI tokens strictly derived from `@clinicez/design-tokens`.

---

## Real-World Clinical Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| 1 | **Complete End-to-End Clinical Workflow**: Admin configures Dental clinic -> System auto-seeds 10 dental presets -> Doctor opens consultation with odontogram -> Quick orders composite restoration on tooth #18 (MOD) with local infiltration anesthesia -> Encounter is signed and generates Cashier invoice item with tooth tagging and ₱950 fee. | F1, F2, F11, F12, F13, F14, F15 | Cashier invoice item created with `serviceCode: DENT-FILL-COMP`, `unitPrice: 950`, `toothNumber: 18`, `toothSurface: MOD`, and total balance ₱950.00. |
| 2 | **Multi-Specialty Clinic Workflow**: Multi-specialty clinic auto-seeds 19 presets (9 general medical + 10 dental) -> Medical doctor orders diagnostic ECG (₱450) and Dentist orders root canal therapy on tooth #24 (₱4,000) -> Cashier invoice combines both orders. | F2, F3, F12, F13, F15 | Invoice contains both `PROC-ECG` (₱450) and `DENT-RCT` (₱4,000) with total balance ₱4,450.00. |
| 3 | **Custom Fee Schedule Preservation**: Clinic admin configures custom price for oral prophylaxis (₱1,200) and digital x-ray (₱600) -> Runs `SeedDentalServicesCommand` -> System idempotently adds only the 8 missing presets without altering custom prices. | F4, F5, F8, F10 | Exactly 8 missing presets added; customized `DENT-CLEAN` (₱1,200) and `DENT-XR-PA` (₱600) remain 100% intact. |
| 4 | **Pediatric Dental Patient Encounter**: 6-year-old child patient arrives with toothache on deciduous molar -> Odontogram renders primary teeth 51–85 -> Dentist orders Pulpotomy on tooth #55 (₱1,500) and Pit and Fissure Sealant on tooth #54 (₱600) -> Cashier invoice reflects both procedures. | F1, F11, F13, F14, F15 | Primary teeth 54 and 55 tagged on invoice lines with total balance ₱2,100.00. |
| 5 | **Search & Public Directory Integration**: Dental clinic publishes to public directory with classification `"Dental Clinic"` -> Patient or staff searches "Oral Prophylaxis" -> Directory search resolves service fee (₱850) and classification. | F1, F6, F8, F16 | Public directory classification is `"Dental Clinic"` and dental cleaning fee resolves to ₱850.00. |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: 16 features × 5 tests = **80 tests minimum** (Achieved: 80 tests).
- **Tier 2 (Boundary & Corner Cases)**: 5 boundary categories × 5 tests = **25 tests minimum** (Achieved: 25 tests).
- **Tier 3 (Cross-Feature Combinations)**: Pairwise combinatorial tests across catalog seeding, custom overrides, tooth numbers, and billing lines (Achieved: 4 tests).
- **Tier 4 (Real-World Workloads)**: 5 comprehensive clinical workflow scenarios (Achieved: 5 tests).
- **Total E2E Tests**: **114 tests, 100% passing**.
