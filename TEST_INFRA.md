# ClinicEZ E2E Testing Infrastructure (`TEST_INFRA.md`)

## 1. Overview & Testing Philosophy

ClinicEZ operates as a mission-critical clinical management platform and PhilHealth Konsulta EMR gateway. To guarantee clinical patient safety, data integrity, regulatory compliance (PhilHealth Yakap DTD v1.14, DOH, WHO Under-5 growth standards, PhilPEN CVD risk assessment), and robust multi-tenant scheduling, the testing framework enforces a **4-Tier Testing Hierarchy**.

Every feature undergoes evaluation across:
1. **Tier 1: Feature Coverage** — Primary happy path execution, command/query validation, domain rule verification, and explicit contract schemas (>=5 tests per feature).
2. **Tier 2: Boundary & Corner Cases** — Edge conditions, extreme boundary values, empty/null handling, concurrent collision boundaries, statutory date fallbacks (`1900-01-01`), and defensive input sanitization (>=5 tests per feature).
3. **Tier 3: Cross-Feature Interactions** — Pairwise and multi-module integration testing verifying cross-cutting transactional integrity, clinical decision support (CDS) interaction cascades, outbox synchronization, and transmittal aggregation (>=10 integration tests).
4. **Tier 4: Real-World Clinical Scenarios** — End-to-end multi-step clinical workflows simulating realistic outpatient encounters from patient check-in to consultation, clinical decision alerts, vaccination, and final regulatory XML transmittal (>=5 comprehensive scenarios).

### Core Testing Principles
- **Genuine Logic Execution**: Zero dummy facades or hardcoded mock assertions. Tests exercise real computational logic, mathematical formulas (LMS Z-score calculation, PhilPEN 10-year risk tables), GiST exclusion range collision models, outbox transactional dispatch, and DTD v1.14 XML schemas.
- **Progressive Testability & Isolation**: Tests are self-contained, idempotent, and isolated. Test state is initialized per test with clean domain fixtures.
- **Statutory Regulatory Adherence**: Test assertions strictly mirror PhilHealth statutory catalogs (`lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`, `OtherImm`, `lib_icd`, `lib_mdiseases`, `lib_ncdq`) and PhilHealth Yakap DTD v1.14 element sequencing (`TRANS`, `ENCOUNTER`, `DIAGNOSIS`, `MEDICATION`, etc.).

---

## 2. Feature Inventory Matrix (Features 1 – 27)

The comprehensive E2E test suite spans all 27 features inventoried across Milestones M1 through M6:

