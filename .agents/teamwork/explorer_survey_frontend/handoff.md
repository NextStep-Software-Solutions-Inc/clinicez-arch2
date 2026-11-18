# Comprehensive Frontend Scope Survey: Teleconsultation in Clinic Workstation (`apps/clinic-app`)

**State Folder**: `/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/.agents/teamwork/explorer_survey_frontend`  
**Working Directory**: `/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api`  
**Date**: 2026-11-12T23:25:00Z  
**Author**: `explorer_survey_frontend`  
**Milestone**: `survey_frontend`

---

## 1. Observation

### 1.1 Baseline Health Checks
- **Typecheck**: `bun --filter @clinicez/clinic-app typecheck` (`tsc --noEmit`) completed with **code 0** (0 diagnostic errors).
- **Design Token Guard**: `bun --filter @clinicez/clinic-app lint:tokens` (`bun scripts/check-tokens.mjs`) completed with **code 0**:
  ```
  Token guard: 0 violation(s) in 0 file(s).
  Token guard OK (no regressions vs baseline).
  ```
- **External Host Guard**: `bun --filter @clinicez/clinic-app lint:hosts` (`bun scripts/check-no-external-hosts.mjs`) completed with **code 0** (`Host/catalog gate OK (334 files scanned)`).
- **Test Suite**: `bun --filter @clinicez/clinic-app test` executed 4,921 tests across 252 files with **4,722 passing**, 199 failing across legacy/unrelated mock suites (e.g. `PatientSummarySpine`, `ClinicChatDrawerHost`), and **zero** teleconsultation workflow test files currently in place.

---

### 1.2 `apps/clinic-app/services/clinicService.ts`
- **File size**: 6,473 lines.
- **Appointment DTOs**:
  - `AppointmentItem` (`services/clinicService.ts:735-757`):
    ```typescript
    export interface AppointmentItem {
      id: string;
      tenantId?: string;
      clinicId: string;
      draftId?: string;
      patientId: string;
      patientName: string;
      doctorId?: string;
      doctorName?: string;
      scheduledAt: string;
      durationMinutes: number;
      status: AppointmentStatus;
      serviceType?: string;
      reason?: string;
      notes?: string;
      createdAt: string;
      reminder24hSent?: boolean;
      reminder2hSent?: boolean;
      reminder24hSentAt?: string | null;
      reminder2hSentAt?: string | null;
      lastReminderSentAt?: string | null;
      lastReminderType?: string | null;
    }
    ```
    *Observed gap*: Missing all teleconsultation fields: `appointmentType`, `isTeleconsult`, `paymentPolicy`, `paymentStatus`, `invoiceId`, `paidAmount`, `callId`, `admittedAtUtc`, `isEmergencyOverride`, `emergencyOverrideReasonCode`.
- **Clinic Settings Record**:
  - `ClinicSettingsRecord` (`services/clinicService.ts:3176-3263`):
    *Observed gap*: Contains general, TV, and reminder settings, but has zero teleconsult settings fields (`teleconsultRecordingPolicy`, `teleconsultRecordingRetentionDays`, `teleconsultRecordingConsentRequired`, `teleconsultPaymentPolicy`, `teleconsultDefaultFee`).
- **Create Appointment**:
  - `clinicService.createAppointment` (`services/clinicService.ts:4719-4731`):
    *Observed gap*: Accepts only `patientId`, `patientName`, `doctorId`, `doctorName`, `scheduledAt`, `durationMinutes`, `serviceType`, `reason`, `notes`. Does not accept `appointmentType` or `paymentPolicy`.
- **Teleconsult & Recording API Methods**:
  - Grep for `teleconsult` and `recording` yielded **0 occurrences** across `services/clinicService.ts`.
  - Missing all 16 backend endpoints covering teleconsult admission, payment policy updates, call join/end, recording consent, segment upload/finalize, playback tickets, and legal hold.

---

### 1.3 `apps/clinic-app/context/ClinicCommsContext.tsx`
- **Lines 11-20**:
  ```typescript
  export interface TeleconsultSessionParams {
    callId: string;
    appointmentId?: string;
    patientName: string;
    clinicianName: string;
    scheduledTime: string;
    paymentPolicy?: 'Prepaid' | 'Postpaid' | 'Exempt';
    paymentStatus?: 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden';
    isYakapExempt?: boolean;
  }
  ```
  *Observed gap*: Missing `patientId?: string`, `recordingPolicy?: string`, `recordingConsentRequired?: boolean`, and `activeRecordingSessionId?: string | null`.
