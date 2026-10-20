# E2E Test Infra: Clinic Analytics and Statutory Reports Hardening

## 1. Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests are derived strictly from user requirements in `ORIGINAL_REQUEST.md` (specifically `## 2026-10-20T02:23:38Z`) and architectural specifications in `PROJECT.md`, completely independent of internal implementation details.
- **Progressive Testability & Decoupled Verification**: Validates the public REST contracts, strongly-typed DTOs, aggregation algorithms, cryptographic verification stamps, responsive SVG charting components, and workstation workflows without fragile internal coupling.
- **Systematic 4-Tier Methodology**:
  - **Tier 1: Feature Coverage (Category-Partition)**: ≥5 test cases per feature covering primary behavior and happy paths across all 42 features (≥210 test cases).
  - **Tier 2: Boundary Value Analysis (BVA) & Corner Cases**: ≥5 test cases per feature covering edge conditions: empty datasets, zero balances, negative ranges, leap years, maximum amounts, special characters, and division-by-zero resilience (≥210 test cases).
  - **Tier 3: Pairwise Combinations (Combinatorial Testing)**: Multi-dimensional interactions across date windows, filters, chart toggles, tender modes, and PDF generators.
  - **Tier 4: Real-World Workload Scenarios**: 5 end-to-end clinical and statutory workflows mirroring real-world facility operations.

---

## 2. Feature Inventory & Test Mapping (All 42 Features)

| # | Feature | Milestone | Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-----------|--------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | Remove Analytics Mock Wait/Consult Durations | M1 | R1 | 5 | 5 | ✓ | ✓ |
| 2 | Remove Analytics Mock Diagnoses | M1 | R1 | 5 | 5 | ✓ | ✓ |
| 3 | Remove Morbidity Mock Diseases & Demographics | M1 | R1 | 5 | 5 | ✓ | ✓ |
| 4 | Remove Hardcoded Clinic Name | M1 | R1 | 5 | 5 | ✓ | ✓ |
| 5 | Remove Tax Discount Mock Invoices | M1 | R1 | 5 | 5 | ✓ | ✓ |
| 6 | Remove Doctor Shares Mock Doctors & Hardcoded Fee | M1 | R1 | 5 | 5 | ✓ | ✓ |
| 7 | Add DefaultDoctorSharePercentage to ClinicSettings | M1 | R1 | 5 | 5 | ✓ | ✓ |
| 8 | Server-Side EF Core Aggregations for Daily EOD | M1 | R2 | 5 | 5 | ✓ | ✓ |
| 9 | Server-Side EF Core Aggregations for Analytics | M1 | R2 | 5 | 5 | ✓ | ✓ |
| 10 | Server-Side EF Core Aggregations for Morbidity | M1 | R2 | 5 | 5 | ✓ | ✓ |
| 11 | Server-Side EF Core Aggregations for Tax Discounts | M1 | R2 | 5 | 5 | ✓ | ✓ |
| 12 | Server-Side EF Core Aggregations for Doctor Shares | M1 | R2 | 5 | 5 | ✓ | ✓ |
| 13 | Composite Temporal Indexes in ApplicationDbContext | M1 | R2 | 5 | 5 | ✓ | ✓ |
| 14 | PaymentRecord Global Query Filter | M1 | R2 | 5 | 5 | ✓ | ✓ |
| 15 | Backend Empty-Dataset Test Suite | M1 | R1 | 5 | 5 | ✓ | ✓ |
| 16 | TenantPrintoutConfig TIN Support | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 17 | IClinicDocumentPdfService Reports Extension | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 18 | Daily EOD Reconciliation QuestPDF Builder | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 19 | DOH Outpatient Morbidity QuestPDF Builder | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 20 | BIR Tax & Discount Audit QuestPDF Builder | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 21 | Doctor Shares Settlement QuestPDF Builder | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 22 | Executive Clinic Analytics QuestPDF Builder | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 23 | Cryptographic Tamper Seal & Security Digest | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 24 | Embedded QR Verification Code | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 25 | ReportsController 5 Streaming PDF Endpoints | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 26 | Backend QuestPDF Generation Tests | M2 | R4 | 5 | 5 | ✓ | ✓ |
| 27 | TrendLineChart SVG Component | M3 | R3 | 5 | 5 | ✓ | ✓ |
| 28 | WorkloadBarChart SVG Component | M3 | R3 | 5 | 5 | ✓ | ✓ |
| 29 | TenderDonutChart SVG Component | M3 | R3 | 5 | 5 | ✓ | ✓ |
| 30 | MorbidityDistributionChart SVG Component | M3 | R3 | 5 | 5 | ✓ | ✓ |
| 31 | Pure SVG & Zero External Chart Library | M3 | R3 | 5 | 5 | ✓ | ✓ |
| 32 | Design Token Audit Compliance | M3 | R3 | 5 | 5 | ✓ | ✓ |
| 33 | Network Isolation Audit Compliance | M3 | R3 | 5 | 5 | ✓ | ✓ |
| 34 | Chart Components Unit Tests | M3 | R3 | 5 | 5 | ✓ | ✓ |
| 35 | Full-Width Desktop Workstation Layout | M4 | R3 | 5 | 5 | ✓ | ✓ |
| 36 | Analytics Tab Charting Integration | M4 | R3 | 5 | 5 | ✓ | ✓ |
| 37 | Frontend PDF Streaming URL Helpers | M4 | R4 | 5 | 5 | ✓ | ✓ |
| 38 | Elimination of Legacy Monospace Print Dialog | M4 | R4 | 5 | 5 | ✓ | ✓ |
| 39 | 1-Click Vector PDF Export & Print | M4 | R4 | 5 | 5 | ✓ | ✓ |
| 40 | Dashboard Analytics Integration Tests | M4 | R3 | 5 | 5 | ✓ | ✓ |
| 41 | E2E Test Suite (Tiers 1-4) Pass | M5 | R1-R4 | 5 | 5 | ✓ | ✓ |
| 42 | Tier 5 Adversarial Coverage Hardening | M5 | R1-R4 | 5 | 5 | ✓ | ✓ |

