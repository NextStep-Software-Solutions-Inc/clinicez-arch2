# E2E-M1 Adversarial Challenge Handoff Report

**Milestone**: E2E-M1 Adversarial Challenge of `TEST_INFRA.md`  
**Challenger Role**: `challenger_m1_1` (E2E Test Architecture Challenger)  
**Deliverable Challenged**: `/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/TEST_INFRA.md`  
**Handoff Type**: Hard Handoff (Complete Assessment)  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

Direct empirical observations from executing commands specified in `TEST_INFRA.md` Section 5:

### 1.1 Backend Compilation Breakage in `portal-api`
- **Command executed**:
  ```bash
  /Users/macuser/.dotnet/dotnet test services/portal-api/ClinicEz.Portal.Tests/ClinicEz.Portal.Tests.csproj
  ```
- **Result**: Command exited with code 1.
- **Verbatim compiler error**:
  ```text
  /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/services/portal-api/ClinicEz.Portal.Application/Features/Licensing/EntitlementsPublisher.cs(42,33): 
  error CS1061: 'EntitlementSnapshot' does not contain a definition for 'HasFeature' and no accessible extension method 'HasFeature' accepting a first argument of type 'EntitlementSnapshot' could be found (are you missing a using directive or an assembly reference?) [/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/services/portal-api/ClinicEz.Portal.Application/ClinicEz.Portal.Application.csproj]
  ```
- **Code inspection**:
  - `services/portal-api/ClinicEz.Portal.Application/Features/Entitlements/EntitlementSnapshot.cs:28`:
    ```csharp
    public bool Has(string featureKey) => Features.Contains(featureKey);
    ```
  - `services/portal-api/ClinicEz.Portal.Application/Features/Licensing/EntitlementsPublisher.cs:42`:
    ```csharp
    var isActive = snapshot.HasFeature(EntitlementKeys.FeatureTeleconsultation) && snapshot.IsActive;
    ```
    Method `HasFeature` does not exist; the correct method is `Has`.

### 1.2 Test Regression in `packages/comms-sdk`
- **Command executed**:
  ```bash
  cd packages/comms-sdk && bun test tests && bun run typecheck
  ```
- **Result**: `bun test tests` exited with code 1 (481 passed, 2 failed).
- **Verbatim test failures**:
  ```text
  2 tests failed:
  ✗ Feature F18: CallStage Video Surface & In-Call Controls (Native & Web) > Tier 5: Milestone 8 Adaptations: Dock, PiP, and Orientation > Native & Web: renders icon-only Copy Invite button at top-left with hover tooltip and omits center Message Patient button [0.63ms]
  ✗ Feature F18: CallStage Video Surface & In-Call Controls (Native & Web) > Tier 5: Milestone 8 Adaptations: Dock, PiP, and Orientation > Native & Web: active stage pills, invite CTAs, and end button apply brand and semantic drop shadows [0.38ms]
  ```
- **Code inspection**:
  - `packages/comms-sdk/tests/ui/call-stage.test.ts:611-619` asserts that `btn-stage-copy-invite` is rendered at top-left.
  - Requirement R1 and `TEST_INFRA.md` `TC-T1.1.1` mandate that `btn-stage-copy-invite` is removed from `CallStage.tsx`.
  - The component removed the button, but `call-stage.test.ts` was not updated to reflect this change.

### 1.3 Design Token Guard Failure in `comms-sdk`
- **Command executed**:
  ```bash
  bun run lint:comms
  ```
- **Result**: Exited with code 1.
- **Verbatim output**:
  ```text
  $ bun packages/comms-sdk/scripts/check-tokens.mjs --strict && bun packages/comms-sdk/scripts/check-no-external-hosts.mjs
      3  src/web-ui/OverlayTooltip.tsx  (color:3)
      1  src/native-ui/OverlayTooltip.tsx  (color:1)
  Comms SDK token guard: 4 violation(s) across 49 source file(s).
  error: script "lint:comms" exited with code 1
  ```
- **Code inspection**:
  - `packages/comms-sdk/src/web-ui/OverlayTooltip.tsx:62-64`: hardcoded `#0F172A`, `#FFFFFF`, `#334155`.
  - `packages/comms-sdk/src/native-ui/OverlayTooltip.tsx:81`: hardcoded `rgba(15, 23, 42, 0.38)`.

### 1.4 Missing Invite State Cache in Modals
- **Code inspection**:
  - `apps/clinic-app/components/calendar/AppointmentInspectionModal.tsx:668`:
    Calls `clinicService.createTeleconsultGuestInvite(currentAppointment.id)` directly on every press of `btn-copy-patient-link` with no caching.
  - `apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx:903`:
    Calls `clinicService.createTeleconsultGuestInvite(appointmentId)` directly on every press of `handleSharePatientLink` with no caching.
  - Both violate R1 ("store { inviteUrl, otp, expiresAtUtc } in state to reuse the active invite across copy actions without regenerating PINs") and invalidate `TEST_INFRA.md` `TC-T2.1.1`.

### 1.5 Passing Test Commands
- `dotnet test services/media-broker/ClinicEz.MediaBroker.Tests`: PASS (42/42)
- `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests --filter ...`: PASS (617/617)
- `dotnet test services/interop-hub/ClinicEz.Interop.Tests`: PASS (190/190)
- `dotnet test services/patient-api/ClinicEz.Patient.Application.Tests --filter ...`: PASS (7/7)
- `apps/clinic-app` tests (5 suites): PASS (168/168)
- `apps/clinic-app` isolated issue #139: PASS (12/12)
- `apps/portal-web` tests (4 suites): PASS (58/58)
- `apps/admin-web` tests (2 suites): PASS (14/14)
- `bun run typecheck:comms`, `typecheck:clinic`, `typecheck:portal`, `typecheck:admin`: PASS
- `bun run lint:tokens`, `bun run lint:clinic`: PASS
- `curl -I http://localhost:8081`: PASS (HTTP 200 OK)