- **Lines 22-32**:
  ```typescript
  export interface ClinicCommsContextValue {
    isChatDrawerOpen: boolean;
    toggleChatDrawer: () => void;
    openChatDrawer: () => void;
    closeChatDrawer: () => void;
    activeConversationId: string | undefined;
    setActiveConversationId: (id?: string) => void;
    teleconsultSession: TeleconsultSessionParams | null;
    openTeleconsultWaitingRoom: (params: TeleconsultSessionParams) => void;
    closeTeleconsultWaitingRoom: () => void;
  }
  ```
  *Observed gap*: Does not expose consultation chart docking state (`isCallStageDocked`, `dockCallStage`, `maximizeCallStage`) or the `onOpenConsultationChart` callback to bridge between the active call stage and the consultation workspace SOAP/YAKAP charting screen.

---

### 1.4 `apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx`
- **Lines 16-21**:
  ```typescript
  const [paymentStatus, setPaymentStatus] = useState<'Unpaid' | 'Paid' | 'Exempt' | 'Overridden'>(
    teleconsultSession?.paymentStatus || 'Unpaid',
  );
  const [isReadyToAdmit, setIsReadyToAdmit] = useState(false);
  const [consentStatus, setConsentStatus] = useState<'Pending' | 'Approved' | 'Rejected' | 'Disabled'>('Pending');
  const [isInCall, setIsInCall] = useState(false);
  ```
  *Observed gap*: Relies entirely on local component state variables instead of binding to backend truth or `@clinicez/comms-sdk`'s `useCallSession`.
- **Lines 73-74**:
  ```typescript
  const isYakapExempt = teleconsultSession.isYakapExempt ?? false;
  const paymentPolicy = isYakapExempt ? 'Exempt' : teleconsultSession.paymentPolicy || 'Prepaid';
  ```
  *Observed gap*: Violates the newly approved requirement that active YAKAP status never silently mutates or forces the payment policy to `Exempt`.
- **Lines 98-115**:
  ```tsx
  {isInCall ? (
    <View style={styles.activeCallContainer}>
      <Icon name="activity" size={48} color={theme.colors.success} />
      <ThemedText variant="h2" color={theme.colors.text} style={styles.activeCallHeading}>
        Teleconsultation in Progress
      </ThemedText>
      <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.activeCallSub}>
        Connected with {teleconsultSession.patientName} (Attending: {teleconsultSession.clinicianName})
      </ThemedText>
      <Button
        title="End Teleconsultation"
        variant="danger"
        size="md"
        icon="phone"
        onPress={handleCancelCall}
        accessibilityLabel="End consultation call"
      />
    </View>
  ) : (
    <CallWaitingRoom ... />
  )}
  ```
  *Observed gap*: When `isInCall` is true, renders a static mockup placeholder rather than `@clinicez/comms-sdk`'s `CallStage`. It does not support media video tracks, dual-party recording indicators, or workstation chart docking.

---

### 1.5 `apps/clinic-app/components/patient/ScheduleVisitModal.tsx`
- **Lines 140-146**: Form state only tracks `selectedDoctorId`, `selectedDate`, `selectedSlotTime`, `purpose`, and `clinicalNotes`.
- **Lines 318-328**:
  ```typescript
  const payload = {
    patientId: patient.id,
    patientName: patient.fullName,
    doctorId: selectedDoctorId || undefined,
    doctorName: selectedDoctorId ? docName : undefined,
    scheduledAt,
    durationMinutes: 30,
    serviceType: purpose,
    reason: clinicalNotes.trim() || purpose,
    notes: clinicalNotes.trim() || undefined,
  };
  ```
  *Observed gap*:
  - No Visit Type selector (`In-Person` vs `Teleconsult`).
  - No Payment Policy selector pills (`Prepaid`, `Postpaid`, `Exempt`) when booking a teleconsultation.
  - No informational YAKAP badge when patient is enlisted.
  - Does not pass `appointmentType` or `paymentPolicy` to `createAppointment`.