---

## 3. Test Architecture & Runner Infrastructure

### 3.1 Test Suite Directory Layout
```
apps/clinic-app/tests/
├── e2e/
│   ├── analyticsReportsE2E.test.ts        # Comprehensive E2E Test Suite (Tiers 1-4)
│   ├── fixtures/                          # Synthetic real-world operational payloads
│   │   ├── eodReconciliationFixture.ts
│   │   ├── morbidityReportFixture.ts
│   │   ├── taxDiscountAuditFixture.ts
│   │   ├── doctorSharesFixture.ts
│   │   └── clinicAnalyticsFixture.ts
```

### 3.2 Test Execution Command
The authoritative E2E test suite is executed using `bun test` in the clinic app environment:
```bash
export PATH="$HOME/.bun/bin:$HOME/.dotnet:$PATH"
bun test apps/clinic-app/tests/e2e/analyticsReportsE2E.test.ts
```

### 3.3 Pass / Fail Semantics
- **Zero Failures**: Exit code `0` required.
- **Deterministic Math**: Centavo-exact balancing across all monetary aggregations (`Gross = Net + Discounts`, `PhysicianShare + FacilityShare = Gross`).
- **Cryptographic Invariance**: Canonical HMAC-SHA256 digests must match across identical datasets and differ on 1-centavo mutations.
- **Zero Network Drift**: All charts and report generators operate 100% offline without remote asset fetching.
- **Design Tokens Compliance**: 0 raw hex color literals allowed in new UI code (`bun run lint:tokens`).

---

## 4. Real-World Application Scenarios (Tier 4)

### Scenario 1: Daily End-of-Day (EOD) Reconciliation Workflow
- **Clinical Context**: Front-desk supervisor and cashier close clinic operations at 18:00.
- **Workflow**:
  1. Cashier queries `getDailyEodReport(today)`.
  2. Verifies Patient Census: Total Checked In (45), Walk-Ins (30), Appointments (15), Completed (45), Waiting/InConsultation (0).
  3. Verifies Cash in Drawer matches physical cash count (`₱18,450.00`).
  4. Validates Tender Breakdown: Cash (`₱18,450.00`), GCash (`₱12,300.00`), Maya (`₱6,150.00`), Card (`₱15,000.00`).
  5. Confirms zero unpaid balance discrepancies (`totalUnpaidBalances == ₱0.00`).
  6. Cashier clicks "Export PDF" -> streams vector PDF with institutional letterhead, TIN, and dual signature blocks (Cashier and Medical Director).
- **Features Tested**: F1, F4, F8, F14, F18, F23, F24, F37, F38, F39.