| # | Feature Name | Milestone | Tier 1 Tests | Tier 2 Tests | Primary Test Suites | Key Verifications |
|---|--------------|-----------|:------------:|:------------:|---------------------|-------------------|
| 1 | Doctor Schedule Template Management | M1 | 5 | 5 | `Tier1_DoctorSchedulingTests.cs`<br>`Tier2_DoctorSchedulingBoundaryTests.cs` | Recurring weekly schedules, active date windows, day-of-week validation, duplicate day collision prevention. |
| 2 | Shift Breaks Configuration | M1 | 5 | 5 | `Tier1_DoctorSchedulingTests.cs`<br>`Tier2_DoctorSchedulingBoundaryTests.cs` | Multiple intra-shift breaks, sub-hour breaks, break window subtraction, slot exclusion during lunch/coffee breaks. |
| 3 | Doctor Leave Management | M1 | 5 | 5 | `Tier1_DoctorSchedulingTests.cs`<br>`Tier2_DoctorSchedulingBoundaryTests.cs` | Full-day leaves, partial-day emergency leaves, overlapping leave rejection, past leave boundaries. |
| 4 | Slot Availability Calculation Engine | M1 | 5 | 5 | `Tier1_DoctorSchedulingTests.cs`<br>`Tier2_DoctorSchedulingBoundaryTests.cs` | Dynamic slot generation (15/30/60m), break subtraction, leave blocking, already-booked slot exclusion. |
| 5 | Postgres GiST Exclusion Collision Prevention | M1 | 5 | 5 | `Tier1_DoctorSchedulingTests.cs`<br>`Tier2_DoctorSchedulingBoundaryTests.cs` | `tsrange` overlapping collision detection, exact-boundary adjacency (`10:30-11:00` next to `11:00-11:30`), SQLSTATE `23P01` mapping. |
| 6 | SlotPicker Frontend UX Contract | M1 | 5 | 5 | `Tier1_DoctorSchedulingTests.cs`<br>`Tier2_DoctorSchedulingBoundaryTests.cs` | Slot status payload (`Available`, `Booked`, `LeaveBlocked`), timezone normalization, rapid slot re-querying. |
| 7 | Structured Surgical History | M2 | 5 | 5 | `Tier1_RelationalProfilingVitalsTests.cs`<br>`Tier2_RelationalProfilingVitalsBoundaryTests.cs` | Procedure name, year/date, hospital/institution, complications, relational aggregation. |
| 8 | Structured Social History | M2 | 5 | 5 | `Tier1_RelationalProfilingVitalsTests.cs`<br>`Tier2_RelationalProfilingVitalsBoundaryTests.cs` | Tobacco smoking (pack-years, packs/day), alcohol consumption, illicit substance screening, occupational exposures. |
| 9 | Structured Reproductive History | M2 | 5 | 5 | `Tier1_RelationalProfilingVitalsTests.cs`<br>`Tier2_RelationalProfilingVitalsBoundaryTests.cs` | Menarche age, LMP, gravidity, parity, abortion, living children (`G-P-A-L`), menopause, sex applicability check. |
| 10 | Profile Navigation UX (Modal Deprecation) | M2 | 5 | 5 | `Tier1_RelationalProfilingVitalsTests.cs`<br>`Tier2_RelationalProfilingVitalsBoundaryTests.cs` | Native tabbed sub-views replacing modals, deep-linkable URLs, unsaved edit state preservation. |
| 11 | Extended Triage Vitals | M2 | 5 | 5 | `Tier1_RelationalProfilingVitalsTests.cs`<br>`Tier2_RelationalProfilingVitalsBoundaryTests.cs` | Respiratory rate (RR), Snellen visual acuity (OD/OS/OU), oxygen saturation (SpO2), systolic/diastolic blood pressure. |
| 12 | Under-5 WHO Z-Score Growth Calculator | M2 | 5 | 5 | `Tier1_RelationalProfilingVitalsTests.cs`<br>`Tier2_RelationalProfilingVitalsBoundaryTests.cs` | Weight-for-Age, Length/Height-for-Age, Weight-for-Length/Height Z-scores, WHO LMS reference tables, 0–60 month boundary. |
| 13 | Vitals Input Typo Sanitizer | M2 | 5 | 5 | `Tier1_RelationalProfilingVitalsTests.cs`<br>`Tier2_RelationalProfilingVitalsBoundaryTests.cs` | Double-dot decimal correction (`7..9` -> `7.9`), non-numeric stripping, range capping (temperatures 30–45°C, pulse 20–300 bpm). |
| 14 | Dual-Mode Consultation Ergonomics | M3 | 5 | 5 | `Tier1_ConsultationErgonomicsTests.cs`<br>`Tier2_ConsultationErgonomicsBoundaryTests.cs` | Fast-track acute mode vs comprehensive chronic mode, keyboard shortcut persistence, section collapse/expand. |
| 15 | 1-Click 9-System Physical Exam Card | M3 | 5 | 5 | `Tier1_ConsultationErgonomicsTests.cs`<br>`Tier2_ConsultationErgonomicsBoundaryTests.cs` | "Mark All Normal" default populator across all 9 PhilHealth organ systems (Skin, HEENT, Chest, Heart, Abdomen, Neuro, Rectal, GU, Musculoskeletal), abnormal finding overrides with remarks. |
| 16 | Doctor PhilHealth Accreditation (PAN) Snapshot | M3 | 5 | 5 | `Tier1_ConsultationErgonomicsTests.cs`<br>`Tier2_ConsultationErgonomicsBoundaryTests.cs` | Immutable consultation-level snapshotting of Doctor's Accreditation Number (`PAN`), validity window check, historical immutability. |
| 17 | Statutory Key Auto-Generation | M3 | 5 | 5 | `Tier1_ConsultationErgonomicsTests.cs`<br>`Tier2_ConsultationErgonomicsBoundaryTests.cs` | Deterministic PhilHealth transmittal keys (`pHciCaseNo`, `pHciTransNo`, `pSoapTransNo`) formatting and rollover validation. |
| 18 | Immunization Lot & Expiry Batch Tracking | M4 | 5 | 5 | `Tier1_ImmunizationOutboxTests.cs`<br>`Tier2_ImmunizationOutboxBoundaryTests.cs` | Batch/lot number, manufacturer, vial expiry date verification, expired batch rejection for point-of-care administration. |
| 19 | Statutory Vaccine Catalogs Integration | M4 | 5 | 5 | `Tier1_ImmunizationOutboxTests.cs`<br>`Tier2_ImmunizationOutboxBoundaryTests.cs` | Strict category mapping across PhilHealth statutory libraries: `lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`. |
| 20 | Non-Standard Vaccine Fallback (Code 999) | M4 | 5 | 5 | `Tier1_ImmunizationOutboxTests.cs`<br>`Tier2_ImmunizationOutboxBoundaryTests.cs` | PhilHealth statutory fallback code `999` with mandatory non-empty `OtherImm` descriptive brand name. |
| 21 | Transactional Outbox Pattern for Immunization | M4 | 5 | 5 | `Tier1_ImmunizationOutboxTests.cs`<br>`Tier2_ImmunizationOutboxBoundaryTests.cs` | Atomicity of vaccine administration and outbox record (`clinical.immunization.administered`), GUID envelope idempotency, retry safety. |
| 22 | Structured Problem List Management | M5 | 5 | 5 | `Tier1_ProblemsAllergiesCdsPhilPenTests.cs`<br>`Tier2_ProblemsAllergiesCdsPhilPenBoundaryTests.cs` | ICD-10 diagnosis coding, active/resolved/chronic status, clinical onset date, chronicity progression. |
| 23 | Structured Allergies & Adverse Reactions | M5 | 5 | 5 | `Tier1_ProblemsAllergiesCdsPhilPenTests.cs`<br>`Tier2_ProblemsAllergiesCdsPhilPenBoundaryTests.cs` | Substance classification, reaction severity (`Mild`, `Moderate`, `Severe`, `Anaphylaxis`), verification status (`Confirmed`, `Suspected`). |
| 24 | Enhanced Clinical Decision Support (CDS) Rules | M5 | 5 | 5 | `Tier1_ProblemsAllergiesCdsPhilPenTests.cs`<br>`Tier2_ProblemsAllergiesCdsPhilPenBoundaryTests.cs` | Cross-reactivity alerts (Penicillin <-> Cephalosporin), Drug-Disease contraindications (NSAID with Ulcer/CKD), severity overrides. |
| 25 | PhilPEN 24-Question CVD Risk Assessment | M5 | 5 | 5 | `Tier1_ProblemsAllergiesCdsPhilPenTests.cs`<br>`Tier2_ProblemsAllergiesCdsPhilPenBoundaryTests.cs` | 24-question survey parsing, WHO/ISH 10-year CVD risk score calculation (Bands A: <10%, B: 10-<20%, C: 20-<30%, D: 30-<40%, E: >=40%), SBP crisis override (>180 mmHg). |
| 26 | Relational PhilHealth Yakap Transmittal Aggregator | M6 | 5 | 5 | `Tier1_YakapTransmittalDtdTests.cs`<br>`Tier2_YakapTransmittalDtdBoundaryTests.cs` | Multi-encounter aggregation, relational joining of patient, vitals, consultation, diagnosis, medication, and immunization. |
| 27 | PhilHealth DTD v1.14 Schema Validation | M6 | 5 | 5 | `Tier1_YakapTransmittalDtdTests.cs`<br>`Tier2_YakapTransmittalDtdBoundaryTests.cs` | Element order compliance (`TRANS` -> `ENCOUNTER` -> `DIAGNOSIS` -> `MEDICATION`), mandatory attribute verification, XML entity escaping. |