---

### 1.6 `apps/clinic-app/components/calendar/AppointmentInspectionModal.tsx`
- **Lines 525-543**:
  ```tsx
  {currentAppointment.status !== 'Cancelled' ? (
    <Pressable
      data-testid="btn-drawer-teleconsult"
      testID="btn-drawer-teleconsult"
      accessibilityRole="button"
      accessibilityLabel="Enter teleconsultation waiting room"
      onPress={() => {
        onClose();
        openTeleconsultWaitingRoom({
          callId: currentAppointment.id,
          appointmentId: currentAppointment.id,
          patientName: currentAppointment.patientName || 'Patient',
          clinicianName: currentAppointment.doctorName || 'Attending Physician',
          scheduledTime: currentAppointment.scheduledAt,
          paymentPolicy: (currentAppointment as any).isYakapEligible ? 'Exempt' : 'Prepaid',
          paymentStatus: currentAppointment.status === 'CheckedIn' ? 'Paid' : 'Unpaid',
          isYakapExempt: (currentAppointment as any).isYakapEligible ?? false,
        });
      }}
    >
  ```
  *Observed gap*:
  - Button renders for **all** non-cancelled appointments, regardless of whether modality is `Teleconsult` or `InPerson`.
  - Re-uses `currentAppointment.id` as `callId`, ignoring backend `callId`.
  - Falsely assumes `paymentStatus` is `'Paid'` if `status === 'CheckedIn'`.
  - Falsely assumes `paymentPolicy` is `'Exempt'` if `isYakapEligible`.
  - Missing Modality badge (`Teleconsult` vs `In-Person`), Payment Status badge (`Paid`, `Pending`, `Exempt`, `Overridden`), Payment Policy badge (`Prepaid`, `Postpaid`, `Exempt`), and inline payment policy switcher.

---

### 1.7 `apps/clinic-app/components/settings/GeneralSettingsTab.tsx`
- **Lines 161-167**:
  ```tsx
  {show('clinical') ? (
    <View style={styles.sectionStack} testID="settings-section-clinical">
      <ClinicalSpecialtyCard {...props} />
      <ChartLayoutDefaultCard {...props} preferredChartLayout={props.preferredChartLayout} />
      {showSkeletons ? renderSkeletonCard('patient-search-skeleton') : <PatientSearchConfigSection settings={settings} onSettingsUpdated={onSettingsUpdated} />}
    </View>
  ) : null}
  ```
  *Observed gap*:
  - `TeleconsultSettingsCard.tsx` does **not exist** under `components/settings/cards/`.
  - `GeneralSettingsTab.tsx` has no card to configure default `teleconsultPaymentPolicy`, `teleconsultDefaultFee`, `teleconsultRecordingPolicy`, `teleconsultRecordingConsentRequired`, or `teleconsultRecordingRetentionDays`.

---

### 1.8 `apps/clinic-app/components/chart/EncountersTimelineTab.tsx`
- **Lines 261-285**:
  - Encounter card header renders ROS category, YAKAP badge, Signed/Draft badge, and expand chevron.
  *Observed gap*:
  - No recording status indicator or badge (`Recorded • mm:ss`, `Medico-Legal Hold`, `Purged`).
  - `ClinicRecordingPlayerModal.tsx` does **not exist**.
  - No ticketed streaming playback button or Admin medico-legal hold controls.

---

## 2. Logic Chain

1. **Backend & Architecture Alignment (R1-R3)**:
   - The facility backend (`services/clinic-api`) exposes teleconsultation settings in `ClinicSettingsDto`, provides staff-driven policy switching (`UpdateTeleconsultPaymentPolicyCommand`), supports plain-note emergency overrides, joins WebRTC calls via zero-PHI Interop tokens, and saves sovereign AES-256-GCM vault recordings streamed with 15-minute HMAC tickets.
   - Therefore, the clinic workstation frontend must have strongly-typed TypeScript DTOs and API methods in `clinicService.ts` matching these exact endpoints.