### Scenario 2: DOH Outpatient Morbidity Statutory Compliance
- **Clinical Context**: Quarterly epidemiological report submitted to DOH Regional Health Office.
- **Workflow**:
  1. Medical records officer selects date range `2026-01-01` to `2026-03-31` on Morbidity Tab.
  2. Backend aggregates 1,250 patient encounters directly at database layer.
  3. Diagnoses grouped into ICD-10 disease categories (J06.9 Acute URI, I10 Essential Hypertension, E11.9 Type 2 Diabetes, K29.7 Gastritis).
  4. Demographic age cohorts (Pediatric 0-17, Adult 18-59, Senior 60+) and sex cohorts (Male, Female) sum exactly to total cases for every row.
  5. UI renders `MorbidityDistributionChart` with interactive cohort filters.
  6. Generates multi-page vector PDF containing statutory DOH header, repeating column headers, and Medical Director certification stamp.
- **Features Tested**: F3, F4, F10, F19, F23, F24, F30, F31, F37, F39.

### Scenario 3: BIR Tax & Statutory Discount Audit
- **Clinical Context**: Annual Bureau of Internal Revenue (BIR) tax audit under RA 9994 (Senior Citizens) and RA 10754 (PWD).
- **Workflow**:
  1. Compliance officer queries `getTaxDiscountAuditReport` for statutory audit window.
  2. Verifies all discounted invoices carry valid Senior OSCA ID or PWD ID numbers.
  3. Audits calculation: 20% statutory discount applied, 12% VAT exemption calculated on net sales.
  4. Validates Official Receipt (OR) numbering continuity (`OR-20260101-001` through `OR-20260331-892`).
  5. Confirms gross sales balance with net collections + total discounts granted.
  6. Streams official BIR Audit Vector PDF with embedded QR code and HMAC-SHA256 security digest.
- **Features Tested**: F5, F11, F16, F20, F23, F24, F25, F37, F39.

### Scenario 4: Doctor Revenue Shares Settlement
- **Clinical Context**: Monthly physician payout and clinic facility retention computation.
- **Workflow**:
  1. Clinic accountant opens Doctor Shares settlement screen for previous month.
  2. Queries `getDoctorSharesReport`.
  3. Verifies consultation encounter counts, procedure assistance, and total gross generated per physician.
  4. Calculates physician shares based on configurable `ClinicSettings.DefaultDoctorSharePercentage` (70%) and custom doctor contractual overrides.
  5. Confirms mathematical integrity: `TotalPhysicianShares + TotalFacilityShares == TotalClinicGrossRevenue`.
  6. Exports QuestPDF Settlement Report featuring individual physician breakdown and disbursement sign-off sheets.
- **Features Tested**: F6, F7, F12, F21, F23, F24, F25, F28, F37, F39.

### Scenario 5: Executive Clinic Analytics Review
- **Clinical Context**: Executive Board conducts monthly clinical operations and financial review.
- **Workflow**:
  1. Executive logs into ClinicEZ desktop workstation (width ≥1024px, full-width responsive layout).
  2. Navigates to modern Analytics Tab.
  3. Reviews high-level KPI cards: Gross Revenue (`₱485,200.00`), Net Collections (`₱460,000.00`), Average Ticket (`₱1,150.00`), Average Wait Time (`11.2 min`), Average Consult Time (`16.8 min`).
  4. Interacts with `TrendLineChart` (toggling Revenue vs Visits), `TenderDonutChart` (inspecting digital wallet vs cash share), `WorkloadBarChart` (inspecting physician volume), and `MorbidityDistributionChart` (inspecting epidemiological trends).
  5. Clicks "Export Analytics Executive Summary" to stream print-ready QuestPDF vector document.
- **Features Tested**: F1, F2, F9, F22, F23, F24, F27, F28, F29, F30, F31, F35, F36, F37, F39.

---

## 5. Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 test cases per feature (42 features × 5 = 210 test cases minimum).
- **Tier 2 (Boundary & Corner Cases)**: ≥5 test cases per feature (42 features × 5 = 210 test cases minimum: empty datasets, zero balances, negative ranges, leap years, maximum amounts, special characters, extreme values, division-by-zero resilience).
- **Tier 3 (Cross-Feature Combinations)**: Multi-dimensional combinations across date ranges, filters, chart modes, tender methods, and PDF streaming endpoints (≥20 test cases).
- **Tier 4 (Real-World Scenarios)**: 5 comprehensive clinical and statutory workflows (≥10 test cases).
- **Total Minimum Target**: ≥450 test assertions executed across the test harness.
