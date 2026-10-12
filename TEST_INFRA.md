# ClinicEZ Custom Metadata Engine — Test Infrastructure Specification (TEST_INFRA.md)

**Document Version:** 1.0.0  
**Target Milestone:** Dual-Track E2E Quality Assurance (Generic Entity Custom Metadata Engine)  
**Applicable Services:** `apps/clinic-app`, `services/clinic-api`, `apps/portal-web`  
**Authoritative Specifications:** `PROJECT.md`, `ORIGINAL_REQUEST.md` (## 2026-10-12T18:55:51Z)  

---

## 1. Executive Summary & Testing Philosophy

The ClinicEZ Generic Entity Custom Metadata Engine provides a dynamic, tenant-scoped, and schema-flexible mechanism for clinical administrators to define custom questions, enforce conditional visibility rules, orchestrate cascading select dropdowns, and install pre-built template bundles across all patient intake, registration, and chart workflows.

To assure absolute system integrity without coupling tests to implementation internals, the Quality Assurance track employs a **Dual-Track, Requirement-Driven, Opaque-Box Testing Strategy** founded on a **4-Tier Testing Methodology** (with Tier 5 Adversarial Hardening):

1. **Opaque-Box Verification:** Tests assert strictly against public API contracts, DOM/React-Native behavioral events, and CQRS request/response boundaries. Tests never access private variables or internal implementation details.
2. **Deterministic Output Derivation:** Every expected outcome is directly derived from the documented specifications in `PROJECT.md` and `ORIGINAL_REQUEST.md`.
3. **Progressive Testability:** Suites are engineered to validate interface contracts cleanly, enabling independent execution across frontend (`bun test`) and backend (`dotnet test`).
4. **Zero Regressions & Escaping Integrity:** Full verification across boundary conditions, cross-tenant isolation, Unicode/escaping fidelity, and malformed inputs.

---

## 2. 4-Tier (+ Tier 5) Testing Methodology

```
┌────────────────────────────────────────────────────────────────────────┐
│             Tier 5: Adversarial Hardening & Security Stress             │
│   (JSON injection, cyclicity detection, extreme payload stress, tokens) │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 4: Real-World Clinical & Educational Scenarios        │
│   (USTP Student Onboarding, Corporate Health Exam, Specialty OB-GYN)   │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 3: Cross-Feature Integration & Cascade Chains         │
│   (Reordering -> Rendering -> Visibility -> Cascading -> Sanitization)  │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 2: Boundary & Corner Cases (>= 5 per Feature)         │
│   (Nulls, empty strings, max lengths, missing parent keys, rapid taps) │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 1: Feature Coverage (>= 5 per Feature)                │
│   (Primary happy-path behavioral verification for Features 1 through 19)│
└────────────────────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage (>= 5 Tests per Feature)
- Verifies the foundational happy path and contractual obligations of each feature.
- Guarantees minimum 5 distinct tests per feature across all 19 defined features ($\ge 95$ core unit/integration tests).

### Tier 2: Boundary, Extreme & Corner Cases (>= 5 Tests per Feature)
- Validates system resilience at boundaries: zero items, single item, maximum string lengths, special symbols, whitespace trimming, missing parents, unknown operators.
- Guarantees minimum 5 distinct tests per feature across all 19 defined features ($\ge 95$ boundary tests).

### Tier 3: Cross-Feature Interactions
- Tests multi-stage interactions where the output or state of one feature drives another:
  - Sequence reordering in Settings immediately alters question rendering order in Patient Registration.
  - Toggling a parent visibility condition dynamically shows child fields while evaluating child cascading options.
  - Hiding a parent field cascades into hiding dependent fields, triggering automatic value reset and payload sanitization.
  - Template bundle installation automatically seeds custom fields, updates order, and configures cascading dependencies.

### Tier 4: Real-World Application Scenarios
- End-to-end journey tests simulating realistic organizational deployments:
  - **Scenario A (University USTP Onboarding):** Intake of 1,000 freshmen students with student ID, college selection, dynamic program choices, and dorm allocation.
  - **Scenario B (Corporate Health Annual Exam):** Employee occupational checkup toggling employment types (Regular, Probationary, Contractor) and dynamic HMO details.
  - **Scenario C (Demographic & Clinical Specialty):** General clinical registration with conditional marital/spousal rules and age-based pediatric/geriatric flags.
  - **Scenario D (Clinic Admin Hot-Reloading):** Admin creates a mandatory field, reorders to the top, installs template, and verifies patient registration reflects it immediately.

### Tier 5: Adversarial Hardening & Integrity Guarding
- Fuzz testing and adversarial attack vectors:
  - Malformed or corrupted `VisibilityRuleJson` and `ConditionalOptionsJson`.
  - Infinite circular visibility loops (Field A depends on Field B, which depends on Field A).
  - Malicious script or format strings in field labels, machine keys, and option items.
  - Memory and layout stability under 1,000 select dropdown options.
  - Strict design token enforcement (`@clinicez/design-tokens`, zero raw hex codes).

---

## 3. Feature Traceability & Coverage Matrix

| Feature ID | Feature Name | Test Suite Location | Tier 1 (Min 5) | Tier 2 (Min 5) | Tier 3 (Cross) | Tier 4/5 | Total Tests |
|---|---|---|---|---|---|---|---|
| **F1** | CustomField Schema & EF Core Model | `CustomFieldsE2ETests.cs` | 5 | 5 | Yes | Yes | 12 |
| **F2** | CQRS CustomField CRUD & Query | `CustomFieldsE2ETests.cs` | 5 | 5 | Yes | Yes | 14 |
| **F3** | Bulk Reorder Custom Fields Endpoint | `CustomFieldsE2ETests.cs` | 5 | 5 | Yes | Yes | 12 |
| **F4** | Template Catalog & Install Backend | `CustomFieldsE2ETests.cs` | 5 | 5 | Yes | Yes | 12 |
| **F5** | Admin Mandatory Toggle & Badges | `customFieldsTab.test.ts` | 5 | 5 | Yes | Yes | 14 |
| **F6** | Admin Move Up/Down Sequence Controls | `customFieldsTab.test.ts` | 5 | 5 | Yes | Yes | 14 |
| **F7** | Live Visibility Condition Rule Builder | `customFieldsTab.test.ts` | 5 | 5 | Yes | Yes | 15 |
| **F8** | Cascading Dropdown Options Mapper | `customFieldsTab.test.ts` | 5 | 5 | Yes | Yes | 15 |
| **F9** | 1-Click Suggested Templates Library UI | `customFieldsTab.test.ts` | 5 | 5 | Yes | Yes | 14 |
| **F10** | Reusable DynamicCustomFieldsRenderer | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 16 |
| **F11** | Dynamic Visibility Evaluation Engine | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 18 |
| **F12** | Cascading Select Choices Engine | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 16 |
| **F13** | Defensive Submission Validation | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 14 |
| **F14** | Hidden Field Value Sanitization | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 14 |
| **F15** | Patient Registration Integration | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 12 |
| **F16** | Patient Demographic Edit Integration | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 12 |
| **F17** | Patient Chart View Integration | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 10 |
| **F18** | Public Student Intake Cascading | `dynamicCustomFieldsRenderer.test.ts` | 5 | 5 | Yes | Yes | 12 |
| **F19** | UI/UX Design System Compliance | `customFieldsTab.test.ts`, `tokens.test.ts` | 5 | 5 | Yes | Yes | 14 |
| **Total** | **All 19 Features** | **Frontend + Backend Suites** | **95** | **95** | **18** | **30** | **238+** |

---

## 4. Test Suite Implementation Blueprint

### 4.1 Frontend Settings & Template Management (`apps/clinic-app/tests/customFieldsTab.test.ts`)
- **Target Component:** `components/settings/CustomFieldsTab.tsx`, `components/settings/AddEditFieldModal.tsx`
- **Scope:**
  - Feature 5: Mandatory toggle in Add/Edit modal, `Required` (emergency badge) vs `Optional` (neutral badge) in list.
  - Feature 6: Move Up and Move Down buttons with touch targets $\ge 44\text{px}$, boundary guards at index 0 and index $N-1$, bulk reorder API dispatch.
  - Feature 7: Rule builder form binding parent field, operator (`equals`, `not_equals`, `in`, `contains`, `not_empty`), target value, and generating `VisibilityRuleJson`.
  - Feature 8: Cascading options mapper mapping parent values to child array choices, fallback handling, generating `ConditionalOptionsJson`.
  - Feature 9: 1-Click Template presets toolbar (USTP, Workplace, Demographics), modal confirmation, installation dispatch, list refresh.
  - Feature 19: Four core UX states (SkeletonList loading, EmptyState when 0 fields, ErrorState with retry, active cards with badges).

### 4.2 Frontend Dynamic Intake & Rendering Engine (`apps/clinic-app/tests/dynamicCustomFieldsRenderer.test.ts`)
- **Target Component:** `components/custom-fields/DynamicCustomFieldsRenderer.tsx`, Integration in `Patients.screen.tsx`, `EditPatientModal.tsx`
- **Scope:**
  - Feature 10: Deterministic rendering sorted by `DisplayOrder`, red asterisk `*` for `isRequired: true`, input widgets for Text, Number, Date (`ValidatedDateInput`), Boolean, and Select.
  - Feature 11: Visibility engine evaluating static patient properties (`gender`, `civilStatus`, `dateOfBirth`) and custom fields (`affiliation == 'Student'`), supporting all 5 comparison operators.
  - Feature 12: Cascading choices engine deriving available choices from parent selections, clearing stale child choices if invalid under new parent.
  - Feature 13: Submission validation requiring visible mandatory fields to have non-empty values; hidden mandatory fields bypass validation.
  - Feature 14: Hidden field value sanitization stripping invisible keys from output payload before submission.
  - Feature 15 & 16: Registration and Demographic Edit workflows with custom fields dictionary persistence.
  - Feature 18: Public Student Intake cascading workflow (College -> Program).

### 4.3 Backend Application & CQRS E2E Suite (`services/clinic-api/ClinicEz.Clinic.Application.Tests/CustomFieldsE2ETests.cs`)
- **Target Layer:** `ClinicEz.Clinic.Application`, `ClinicEz.Clinic.Domain`
- **Scope:**
  - Feature 1 & 2: Entity definition, CRUD operations, query deterministic sorting by `DisplayOrder` then `Label`, category filtering.
  - Feature 3: Bulk reordering persistence, verifying new display order indexes and retrieval consistency.
  - Feature 4: Preset bundle validation (USTP, Workplace, Demographics) with strongly-typed field definitions and rules.
  - Feature 15 & 16: Patient entity persistence with dynamic `CustomFields` dictionary, multi-tenant isolation, and bulk patient registration.

---

## 5. Test Execution Protocols

### 5.1 Frontend Test Execution
```bash
# Run Settings & Template Management tests
bun test apps/clinic-app/tests/customFieldsTab.test.ts

# Run Dynamic Intake & Rendering Engine tests
bun test apps/clinic-app/tests/dynamicCustomFieldsRenderer.test.ts

# Run all clinic-app automated tests
bun test apps/clinic-app/tests

# Verify Design Token Compliance
node apps/clinic-app/scripts/check-tokens.mjs --strict
```

### 5.2 Backend Test Execution
```bash
# Run Custom Fields Backend E2E Suite
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~CustomFields"

# Run all Clinic Application Tests
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj
```

---

## 6. Defect Escalation & QA Protocol

When test execution detects an anomaly:
1. **Test Defect vs Implementation Defect Assessment:**
   - If the test expectation deviates from `PROJECT.md` or `ORIGINAL_REQUEST.md`, correct the test.
   - If the implementation violates documented specifications, escalate immediately to the implementing agent. Never modify implementation code from the QA/Test Writer role.
2. **Document in Handoff Report:**
   - Record exact observation (command, exit code, line number, verbatim stack trace).
   - Document logic chain and discrepancy against specification.
   - Propose actionable remediation for the developer agent.