2. **Communications SDK Boundary (R4)**:
   - `@clinicez/comms-sdk` provides `useCallSession`, `CallWaitingRoom`, and `CallStage`.
   - `TeleconsultWaitingRoomModal.tsx` should not maintain unverified local mock state; it must invoke `useCallSession` configured with `clinicService` callbacks and render `CallWaitingRoom` during staging and `CallStage` during active calls.
   - Workstation clinical charting requires that clinicians can write SOAP/YAKAP notes during an active call. Therefore, `CallStage`'s `renderWorkstationAction` slot must provide an "Open Consultation Chart" action that minimizes the stage into a compact docked status bar and opens the chart.

3. **Modality Distinction & Policy Freedom (R2)**:
   - Appointments in ClinicEZ can be either `InPerson` or `Teleconsult`.
   - In `ScheduleVisitModal`, staff need a clean modality selector so teleconsult appointments receive an assigned `CallId` and linked `Invoice` when prepaid.
   - In `AppointmentInspectionModal`, the "Enter Waiting Room" button must only be shown for teleconsult appointments, displaying true DTO payment status and enabling staff to switch payment policies or apply overrides.

4. **Facility Governance & Medico-Legal Compliance (R1, R3)**:
   - Administrative configuration in `GeneralSettingsTab` needs `TeleconsultSettingsCard` to set retention days, fees, and dual-consent rules.
   - Signed teleconsult encounters in `EncountersTimelineTab` need verification of recording availability and a dedicated `ClinicRecordingPlayerModal` for decrypted HMAC playback and WORM legal hold locking.

5. **Guardrail Invariants (R6)**:
   - `check-tokens.mjs` strictly prohibits raw hex/rgb colors, numeric font sizes, numeric border radii, and emoji characters. Every new or modified component must strictly consume `theme.colors.*`, `theme.radii.*`, `ThemedText`, and `Icon`.
   - `check-no-external-hosts.mjs` strictly prohibits hardcoded `http(s)://` or `localhost` strings. Streaming URLs must be constructed dynamically from runtime config.
   - All interactive controls must satisfy the `>= 44px` minimum touch target requirement.

---

## 3. Caveats

1. **Unrelated Test Failures**: `bun test tests` currently exits with code 1 due to 199 legacy test failures across unrelated files (`PatientSummarySpine`, `ClinicChatDrawerHost`, etc.). Any new teleconsultation tests should be added to a dedicated test file (`tests/teleconsultWorkflow.test.ts`) that executes cleanly with zero failures.
2. **WebRTC Media Availability on Headless/LAN Environments**: In offline clinic LAN environments or headless tests, LiveKit servers may not be reachable. The integration must gracefully handle `mediaAvailable === false` using the fallback preview without crashing the workstation UI.
3. **No Schema Changes**: All UI work relies strictly on existing database columns and API DTOs; zero database migrations are involved.

---

## 4. Conclusion & Required Frontend Implementation Work

To achieve full end-to-end teleconsultation functionality in `apps/clinic-app`, the following work packages are required:

### Work Package A: Typed DTOs & API Methods (`apps/clinic-app/services/clinicService.ts`)
1. **Define Teleconsult Types**:
   - `TeleconsultPaymentPolicy`: `'Prepaid' | 'Postpaid' | 'Exempt'`
   - `TeleconsultPaymentStatus`: `'Pending' | 'Paid' | 'Exempt' | 'Overridden'`
   - `TeleconsultRecordingPolicy`: `'Disabled' | 'WorkspaceVaultOnly' | 'Both'`
   - `TeleconsultStatusDto`
   - `EmergencyOverrideInput`: `{ reasonCode?: string; reasonNote: string }`
   - `TeleconsultCallJoinDto`: `{ callId, roomName, relayUrl, clinicianToken, participantIdentity, mediaAvailable, mediaStatusMessage, recordingPolicy, recordingConsentRequired }`
   - `TeleconsultRecordingSessionDto` & `TeleconsultRecordingSegmentDto`
   - `TeleconsultPlaybackTicketDto`: `{ ticket, expiresAtUtc, streamUrl }`
2. **Extend Existing Interfaces**:
   - `AppointmentItem`: add `appointmentType`, `isTeleconsult`, `paymentPolicy`, `paymentStatus`, `invoiceId`, `paidAmount`, `callId`, `admittedAtUtc`, `isEmergencyOverride`, `emergencyOverrideReasonCode`.
   - `ClinicSettingsRecord`: add `teleconsultRecordingPolicy`, `teleconsultRecordingRetentionDays`, `teleconsultRecordingConsentRequired`, `teleconsultPaymentPolicy`, `teleconsultDefaultFee`.
   - `createAppointment`: accept `appointmentType?: 'InPerson' | 'Teleconsult'` and `paymentPolicy?: TeleconsultPaymentPolicy`.