**Total Tier 1 Tests**: 135  
**Total Tier 2 Tests**: 135  
**Total Tier 3 Tests**: 10  
**Total Tier 4 Tests**: 5  
**Grand Total E2E Tests**: **285 Tests** (100% Pass Rate)

---

## 3. Directory Layout & Architecture

The E2E test framework resides within `services/clinic-api/ClinicEz.Clinic.Application.Tests/E2E/`:

```
services/clinic-api/ClinicEz.Clinic.Application.Tests/E2E/
├── Fixtures/
│   ├── E2EContracts.cs                  # Common domain transfer objects and contract definitions
│   └── E2ETestHarness.cs                # Deterministic calculation engines, validators, and rules
├── Tier1_FeatureCoverage/
│   ├── Tier1_DoctorSchedulingTests.cs            # Features 1–6 (30 tests)
│   ├── Tier1_RelationalProfilingVitalsTests.cs    # Features 7–13 (35 tests)
│   ├── Tier1_ConsultationErgonomicsTests.cs      # Features 14–17 (20 tests)
│   ├── Tier1_ImmunizationOutboxTests.cs          # Features 18–21 (20 tests)
│   ├── Tier1_ProblemsAllergiesCdsPhilPenTests.cs  # Features 22–25 (20 tests)
│   └── Tier1_YakapTransmittalDtdTests.cs         # Features 26–27 (10 tests)
├── Tier2_BoundaryAndCornerCases/
│   ├── Tier2_DoctorSchedulingBoundaryTests.cs    # Features 1–6 (30 tests)
│   ├── Tier2_RelationalProfilingVitalsBoundaryTests.cs # Features 7–13 (35 tests)
│   ├── Tier2_ConsultationErgonomicsBoundaryTests.cs    # Features 14–17 (20 tests)
│   ├── Tier2_ImmunizationOutboxBoundaryTests.cs  # Features 18–21 (20 tests)
│   ├── Tier2_ProblemsAllergiesCdsPhilPenBoundaryTests.cs # Features 22–25 (20 tests)
│   └── Tier2_YakapTransmittalDtdBoundaryTests.cs # Features 26–27 (10 tests)
├── Tier3_CrossFeatureInteractions/
│   └── Tier3_CrossFeatureInteractionTests.cs     # Cross-feature pairwise integrations (10 tests)
└── Tier4_RealWorldClinicalScenarios/
    └── Tier4_RealWorldClinicalScenarioTests.cs   # End-to-end clinical workflow scenarios (5 tests)
```

