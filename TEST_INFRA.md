# E2E Test Infra: ClinicEZ Teleconsultation Feature

## Test Philosophy
- Requirement-driven, opaque-box testing derived from ORIGINAL_REQUEST.md.
- Strict multi-layer verification: Backend (`dotnet test`), Communications SDK (`bun test`), Clinic Workstation (`bun test`), and Linters (`check-tokens.mjs`, `check-no-external-hosts.mjs`).
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory & Test Coverage
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|----------------------|:------:|:------:|:------:|
| 1 | `AppointmentBookedEvent.AppointmentType` | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Facility Teleconsult Settings | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Teleconsult Appointment Creation & Billing | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | AppointmentDto Teleconsult Metadata | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Cashier Payment Clearance | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Non-Mutating YAKAP Status | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Plain-Note Admission Override | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | Update Teleconsult Payment Policy | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Media Signaling (Join/End Call) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 10 | CMK AES-256-GCM Vault Encryption | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 11 | Recording Sweeper Sidecar Cleanup | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 12 | Consultation Encounter Linkage | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 13 | Interop Handlers & Registration | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 14 | `livekit-client` SDK Dependency | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 15 | Comms Media Adapters | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 16 | `useCallSession` Upgrade & Fallback | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 17 | `CallWaitingRoom` Realignment | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 18 | `CallStage` Implementation | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 19 | Workstation Clinic Service Teleconsult APIs | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 20 | Workstation ClinicCommsContext Docking | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 21 | Workstation Waiting Room & Stage Modal | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 22 | Workstation Scheduling & Inspection | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 23 | Facility Teleconsult Settings Card | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 24 | Timeline Recording Player Modal | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

## Test Architecture & Runners
- **Backend Test Runner**:
  - `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj`
- **Communications SDK Runner**:
  - `cd packages/comms-sdk && bun run typecheck && bun test`
  - `bun packages/comms-sdk/scripts/check-tokens.mjs --strict`
  - `bun packages/comms-sdk/scripts/check-no-external-hosts.mjs`
- **Clinic Workstation App Runner**:
  - `cd apps/clinic-app && bun run typecheck`
  - `cd apps/clinic-app && bun run lint:tokens`
  - `cd apps/clinic-app && bun run lint:hosts`
  - `cd apps/clinic-app && bun test tests/teleconsultWorkflow.test.ts`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Standard Prepaid Teleconsultation with Cashier Settlement | F2, F3, F4, F5, F8, F9, F19, F21, F22 | High |
| 2 | Enlisted YAKAP Patient Teleconsultation with Staff Exemption | F3, F6, F8, F9, F17, F21, F22 | High |
| 3 | Emergency Clinical Admission Override with Plain Reason Note | F3, F7, F9, F16, F17, F21 | High |
| 4 | Active Video Call with Encrypted Vault Recording & Dual Consent | F9, F10, F12, F15, F16, F18, F21 | High |
| 5 | Medico-Legal Hold Placement and Retention Purge Defense | F10, F11, F12, F19, F24 | High |
| 6 | Active Call Consultation Chart Docking & SOAP Note Entry | F18, F20, F21 | High |