3. **Implement API Methods**:
   - `getTeleconsultStatus(appointmentId)`: `GET /teleconsult/appointments/${appointmentId}/status`
   - `updateTeleconsultPaymentPolicy(appointmentId, policy)`: `PUT /teleconsult/appointments/${appointmentId}/payment-policy`
   - `admitTeleconsultPatient(appointmentId, override?)`: `POST /teleconsult/appointments/${appointmentId}/admit`
   - `joinTeleconsultCall(appointmentId)`: `POST /teleconsult/appointments/${appointmentId}/join`
   - `endTeleconsultCall(appointmentId)`: `POST /teleconsult/appointments/${appointmentId}/end`
   - `requestRecordingConsent(payload)`: `POST /teleconsult/recordings/sessions/request-consent`
   - `submitPatientRecordingConsent(sessionId, payload)`: `POST /teleconsult/recordings/sessions/${sessionId}/patient-consent`
   - `revokeRecordingConsent(sessionId, reason?)`: `POST /teleconsult/recordings/sessions/${sessionId}/revoke-consent`
   - `uploadRecordingSegment(sessionId, bytes, meta)`: `POST /teleconsult/recordings/sessions/${sessionId}/segments`
   - `finalizeRecordingSession(sessionId)`: `POST /teleconsult/recordings/sessions/${sessionId}/finalize`
   - `getConsultationRecording(consultationId)`: `GET /teleconsult/recordings/consultations/${consultationId}`
   - `getAppointmentRecording(appointmentId)`: `GET /teleconsult/recordings/appointments/${appointmentId}`
   - `createRecordingPlaybackTicket(sessionId)`: `POST /teleconsult/recordings/sessions/${sessionId}/playback-ticket`
   - `buildRecordingStreamUrl(sessionId, ticket, segmentIndex?)`: Dynamic URL builder using current API base.
   - `placeRecordingLegalHold(sessionId, reason)`: `POST /teleconsult/recordings/sessions/${sessionId}/legal-hold`
   - `releaseRecordingLegalHold(sessionId, reason?)`: `DELETE /teleconsult/recordings/sessions/${sessionId}/legal-hold`

---

### Work Package B: Clinic Comms Context & Docking (`apps/clinic-app/context/ClinicCommsContext.tsx`)
1. Extend `TeleconsultSessionParams` with `patientId?: string`, `recordingPolicy?`, `recordingConsentRequired?`.
2. Add docking state and handlers: `isCallStageDocked`, `dockCallStage()`, `maximizeCallStage()`, and `onOpenConsultationChart` callback wiring.

---

### Work Package C: Teleconsult Waiting Room & Active Call Stage (`apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx`)
1. Wire `useCallSession` from `@clinicez/comms-sdk/react` backed by `clinicService`.
2. Render `CallWaitingRoom` from `@clinicez/comms-sdk/native-ui` during staging with staff payment policy selector, plain-note override modal, and informational YAKAP badge.
3. When call is admitted and active, render `CallStage` with live media controls, persistent recording banner with dual-party stop, and a workstation action button: **"Open Consultation Chart"**.
4. Implement docking UI: when docked, render a floating mini-bar at bottom-right with participant status, mic/cam mute toggles, recording pill, and a **Maximize** button.

---

### Work Package D: Scheduling & Calendar Inspection (`ScheduleVisitModal.tsx` & `AppointmentInspectionModal.tsx`)
1. **`ScheduleVisitModal.tsx`**:
   - Add segmented toggle for **Visit Modality**: `In-Person` vs `Teleconsult`.
   - When `Teleconsult` is selected, display **Payment Policy** selector (`Prepaid` / `Postpaid` / `Exempt`), default to `settings.teleconsultPaymentPolicy`, and display informational YAKAP badge if enlisted.
   - Pass `appointmentType` and `paymentPolicy` to `createAppointment`.