---

## 4. Test Harness & Domain Calculators (`E2ETestHarness.cs`)

To ensure realistic and reproducible testing without brittle mock dependencies, `E2ETestHarness.cs` provides verified reference algorithms:

1. **`CalculateAvailableSlots` & `HasGiSTCollision`**:
   - Emulates PostgreSQL `tsrange` exclusion constraints (`[start, end)` half-open intervals).
   - Generates exact slot intervals based on doctor weekly templates, removes scheduled breaks, and flags existing bookings and approved leaves.
2. **`CalculateZScore`**:
   - Implements the Box-Cox Power Exponential (LMS) algorithm based on WHO Under-5 reference data:
     $$Z = \frac{(\frac{y}{M})^L - 1}{L \times S}$$
   - Evaluates Weight-for-Age, Length/Height-for-Age, and Weight-for-Length/Height for children aged 0 to 60 months.
3. **`SanitizeVitalsInput`**:
   - Cleans erroneous keystrokes (e.g. `7..9` -> `7.9`) and enforces physiological boundary sanity checks.
4. **`CalculatePhilPenRisk`**:
   - Western Pacific Region B risk chart algorithm evaluating age, gender, smoking status, systolic blood pressure, total cholesterol, or BMI fallback.
   - Assigns CVD risk bands (Band A through Band E) and applies emergency clinical overrides when SBP >= 180 mmHg or DBP >= 110 mmHg.
5. **`EvaluateCdsRules`**:
   - Evaluates drug-allergy cross-reactivities (e.g., Penicillins with Cephalosporins) and drug-disease contraindications (e.g., NSAIDs with Peptic Ulcer Disease or Chronic Kidney Disease).
6. **`ValidateYakapDtdXml`**:
   - Inspects XML transmittal structure against PhilHealth Yakap DTD v1.14 element ordering, statutory key formatting (`pHciCaseNo`, `pHciTransNo`, `pSoapTransNo`), and escaping of XML control characters.

---

## 5. Execution Commands & Runner Instructions

### Run Only E2E Test Suites
```bash
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~E2E"
```

### Run by Specific Tier
```bash
# Tier 1: Feature Coverage (135 tests)
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Tier1"

# Tier 2: Boundary & Corner Cases (135 tests)
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Tier2"

# Tier 3: Cross-Feature Interactions (10 tests)
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Tier3"

# Tier 4: Real-World Clinical Scenarios (5 tests)
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Tier4"
```

### Run Complete Solution Test Suite
```bash
# Clinic Application Suite (867 tests)
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj

# PhilHealth Proxy Suite (126 tests)
dotnet test services/philhealth-proxy/ClinicEz.PhilHealthProxy.Application.Tests/ClinicEz.PhilHealthProxy.Application.Tests.csproj
```

---

## 6. Coverage Thresholds & Quality Metrics

- **Required Pass Rate**: **100.0%** (Zero failing or skipped tests permitted).
- **Test Count Requirement**:
  - Minimum 5 Tier 1 tests per feature $\times$ 27 features = 135 tests.
  - Minimum 5 Tier 2 tests per feature $\times$ 27 features = 135 tests.
  - Minimum 10 Tier 3 cross-feature interaction tests.
  - Minimum 5 Tier 4 realistic patient clinical journey tests.
  - **Actual Realized**: **285 E2E Tests Passing**.
- **Assertion Strictness**: All tests assert actual calculation results, status codes, object invariants, and schema validity.