---

## 2. Logic Chain

1. **Step 1 (Executable Commands Contract)**: `TEST_INFRA.md` Section 5.2 defines the authoritative commands to verify the teleconsultation finalization work product. A test infrastructure specification is invalid if its documented commands fail on the system.
2. **Step 2 (Compiler Failure)**: By Observation 1.1, `EntitlementsPublisher.cs` fails to compile because it references a non-existent method `HasFeature` on `EntitlementSnapshot`. This breaks the backend test runner for `portal-api`, the consolidated backend command (5.2.2), and the full-stack one-liner (5.2.5).
3. **Step 3 (Test Suite Failure)**: By Observation 1.2, running `bun test tests` in `packages/comms-sdk` as specified in Section 5.2.3 fails due to outdated assertions in `call-stage.test.ts` that contradict Requirement R1.
4. **Step 4 (Token Invariant Failure)**: By Observation 1.3, `OverlayTooltip.tsx` introduces 4 raw color literals, causing `bun run lint:comms` to exit with error code 1. This directly contradicts Section 5.1's claim of "0 Violations".
5. **Step 5 (Behavioral Assertion Discrepancy)**: By Observation 1.4, `AppointmentInspectionModal.tsx` and `TeleconsultWaitingRoomModal.tsx` lack the cached invite state required by Requirement R1. Therefore, `TC-T2.1.1` in `TEST_INFRA.md` cannot pass against the current codebase.
6. **Step 6 (Test Matrix Omissions)**: The test matrix omits negative coverage for 5-attempt guest lockout (HTTP 423), expired invite vs revoked invite distinction, negative billing rate inputs, cross-tenant isolation, and background tab wall-clock throttling.
7. **Step 7 (Deductive Conclusion)**: Because critical commands documented in Section 5 fail compilation, test execution, and lint checks, and key test cases are contradicted by the actual codebase, `TEST_INFRA.md` must NOT be approved in its current state. The verdict is `REQUEST_CHANGES`.

---

## 3. Caveats

- We did not modify any source code or test implementations directly, adhering strictly to the constraint: "Review-only — do NOT modify implementation code (report findings; tests written to project test suite for verification or run via test runner)".
- We verified that the Expo dev server on port `8081` remained active and was not terminated.
- Other verification agents who issued `APPROVE` verdicts appear to have performed static document reviews rather than executing the verification commands in Section 5.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

`TEST_INFRA.md` must be updated and the underlying blockers resolved before entering Milestone 2 execution:

1. **Fix `EntitlementsPublisher.cs:42`**: Replace `snapshot.HasFeature(...)` with `snapshot.Has(...)` so `ClinicEz.Portal.Tests` compiles and runs cleanly.
2. **Update `call-stage.test.ts` in `packages/comms-sdk`**: Align legacy assertions with Requirement R1 (`btn-stage-copy-invite` must be null), allowing `bun test tests` to pass.
3. **Resolve Token Violations in `OverlayTooltip.tsx`**: Replace raw hex and rgba literals in `packages/comms-sdk/src/web-ui/OverlayTooltip.tsx` and `native-ui/OverlayTooltip.tsx` with design tokens so `bun run lint:comms` exits with 0 violations.
4. **Implement Invite State Caching**: Add `{ inviteUrl, otp, expiresAtUtc }` state to `AppointmentInspectionModal.tsx` and `TeleconsultWaitingRoomModal.tsx` to prevent PIN rotation on repeated clicks as asserted by `TC-T2.1.1`.
5. **Expand Test Matrix**: Incorporate negative test cases for 5-attempt guest lockout (HTTP 423), 60-minute expired invite status (HTTP 410), invalid billing parameters, and background tab delta-based timer calculations.

---

## 5. Verification Method

To independently verify all findings in this report, execute the following commands in order:

```bash
# 1. Verify portal-api compiler failure:
/Users/macuser/.dotnet/dotnet test services/portal-api/ClinicEz.Portal.Tests/ClinicEz.Portal.Tests.csproj
# Expected: Exit code 1 with CS1061 error on EntitlementsPublisher.cs:42

# 2. Verify comms-sdk test failure:
cd packages/comms-sdk && bun test tests
# Expected: Exit code 1 with 2 failing tests in call-stage.test.ts

# 3. Verify token lint failure:
cd ../.. && bun run lint:comms
# Expected: Exit code 1 with 4 token violations in OverlayTooltip.tsx

# 4. Verify lack of invite state caching in AppointmentInspectionModal:
git grep -n "createTeleconsultGuestInvite" apps/clinic-app/components/calendar/AppointmentInspectionModal.tsx
# Expected: Observe direct API call on button press without caching guard
```

**Invalidation Conditions**:
- If `EntitlementsPublisher.cs` line 42 is updated to `snapshot.Has(...)`, `ClinicEz.Portal.Tests` passes (invalidating Finding 1).
- If `call-stage.test.ts` is updated to assert `btn-stage-copy-invite` is null, `bun test tests` passes (invalidating Finding 2).
- If `OverlayTooltip.tsx` is refactored to use design tokens, `bun run lint:comms` passes (invalidating Finding 3).
