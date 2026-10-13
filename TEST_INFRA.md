# ClinicEZ Secured Clinic Join Link — Test Infrastructure Specification (TEST_INFRA.md)

**Document Version:** 2.0.0  
**Target Milestone:** Dual-Track E2E Quality Assurance (Secured Clinic Join Link & Interop Hub Relay)  
**Applicable Services:** `tests/ClinicEz.Interop.E2E`, `apps/clinic-app`, `apps/portal-web`, `services/clinic-api`, `services/portal-api`, `packages/shared-dotnet`  
**Authoritative Specifications:** `PROJECT.md` (orchestrator_11), `ORIGINAL_REQUEST.md` (## 2026-10-13T03:16:03Z)  

---

## 1. Executive Summary & Testing Philosophy

The ClinicEZ Secured Clinic Join Link provides a zero-friction, asynchronously-relayed patient onboarding channel allowing patients to register via public URLs (`/join/[tenantSlug]/[facilitySlug]`), gated by administrator-configured Join Codes with expiration windows. Submissions are transmitted via the platform's Interop Hub backbone (`patient.join.requested`) from `Party.Portal` to `Party.ForFacility(Clinic)` with outside diagnostic document quarantine (`VerificationStatus = "PendingVerification"`), PhilHealth Member Type (`MM` vs `DD`) validation with Mod-11 check digit verification, dynamic custom fields with cascading choices, and digital queue pass issuance.

To assure absolute system integrity and prevent regressions without coupling tests to implementation internals, the Quality Assurance track employs a **Dual-Track, Requirement-Driven, Opaque-Box Testing Strategy** founded on a **4-Tier Testing Methodology** (with Tier 5 Adversarial Hardening):

1. **Opaque-Box Verification:** Tests assert strictly against public API contracts, DOM/React-Native behavioral events, and Interop Hub envelope boundaries. Tests never access private variables or internal implementation details.
2. **Deterministic Output Derivation:** Every expected outcome is directly derived from the documented specifications in `PROJECT.md` and `ORIGINAL_REQUEST.md` (e.g. Mod-11 check digit formulas, sequential code formats `PAT-{yyyy}-{seq:D5}` and `Q-{seq:D3}`, ISO date bounds, and token palettes).
3. **Progressive Testability & Independence:** Suites are engineered to validate interface contracts cleanly, enabling independent execution across frontend (`bun test`) and backend (`dotnet test`). Each test sets up its own state and cleans up after itself.
4. **Zero Regressions & Escaping Integrity:** Full verification across boundary conditions, cross-tenant isolation, Unicode/escaping fidelity, and malformed inputs.

---

## 2. 4-Tier (+ Tier 5) Testing Methodology

```
┌────────────────────────────────────────────────────────────────────────┐
│             Tier 5: Adversarial Hardening & Security Stress             │
│   (Malicious payloads, expired code tampering, SQL/XSS, format fuzzing)│
├────────────────────────────────────────────────────────────────────────┤
│             Tier 4: Real-World Clinical Onboarding Scenarios           │
│   (End-to-end join -> Interop envelope -> Queue ticket -> Quarantine)  │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 3: Cross-Feature Combinations & Cascading             │
│   (Dependent DD + Sponsor Mod-11 + Allergies + Quarantined Attachments)│
├────────────────────────────────────────────────────────────────────────┤
│             Tier 2: Boundary Value Analysis & Corner Cases             │
│   (Expired codes, future DOB rejection, invalid Mod-11, empty fields)  │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 1: Feature Coverage (>= 5 Tests per Feature)          │
│   (Primary happy-path behavioral verification for Features 1-23)       │
└────────────────────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage (>= 5 Tests per Feature)
- Verifies the foundational happy path and contractual obligations of each feature.
- Guarantees minimum 5 distinct tests per feature across all defined features ($\ge 115$ core unit/integration tests).
- Specific focus:
  - Public join link routes (`/join/[tenantSlug]`, `/join/[tenantSlug]/[facilitySlug]`).
  - Join code validation and URL query unlocking (`?code=...`).
  - PhilHealth PIN Mod-11 check digit algorithm.
  - PhilHealth Member Type (`MM` vs `DD`) selection and principal member fields.
  - Dynamic custom fields evaluation and cascading dropdowns.
  - Outside document quarantine persistence (`PendingVerification`).
  - Interop Hub asynchronous relay (`patient.join.requested`).

### Tier 2: Boundary, Extreme & Corner Cases (>= 5 Tests per Feature)
- Validates system resilience at edge boundaries:
  - Expired join codes (e.g., expired 1 second ago vs active for 1 second).
  - Disabled join link toggles (`IsJoinEnabled = false`).
  - Invalid Mod-11 check digits (rematches, remainder 0 and 1 edge cases, corrupted single digits).
  - Date of Birth boundary constraints (future dates strictly rejected, today accepted, leap years 2024-02-29).
  - Empty optional fields (middle name, suffix, senior/PWD IDs, attachments).
  - Boundary lengths on names, addresses, and reason for visit (max 255/1000 characters).

### Tier 3: Cross-Feature Interactions & Combinations
- Tests multi-stage interactions where the state or output of multiple features interact:
  - Dependent patient (`DD`) + Principal Sponsor Mod-11 PIN + multiple severe anaphylactic allergies + 2 outside quarantined documents.
  - Multi-facility tenant picker -> selecting specific branch -> preserving join code across navigation.
  - Custom fields cascading: University Preset (Student -> College -> Program) combined with missing required child field validation.
  - Digital registration pass generation reflecting sequential daily queue token (`Q-{seq:D3}`) and assigned patient code (`PAT-{yyyy}-{seq:D5}`).

### Tier 4: Real-World Application Scenarios
- End-to-end journey tests simulating realistic clinical intake operations:
  - **Scenario A (Walk-in Public Reception Onboarding):** Walk-in patient scans printable reception QR placard containing `?code=ABC123`, opens mobile join form, fills demographics with Mod-11 PhilHealth PIN, submits, receives `Q-101` digital ticket pass, and appears on clinic triage queue.
  - **Scenario B (Dependent Child Registration with Diagnostic Attachments):** Mother registers child dependent (`DD`), supplies principal sponsor credentials, attaches outside Chest X-Ray and pediatric immunization record, clinic receives envelope, stores attachments in quarantine (`PendingVerification`), and nurse reviews/approves documents in `ExternalDocumentVaultTab`.
  - **Scenario C (Corporate / Student Intake Batch):** University student onboarded through `/join/ustp/main-campus`, fills Student ID, College, and Program cascading fields, verified without leaking unselected faculty questions.
  - **Scenario D (Administrator Security Revocation):** Clinic administrator detects unauthorized join link sharing, regenerates Join Code and sets 24h expiration, immediately invalidating old code links.

### Tier 5: Adversarial Hardening & Integrity Guarding
- Adversarial attacks and fuzz vectors:
  - Code tampering: Attempting registration with modified or expired code query parameters.
  - Mod-11 single-digit mutation harness (fuzzing every digit 0-9 to guarantee 100% check digit rejection).
  - Malformed attachment mime types and oversized files.
  - Cross-tenant injection: Attempting to target facility ID of another tenant via envelope spoofing.
  - Strict `@clinicez/design-tokens` audit: zero raw hex literals, 4 core UX states (Skeleton loading, Empty, Error with retry, Active/Success digital pass).

---

## 3. Feature Traceability & Coverage Matrix

| Feature ID | Feature Name | Primary Test Suite | Tier 1 (Happy >=5) | Tier 2 (Boundary >=5) | Tier 3 (Cross) | Tier 4 (Real-World) | Tier 5 (Adversarial) | Target Total |
|---|---|---|---|---|---|---|---|---|
| **F1** | Interop Contract Registration | `PatientJoinFlowTests.cs` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F2** | Backend Relay Ingestion | `PatientJoinFlowTests.cs` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F3** | Proxy Authentication Bypass | `joinFlow.test.ts` | 5 | 5 | 2 | 1 | 2 | 15 |
| **F4** | Idempotent Clinic Ingestion Handler | `PatientJoinFlowTests.cs` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F5** | Sequential Patient & Queue Ticket | `PatientJoinFlowTests.cs` | 5 | 5 | 2 | 2 | 1 | 15 |
| **F6** | External Document Quarantine | `PatientJoinFlowTests.cs`, `joinLinkSettings.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F7** | Join Code & Expiration Settings Schema | `PatientJoinFlowTests.cs` | 5 | 5 | 2 | 1 | 2 | 15 |
| **F8** | Join Code Settings API | `PatientJoinFlowTests.cs` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F9** | Clinic Admin Join Code Settings Card | `joinLinkSettings.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F10** | Printable Reception QR Placard | `joinLinkSettings.test.ts` | 5 | 5 | 2 | 2 | 1 | 15 |
| **F11** | Workstation PhilHealth Member Type Selector | `patientMemberType.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F12** | Workstation Quarantine Review Workflow | `joinLinkSettings.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F13** | Complete Deletion of Legacy `/student-intake` | `joinFlow.test.ts` | 5 | 5 | 1 | 1 | 2 | 14 |
| **F14** | Public Facility Selector Route | `joinFlow.test.ts` | 5 | 5 | 2 | 2 | 1 | 15 |
| **F15** | Secured Public Join Link Route | `joinFlow.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F16** | Join Code Validation & URL Param Gating | `joinFlow.test.ts`, `PatientJoinFlowTests.cs` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F17** | Public Mod-11 PhilHealth PIN Validation | `patientMemberType.test.ts`, `joinFlow.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F18** | Public PhilHealth Member Type | `patientMemberType.test.ts`, `joinFlow.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F19** | Public Dynamic Custom Fields & Cascading | `joinFlow.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F20** | Public Structured Allergies & Medical History | `patientMemberType.test.ts`, `joinFlow.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F21** | Public External Document Upload Dropzone | `joinFlow.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **F22** | Digital Registration Pass & Scannable QR | `joinFlow.test.ts` | 5 | 5 | 2 | 2 | 1 | 15 |
| **F23** | Design Tokens & 4 UX States Compliance | `joinLinkSettings.test.ts`, `tokens.test.ts` | 5 | 5 | 2 | 2 | 2 | 16 |
| **Total** | **All 23 Features** | **4 Comprehensive Suites** | **115** | **115** | **45** | **42** | **43** | **360+** |

---

## 4. Test Suite Implementation Blueprint

### 4.1 .NET Interop Hub E2E Suite (`tests/ClinicEz.Interop.E2E/PatientJoinFlowTests.cs`)
- **Target Harness:** `TestCell` (with in-memory SQLite Hub, `ClinicHost`, `HubFixture`, `Party.Portal`, `Party.ForFacility`)
- **Scope:**
  - Feature 1 & 2: `patient.join.requested` envelope signing (ECDSA P-256), portal-to-clinic routing, envelope acceptance by Hub.
  - Feature 4: Idempotency under duplicate message redelivery, ensuring zero duplicate patients or double queue tickets.
  - Feature 5: Sequential `PatientCode` generation (`PAT-{yyyy}-{seq:D5}`) and daily queue ticket (`Q-{seq:D3}`).
  - Feature 6: Outside document attachment quarantine with `VerificationStatus = "PendingVerification"`.
  - Feature 7 & 8: `ClinicSettings` join gating (`IsJoinEnabled`, `JoinCode`, `JoinCodeExpiresAt`).
  - Feature 16: Rejection of join requests with invalid or expired join code.
  - Feature 17 & 18: Mod-11 validation on patient and principal member PINs, `MM` vs `DD` data mapping into `philhealth_profile`.

### 4.2 Clinic App Settings & Workstation Suite (`apps/clinic-app/tests/joinLinkSettings.test.ts`)
- **Target Components:** `JoinLinkSettingsCard.tsx`, `GeneralSettingsTab.tsx`, `ExternalDocumentVaultTab.tsx`
- **Scope:**
  - Feature 9: Join link toggle (`IsJoinEnabled`), alphanumeric Join Code input and 8-character random generator, expiration window selector (24 Hours, 7 Days, 30 Days, Custom Date, Never).
  - Feature 10: Reception QR code card with `?code=` query URL, preview display, printable placard generation.
  - Feature 12: External Document Vault pending review badge/filter chip (`Pending Review (N)`), interactive review modal, approve action (`Verified`), reject action with mandatory rejection reason (`Rejected`).
  - Feature 23: Semantic tokens usage (`lightColors.primary #0D6963`), zero raw hex codes, responsive layout.

### 4.3 Clinic App Member Type & Registration Suite (`apps/clinic-app/tests/patientMemberType.test.ts`)
- **Target Components:** `Patients.screen.tsx`, `EditPatientModal.tsx`
- **Scope:**
  - Feature 11: Member Type toggle pills: `[ Member (MM) ]` and `[ Dependent (DD) ]`.
  - Feature 17: PhilHealth PIN input with Mod-11 check digit verification, formatted as `XX-XXXXXXXXX-X`.
  - Feature 18: Dependent (`DD`) conditional principal member fields: Principal PIN (Mod-11 verified), Relationship (`Child (C)`, `Spouse (S)`, `Parent (P)`, `Disabled Dependent (D)`), Principal Full Name, Principal Date of Birth.
  - Feature 20: Structured allergies integration with categories (Medication, Food, Environmental) and anaphylaxis flags.
  - Feature 23: 4 core UX states and token compliance.

### 4.4 Portal Web Public Join Suite (`apps/portal-web/tests/joinFlow.test.ts`)
- **Target Components & Routes:** `/join/[tenantSlug]`, `/join/[tenantSlug]/[facilitySlug]`, `JoinClient.tsx`, `JoinCodeModal.tsx`, `DigitalPassCard.tsx`, `OutsideDocumentDropzone.tsx`, `proxy.ts`
- **Scope:**
  - Feature 3: `proxy.ts` Clerk authentication bypass for `/join(.*)` paths.
  - Feature 13: Complete removal of legacy `/student-intake` files and 404 behavior.
  - Feature 14: Multi-facility campus/branch selector for `/join/[tenantSlug]`.
  - Feature 15: Facility pre-selection and lock for `/join/[tenantSlug]/[facilitySlug]`.
  - Feature 16: Join code gating, URL parameter `?code=...` auto-fill, modal prompt on missing code, expired code rejection.
  - Feature 17 & 18: Public Mod-11 PIN validation and Member (`MM`) vs Dependent (`DD`) sponsor card.
  - Feature 19: Dynamic custom fields condition evaluation and cascading select choices.
  - Feature 20: Public structured allergy recording and visit reason.
  - Feature 21: File dropzone supporting PDF, JPEG, PNG outside attachments with quarantine disclosure.
  - Feature 22: Digital Registration Pass rendering queue token (`Q-105`), patient code, and scannable QR ticket.
  - Feature 23: 4 UX states (Skeleton loading, Empty, Error with retry, Active/Success pass).

---

## 5. Test Execution Protocols

### 5.1 Backend Interop Hub E2E Suite Execution
```bash
# Execute Secured Join Interop Hub E2E Suite
dotnet test tests/ClinicEz.Interop.E2E/ClinicEz.Interop.E2E.csproj --filter "FullyQualifiedName~PatientJoinFlowTests" -p:TreatWarningsAsErrors=false

# Execute all Interop E2E Tests
dotnet test tests/ClinicEz.Interop.E2E/ClinicEz.Interop.E2E.csproj -p:TreatWarningsAsErrors=false
```

### 5.2 Frontend Clinic App Test Suites Execution
```bash
# Execute Join Link Settings & Placard Suite
bun test apps/clinic-app/tests/joinLinkSettings.test.ts

# Execute PhilHealth Member Type & Registration Suite
bun test apps/clinic-app/tests/patientMemberType.test.ts

# Execute all Clinic App automated tests
bun test apps/clinic-app/tests
```

### 5.3 Frontend Portal Web Test Suite Execution
```bash
# Execute Portal Web Public Join Suite
bun test apps/portal-web/tests/joinFlow.test.ts
```

### 5.4 Token Guard & Lint Verification
```bash
# Verify Design Token Compliance (0 raw hex codes)
node apps/clinic-app/scripts/check-tokens.mjs --strict
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