2. **`AppointmentInspectionModal.tsx`**:
   - Render modality badge (`Teleconsult` vs `In-Person`).
   - If teleconsult: render payment status badge (`Paid`, `Pending`, `Exempt`, `Overridden`) and payment policy badge (`Prepaid`, `Postpaid`, `Exempt`).
   - Provide inline payment policy switcher (`Prepaid` / `Postpaid` / `Exempt`) calling `updateTeleconsultPaymentPolicy`.
   - Render **"Enter Waiting Room"** button **only** when `appointment.isTeleconsult === true` or `appointment.appointmentType === 'Teleconsult'`, passing real DTO fields and `patientId`.

---

### Work Package E: Facility Teleconsult Settings (`TeleconsultSettingsCard.tsx` & `GeneralSettingsTab.tsx`)
1. Create `apps/clinic-app/components/settings/cards/TeleconsultSettingsCard.tsx` using `SettingsSplitCard`:
   - Default payment policy: `Prepaid` | `Postpaid` | `Exempt`.
   - Default teleconsult fee input (₱).
   - Recording policy: `Disabled` | `WorkspaceVaultOnly` | `Both`.
   - Dual-consent required toggle.
   - Retention period input (days).
   - Save handler calling `clinicService.updateSettings`.
2. Mount `TeleconsultSettingsCard` in `GeneralSettingsTab.tsx` under the `clinical` section.

---

### Work Package F: Encounter Timeline & Vault Player (`ClinicRecordingPlayerModal.tsx` & `EncountersTimelineTab.tsx`)
1. Create `apps/clinic-app/components/teleconsult/ClinicRecordingPlayerModal.tsx`:
   - Mint 15-minute HMAC ticket via `createRecordingPlaybackTicket`.
   - Stream decrypted recording chunks via `<video>` on web using range processing.
   - Display recording metadata (duration, container, date, storage size).
   - Admin Medico-Legal Hold actions: **Place Hold** (with mandatory `>= 5` chars validation) and **Release Hold**.
2. Update `EncountersTimelineTab.tsx`:
   - Render recording availability badge on teleconsult encounter cards (`Recorded • mm:ss`, `Medico-Legal Hold`, `Purged`).
   - Add **"Play Recording"** button launching `ClinicRecordingPlayerModal`.

---

### Work Package G: Automated Test Suite (`apps/clinic-app/tests/teleconsultWorkflow.test.ts`)
- Add comprehensive automated tests verifying:
  - `clinicService` teleconsult methods, payment gating, and DTO mappings.
  - `ScheduleVisitModal` modality switching, policy selection, and YAKAP informational badges.
  - `AppointmentInspectionModal` conditional waiting room launch and inline policy switching.
  - `TeleconsultSettingsCard` rendering and preference saving.
  - `ClinicRecordingPlayerModal` ticket minting and medico-legal hold operations.

---

## 5. Verification Method

To verify the completed implementation independently, execute the following commands in order:

1. **Typecheck Verification**:
   ```bash
   bun --filter @clinicez/clinic-app typecheck
   ```
   *Expected*: Exits with code 0 and 0 diagnostic errors.

2. **Design Token Linter Verification**:
   ```bash
   bun --filter @clinicez/clinic-app lint:tokens
   ```
   *Expected*: Exits with code 0 and 0 token violations.

3. **External Host Linter Verification**:
   ```bash
   bun --filter @clinicez/clinic-app lint:hosts
   ```
   *Expected*: Exits with code 0 and 0 external host violations.

4. **Teleconsultation Automated Test Suite**:
   ```bash
   bun --filter @clinicez/clinic-app test tests/teleconsultWorkflow.test.ts
   ```
   *Expected*: All tests pass with code 0.

5. **Manual Invalidation Conditions**:
   - If `ScheduleVisitModal` allows booking a teleconsult without selecting a payment policy or defaults to undefined, verification fails.
   - If `AppointmentInspectionModal` displays "Enter Waiting Room" for an `In-Person` appointment, verification fails.
   - If active YAKAP status automatically forces `paymentPolicy` to `Exempt` without staff consent, verification fails.
   - If `check-tokens.mjs` detects any literal `#hex`, `rgba()`, numeric `fontSize`, or numeric `borderRadius`, verification fails.
   - If `check-no-external-hosts.mjs` detects any hardcoded URL or `localhost` string, verification fails.
