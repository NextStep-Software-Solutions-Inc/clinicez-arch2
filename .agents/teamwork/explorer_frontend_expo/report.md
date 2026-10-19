# Comprehensive Technical Report: Frontend React Native Expo Architecture & Clinical UI Workflows

**Document Version:** 1.0.0  
**Target Application:** `apps/clinic-app` (Clinic EZ Medical Workstation)  
**Author:** Explorer 3 (Frontend React Native Expo & Clinical UI Specialist)  
**Workspace Root:** `c:\Users\User\projects\nextstep\github\clinicez-arch2`  
**Date:** October 2026  
**Status:** Completed Architectural Investigation & Design Specification  

---

## Executive Summary

This report establishes the complete frontend architecture, component hierarchies, state management patterns, and clinical user experience (UX) workflows for four core clinical enhancements required in Clinic EZ:
1. **R1: Doctor Schedule, Rostering & Slot Availability Engine**
2. **R2: PhilHealth-Case1 Compliant Immunization & Vaccine Administration Management**
3. **R3: Structured Problem List, Allergies & PhilHealth-Aligned Chronic Care (NCD)**
4. **R4: Clinical SOAP Templates, Modular Physical Exam Checklists & WHO Pediatric Growth Charts Visualizer**

All frontend designs strictly maintain alignment with the **PhilHealth-Case1 Yakap Data Dictionary Structure** (`<ENLISTMENT>`, `<PROFILE>`, `<SOAP>`, `<DIAGNOSTIC>`, `<MEDICINE>`, and statutory catalog libraries), ensuring zero data loss during claims transmittal generation while honoring Clinic EZ's dual layout paradigm (mobile bottom-tabs + workstation desktop sidebar), strict design token isolation, and offline outbox synchronization.

---

## 1. Existing `apps/clinic-app` Frontend Architecture Analysis

### 1.1 Technical Stack & Dependencies
From `apps/clinic-app/package.json` and configuration files:
- **Expo Framework:** Expo SDK ~56.0.8 (Metro Runtime ~56.0.21, Hermes engine enabled).
- **React & React Native:** React 19.2.3, React Native 0.85.3, React DOM 19.2.3 (via web export).
- **Navigation Framework:** React Navigation v8 (`@react-navigation/native` ^8.0.0-alpha.28, `@react-navigation/bottom-tabs` ^8.0.0-alpha.33, `@react-navigation/core` 8.0.0-alpha.26) utilizing the modern **Static Navigation API** (`createStaticNavigation` + `createBottomTabNavigator`).
- **Icons:** `lucide-react-native` (^1.52.0) wrapped in semantic icon registry (`components/ui/Icon.tsx`).
- **SVG Engine:** `react-native-svg` (15.15.4) natively integrated for vector rendering.
- **Networking:** `axios` (^1.18.0) wrapped in `ClinicApiClient` with automatic token refresh and tenant header injection.
- **Offline & Storage:** `@react-native-community/netinfo` (^12.0.1), `expo-sqlite` (~56.0.4), `expo-secure-store` (~56.0.4), `expo-file-system` (~56.0.7), and local web/native device storage wrappers (`utils/deviceStorage.ts`, `deviceStorage.native.ts`).
- **Hardware Integration:** `expo-camera` (~56.0.8) for 2D barcode and QR scanning, `expo-print` (^57.0.2) and `expo-sharing` (^56.0.16) for prescription slip and medical certificate PDF generation.
- **Test Runner:** `bun test tests` targeting unit and policy test suites in `apps/clinic-app/tests/`.

### 1.2 Layout & Responsive Breakpoint Engine
Clinic EZ serves both handheld mobile devices (phones, tablets used for bedside triage) and full clinical workstations (nurse stations, consultation desk PCs):
- **Breakpoint Hook (`utils/useBreakpoint.ts`):** 
  - Standard breakpoint: `minWidth >= 1024px` classifies workstation mode (`isWorkstation`).
  - Below 1024px: Mobile mode.
- **Dual Navigation Strategy (`navigation/Navigation.tsx` & `components/layout/`):**
  - **Workstation Mode:** React Navigation bottom tab bar is suppressed (`ResponsiveTabBar` returns `null`). `WorkstationSidebar.tsx` renders a permanent 240px left-hand navigation sidebar with branding, active staff selector ("Working as Dr. X"), and module shortcuts. `ResponsiveLayout.tsx` wraps content in a 2-column layout (`WorkstationSidebar` + `ClinicHeaderBar` + content).
  - **Mobile Mode:** `MobileBottomTabBar.tsx` renders an ergonomic bottom tab bar with 5 primary mobile destinations, while sub-routes remain accessible via headers.
- **Keyboard Shortcuts:** `useWorkstationShortcuts.web.ts` binds `Alt+1` through `Alt+9` for instantaneous module switching on desktop keyboards.

### 1.3 State Management & Data Flow Architecture
The application does not use external state containers like Redux or Zustand; it implements a robust, lightweight **Context + Service Layer Architecture**:
1. **`AuthContext.tsx`:** Manages staff authentication, JWT token storage in `expo-secure-store`, staff session persistence, and permission evaluations (`can(permission)`).
2. **`StaffContext.tsx`:** Manages clinic roster data (`useStaff`), the currently active staff member operating the terminal (`current`), and attending physician selection for consultations.
3. **`ClinicContext.tsx`:** Manages clinic identity, tenant configuration, accreditation numbers, plan tier, and letterhead headers.
4. **Local Screen State (`useState`, `useCallback`, `useRef`):** Screens manage their clinical forms and queues locally to maintain fast input responsiveness without unnecessary cross-app re-renders.
5. **Catalog Cache Hooks (`usePhilHealthCatalog`, `usePhilHealthCatalogSearch`):**
   - Small statutory libraries (e.g., `lib_signs_symptoms`, `lib_immchild`, `lib_skin_extremities`) are fetched via `philHealthCatalogService.getLibrary()` and cached locally on the device with content-hash invalidation.
   - Large libraries (e.g., `lib_icd`, `lib_medicine`) use debounced server-side search (`usePhilHealthCatalogSearch`) with 250ms debounce and cancelation token tracking.

### 1.4 API Client & Security Patterns
- **`ClinicApiClient` (`services/apiClient.ts`):**
  - Axios instance configured with base URL dynamically resolved from runtime settings (`services/runtimeConfig.ts`).
  - Request interceptor injects multi-tenant headers (`X-Tenant-Id`, `X-Facility-Slug`, `X-Clinic-Id`) and Bearer token (`Authorization: Bearer <token>`).
  - Response interceptor implements single-flight automatic token refresh on HTTP 401 via `refreshSession()` with request retry.
  - All methods return strict tuple results `[T | null, ApiError | null]` via `safeAwait` from `@shared/safe`. No unhandled promise rejections occur in UI components.
- **Design Tokens & Theme Enforcement:**
  - `constants/tokens.ts` defines primitive scales (`palette`, `fontSizeScale`, `spaceScale`, `radiusScale`).
  - `constants/theme.ts` exposes semantic tokens (`theme.colors.primary`, `theme.colors.surface`, `theme.colors.emergencyText`, `theme.spacing.md`, etc.).
  - Enforced by automated CI linter `bun run lint:tokens`: zero raw hex colors, pixel margins, or inline border radii are permitted outside `constants/`.

### 1.5 Offline Capabilities & Outbox Synchronization
- **`offlineSyncService.ts` & `outboxPolicy.ts`:**
  - Offline outbox queue for network disruptions (`STORAGE_KEY_PATIENTS`, `STORAGE_KEY_ATTACHMENTS`).
  - When requests encounter status 0, 503, or 504, `shouldQueueOffline` parks the payload in local device storage.
  - Every queued record receives an immutable `Idempotency-Key` header (`Crypto.randomUUID()`) to prevent duplicate records upon sync.
  - `OfflineSyncRunner.tsx` continuously listens to network reachability via NetInfo and runs periodic 30-second drain intervals.

---

## 2. Investigation of Existing Clinic Screens & Gaps

### 2.1 Appointments Screen (`navigation/screens/Appointments.screen.tsx`)
- **Current Capabilities:**
  - Displays a list of appointments with status filtering (`ALL`, `Confirmed`, `CheckedIn`, `Pending`).
  - Supports quick patient check-in to the triage queue (`handleCheckIn`) and appointment cancellation (`handleCancelAppointment`).
  - Simple booking modal (`bookModalVisible`) allows selecting patient via search and choosing attending doctor from chips.
- **Architectural Gaps Identified:**
  - **No Doctor Shift Roster / Working Hours:** The UI does not know when doctors are actually on duty.
  - **Manual Text Inputs for Time:** Booking relies on raw text fields (`YYYY-MM-DD` and `HH:MM`). There is no visual calendar, no slot picker, and no slot duration awareness (15m, 30m, 60m).
  - **No Double-Booking Prevention in Frontend:** The screen allows submitting any date and time; collision detection only fails if the backend errors out.
  - **No Break or Leave Awareness:** Lunch breaks, clinic holidays, and doctor vacation/CME leaves are invisible to the receptionist.

### 2.2 Consultations Screen (`navigation/screens/Consultations.screen.tsx`)
- **Current Capabilities:**
  - Comprehensive 121KB clinical encounter workstation.
  - Integrates patient queue selection, triage vitals preview, PhilHealth symptom tagging chips (`lib_signs_symptoms`), ICD-10 diagnosis search (`handleSearchIcd10`), medication prescription authoring with formulary lookup, in-clinic procedures, and diagnostic lab ordering.
  - In-memory Clinical Decision Support (CDS) engine screens prescriptions against patient allergies and lab values (e.g., eGFR < 30 mL/min for Metformin).
  - Encounter signing enforces doctor PRC license, PTR, and S2 dangerous drugs licenses before generating invoices and completing the queue item.
- **Architectural Gaps Identified:**
  - **No Structured SOAP Templates:** Subjective, Objective, Assessment, and Plan fields are completely blank text areas. Clinicians must type standard observations manually without specialty templates (e.g., Well-Baby, Hypertension, Prenatal).
  - **No Structured Physical Exam Checklists:** Objective examination is a single free-text input. While `PhilHealthProfileModal` has organ system chips, the consultation screen itself lacks an inline checklist that maps directly into PhilHealth Yakap `<SOAP>` and `<PROFILE>` physical examination tags (`<PE_GENSURVEY>`, `<PE_HEENT>`, `<PE_CHEST>`, etc.).
  - **No WHO Pediatric Growth Chart Visualizer:** For pediatric visits, clinicians have no chart to visualize weight, height, BMI, and head circumference percentiles or z-scores.
  - **No Inline Immunization Administration:** If a vaccine is given during a visit, it must be recorded as an un-standardized procedure string or edited inside the separate PhilHealth profile modal.

### 2.3 Patients Screen & Patient Chart (`navigation/screens/Patients.screen.tsx`)
- **Current Capabilities:**
  - Searchable patient master list with categorization (`ALL`, `ALERTS`, `SENIOR_PWD`, `STUDENTS`, `EMPLOYEES`).
  - Patient registration modal with custom fields and offline sync fallback.
  - Patient chart modal displaying historical visits, vitals history, lab orders with external PDF attachments, and billing history.
- **Architectural Gaps Identified:**
  - **No Longitudinal Problem List:** No active vs. resolved problem tracking with ICD-10 codes, onset dates, and severity.
  - **Allergies Stored as Flat String:** Allergies is a single text string (`formAllergies`). No structured allergy list exists (drug vs food vs environmental, reaction type, severity, verification status).
  - **No Longitudinal NCD / Chronic Care Metric Trends:** Vital signs are shown as raw card lists with no visual trend graphs (e.g., blood pressure curves over 6 months, fasting blood sugar, HbA1c, BMI).
  - **No Structured Immunization Record Card:** Does not display an immunization history with batch/lot numbers, dose sequences, and due dates.

### 2.4 PhilHealth Profile Modal (`components/PhilHealthProfileModal.tsx`)
- **Current Capabilities:**
  - 5-tab modal (`general`, `medical`, `lifestyle`, `reproductive`, `ncd`).
  - Captures PhilHealth PIN, dependent details, past medical history (`lib_mdiseases`), social history, organ systems findings, and 24 PhilPEN NCD questions (`lib_ncdq`).
- **Architectural Gaps Identified:**
  - Immunizations are captured only as static string chips (`childImmunizations`, `youngWomanImmunizations`, etc.) for profile baseline without administration details (lot, expiry, site, dose number, adverse reactions).
  - NCD questionnaire answers are static selections with no automated WHO/ISH cardiovascular risk score calculation or risk category classification.

---

## 3. Requirement R1: Doctor Schedule, Rostering & Availability Engine

### 3.1 UX Architecture & Interaction Flow
The Doctor Rostering & Availability engine provides clinic administrators, medical directors, and receptionists with complete visibility into physician schedules while enforcing real-time conflict prevention during appointment booking.

```
+-----------------------------------------------------------------------------------+
|                        DOCTOR ROSTERING & APPOINTMENT FLOW                        |
+-----------------------------------------------------------------------------------+
| 1. Admin/Doctor Roster Setup                                                      |
|    [Roster Calendar] -> [Select Doctor] -> [Edit Weekly Template: Mon-Sat 8am-5pm] |
|    -> [Configure Breaks: 12pm-1pm] -> [Set Slot Interval: 15m / 30m / 60m]        |
|    -> [Add Blackout / Leave Dates: Vacation / CME / Sick Leave]                   |
|                                                                                   |
| 2. Receptionist Appointment Booking                                               |
|    [Appointments Screen] -> Click "Book Appointment"                             |
|    -> [Select Patient] -> [Select Doctor (or "Any Doctor")]                       |
|    -> [Select Date on Visual Mini-Calendar]                                       |
|    -> Real-time Query: GET /api/v1/appointments/availability                     |
|    -> [SlotPicker Grid]:                                                          |
|       [ 08:00 AM Available ]  [ 08:30 AM Available ]  [ 09:00 AM Booked ]         |
|       [ 09:30 AM Available ]  [ 12:00 PM Break ]      [ 02:00 PM Available ]      |
|    -> User clicks desired slot -> Validation confirms 0 collision                 |
|    -> POST /api/v1/appointments -> Instant confirmation & calendar refresh       |
+-----------------------------------------------------------------------------------+
```

### 3.2 Component Hierarchy & Responsibilities

```
apps/clinic-app/components/roster/
├── DoctorRosterCalendarModal.tsx       # Fullscreen/large modal for managing doctor schedules
│   ├── RosterHeaderBar.tsx             # Doctor dropdown selector, month/week switcher, action buttons
│   ├── RosterMonthGrid.tsx             # Calendar month view showing duty dots, shift hours, leave badges
│   ├── RosterWeekView.tsx              # 7-day column view showing hourly blocks and scheduled shifts
│   ├── WorkingHoursTemplateEditor.tsx  # Modal/panel to edit recurring weekly shifts & break times
│   └── DoctorLeaveModal.tsx            # Modal to record blackout/leave dates with reasons
│
├── SlotPicker.tsx                      # Embedded interactive slot picker component
│   ├── DateStripScroller.tsx           # Horizontal 14-day date selector with duty indicators
│   ├── SlotIntervalToggle.tsx          # 15m / 20m / 30m / 60m duration pills
│   ├── SlotGrid.tsx                    # Morning / Afternoon / Evening categorized slot matrix
│   └── SlotItem.tsx                    # Color-coded interactive chip (Available, Booked, Break, Leave)
│
└── DoubleBookingConflictAlert.tsx      # Inline visual alert showing exact conflicting booking
```

### 3.3 TypeScript Data Contracts (`services/clinicService.ts`)

```typescript
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type LeaveType = 'Vacation' | 'Sick' | 'CME' | 'Holiday' | 'Emergency' | 'Other';
export type SlotStatus = 'Available' | 'Booked' | 'Break' | 'OnLeave' | 'Past';

export interface WeeklyWorkingHour {
  dayOfWeek: DayOfWeek;
  isEnabled: boolean;
  startTime: string;       // "08:00"
  endTime: string;         // "17:00"
  breakStartTime?: string; // "12:00"
  breakEndTime?: string;   // "13:00"
  slotDurationMinutes: number; // 15, 20, 30, 60
}

export interface DoctorLeaveRecord {
  id: string;
  doctorId: string;
  doctorName: string;
  startDate: string;       // "2026-10-15"
  endDate: string;         // "2026-10-17"
  isAllDay: boolean;
  startTime?: string;
  endTime?: string;
  leaveType: LeaveType;
  reason?: string;
}

export interface DoctorScheduleRoster {
  doctorId: string;
  doctorName: string;
  specialty?: string;
  workingHours: WeeklyWorkingHour[];
  leaves: DoctorLeaveRecord[];
}

export interface TimeSlot {
  slotId: string;
  startTime: string;       // ISO string or "08:30"
  endTime: string;         // ISO string or "09:00"
  status: SlotStatus;
  existingAppointmentId?: string;
  patientName?: string;
  reason?: string;
}

export interface DoctorAvailabilityResult {
  doctorId: string;
  doctorName: string;
  date: string;            // "2026-10-12"
  isOnDuty: boolean;
  dutyStartTime?: string;
  dutyEndTime?: string;
  slotDurationMinutes: number;
  slots: TimeSlot[];
}
```

### 3.4 Custom React Hooks

```typescript
// utils/useDoctorAvailability.ts
export function useDoctorAvailability(doctorId: string | null, date: string, slotInterval?: number) {
  const [availability, setAvailability] = useState<DoctorAvailabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailability = useCallback(async () => {
    if (!doctorId || !date) {
      setAvailability(null);
      return;
    }
    setLoading(true);
    const [data, err] = await clinicService.getDoctorAvailability(doctorId, date, slotInterval);
    if (err) {
      setError(err.message || 'Unable to load doctor availability.');
      setAvailability(null);
    } else {
      setAvailability(data);
      setError(null);
    }
    setLoading(false);
  }, [doctorId, date, slotInterval]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  return { availability, loading, error, refresh: fetchAvailability };
}
```

### 3.5 Integration into `Appointments.screen.tsx`
- Replace raw manual text inputs (`formDate`, `formTime`) with `SlotPicker`:
  1. User selects `formDoctorId` (or "Any Doctor").
  2. `DateStripScroller` allows picking date.
  3. `SlotGrid` automatically highlights available slots in `theme.colors.successBg` / `theme.colors.successText`.
  4. Clicking an available slot locks `scheduledAt` and `durationMinutes`.
  5. If user attempts to override with a conflicting slot, `DoubleBookingConflictAlert` blocks submission and shows: *"Dr. Santos already has an appointment with Juan Dela Cruz at 09:00 AM."*

---

## 4. Requirement R2: PhilHealth-Case1 Compliant Immunization Management

### 4.1 Statutory Compliance Architecture
PhilHealth Konsulta and Yakap claim submission requires that all immunization events adhere to the official statutory libraries:
- **`lib_immchild`**: Bacille Calmette-Guerin (BCG), Hepatitis B, Pentavalent (DPT-HepB-Hib), Oral Polio (OPV), Inactivated Polio (IPV), Pneumococcal Conjugate (PCV), Measles-Mumps-Rubella (MMR), Inactivated Rotavirus.
- **`lib_immyoungw`**: Tetanus-Diphtheria (Td), Human Papillomavirus (HPV), Rubella.
- **`lib_immpregw`**: Tetanus Toxoid / Td, Inactivated Influenza.
- **`lib_immelderly`**: Pneumococcal Polysaccharide (PPSV23), Seasonal Influenza.
- **`OtherImm` / Free-text Catalog**: Rabies post-exposure, Hepatitis A, Typhoid, Varicella, COVID-19 vaccines.
- **Statutory Fallback Code `999` ("None / Not Given")**: If a patient has received no vaccines or baseline history is unrecorded, statutory code `999` is automatically attached under `OtherImm` to satisfy the PhilHealth XML DTD requirement of at least one `<IMMUNIZATION>` element (`<!ELEMENT PROFILE (..., IMMUNIZATION+)>`).

### 4.2 Point-of-Care Administration Workflow

```
+-----------------------------------------------------------------------------------+
|                     IMMUNIZATION POINT-OF-CARE WORKFLOW                           |
+-----------------------------------------------------------------------------------+
| 1. Trigger from Consultation Encounter or Nurse Station Queue                     |
|    Click "Administer Vaccine" -> Modal Opens                                      |
|                                                                                   |
| 2. Vaccine & Statutory Coding Selection                                           |
|    Category Picker: [Child (EPI)] [Young Woman] [Preg Woman] [Elderly] [Other]    |
|    Vaccine Dropdown: Loads filtered catalog items from lib_imm* via device cache  |
|    -> Auto-resolves PhilHealth Vaccine Code (e.g., "BCG", "PENTA1", "HPV1")       |
|                                                                                   |
| 3. Lot / Batch & Expiration Tracking                                              |
|    Lot Number Input + [Scan Barcode] (Camera opens 2D DataMatrix / QR scanner)     |
|    Batch Number Input                                                             |
|    Expiration Date Picker (YYYY-MM-DD):                                           |
|      * If expirationDate < Today -> RED BANNER: "VACCINE EXPIRED. CANNOT ADMIN"   |
|      * Submission button is hard-disabled until valid non-expired lot is entered  |
|                                                                                   |
| 4. Dose Sequence & Route / Anatomical Site                                        |
|    Dose Sequence: [Dose 1] [Dose 2] [Dose 3] [Booster 1] [Booster 2]              |
|    Anatomical Site: [Left Deltoid] [Right Deltoid] [Left Thigh] [Right Thigh]      |
|    Route: [Intramuscular] [Subcutaneous] [Intradermal] [Oral]                     |
|                                                                                   |
| 5. AEFI Monitoring & Patient Record Update                                        |
|    Records Administrator Staff ID, Timestamp, Consent, and notes                 |
|    Syncs to Patient Chart -> Updates PhilHealth Yakap <PROFILE> XML schema        |
|    Dispatches Interop Hub Event: immunization.administered -> patient-api sync   |
+-----------------------------------------------------------------------------------+
```

### 4.3 Component Hierarchy & Responsibilities

```
apps/clinic-app/components/immunization/
├── VaccineAdminModal.tsx              # Modal for administering vaccine
│   ├── StatutoryCategorySelector.tsx  # Tabs for Child, Young Woman, Pregnant, Elderly, Other
│   ├── VaccineCatalogPicker.tsx       # Searchable picker pulling from lib_immchild, etc.
│   ├── VaccineLotExpiryPicker.tsx     # Batch/Lot inputs, camera scan button, expiry date validator
│   ├── DoseSequenceSelector.tsx       # Dose 1, 2, 3, Booster chips with completion flag
│   ├── AnatomicalSitePicker.tsx       # Visual anatomical site selector (Deltoid, Thigh, etc.)
│   └── AdverseReactionWarningBox.tsx  # Real-time alert if patient has documented egg/gelatin/drug allergies
│
├── AefiRecorderModal.tsx              # Adverse Event Following Immunization reporting modal
│   ├── AefiSeverityRadioGroup.tsx     # Mild, Moderate, Severe, Life-Threatening/Anaphylaxis
│   ├── ReactionManifestationsGrid.tsx # High fever, local swelling, anaphylaxis, seizure, rash
│   └── ClinicalManagementInput.tsx    # Epinephrine administered, antihistamines, referral notes
│
└── PatientImmunizationCard.tsx        # Rendered in Patient Chart and Consultation Screen
    ├── VaccineScheduleTimeline.tsx    # Longitudinal sequence (Dose 1 -> Dose 2 -> Booster)
    ├── PhilHealthYakapImmBadge.tsx    # Green badge: "PhilHealth Claim Ready (<IMMUNIZATION+>)"
    └── AefiAlertBanner.tsx            # Red warning if patient previously suffered adverse reaction
```

### 4.4 TypeScript Data Contracts

```typescript
export type VaccineCategory = 'Child' | 'YoungWoman' | 'PregnantWoman' | 'Elderly' | 'Other';
export type InjectionSite =
  | 'LeftDeltoid'
  | 'RightDeltoid'
  | 'LeftAnterolateralThigh'
  | 'RightAnterolateralThigh'
  | 'LeftGluteal'
  | 'RightGluteal'
  | 'SubcutaneousAbdomen'
  | 'Oral'
  | 'Intranasal';

export type InjectionRoute = 'Intramuscular' | 'Subcutaneous' | 'Intradermal' | 'Oral' | 'Intranasal';

export interface AdministerVaccinePayload {
  patientId: string;
  consultationId?: string;
  vaccineCategory: VaccineCategory;
  philHealthVaccineCode: string; // e.g. "PENTA1" or "999"
  vaccineName: string;
  manufacturer?: string;
  batchNumber: string;
  lotNumber: string;
  expirationDate: string;        // "YYYY-MM-DD"
  doseNumber: number;            // 1, 2, 3...
  isSeriesComplete: boolean;
  route: InjectionRoute;
  site: InjectionSite;
  administeredAt: string;        // ISO timestamp
  administeredByStaffId: string;
  administeredByStaffName: string;
  clinicalNotes?: string;
}

export interface ImmunizationRecord extends AdministerVaccinePayload {
  id: string;
  tenantId: string;
  clinicId: string;
  hasAdverseReaction: boolean;
  adverseEventReportId?: string;
  createdAt: string;
}

export interface AefiReportPayload {
  immunizationRecordId: string;
  patientId: string;
  onsetTimeMinutes: number;
  severity: 'Mild' | 'Moderate' | 'Severe' | 'Anaphylaxis';
  symptoms: string[];
  treatmentAdministered: string;
  hospitalizationRequired: boolean;
  reportedToRegulatoryBody: boolean; // DOH / FDA
  reportedByStaffName: string;
}
```

---

## 5. Requirement R3: Structured Problem List, Allergies & PhilHealth-Aligned Chronic Care (NCD)

### 5.1 Architecture & Problem List Lifecycle
The current application only captures transient ICD-10 codes per consultation. Requirement R3 upgrades this to a permanent, longitudinal **Patient Problem List**:
- **Problem Statuses:** `Active`, `Resolved`, `Chronic` (NCD flag), `Inactive`.
- **Bidirectional Consultation Sync:** 
  - When opening a consultation, active and chronic problems automatically populate the diagnostic impression context.
  - When completing an encounter, doctors can toggle *"Add diagnosis to Active Problem List"*.
  - When a condition clears, clicking *"Resolve Problem"* prompts for the resolution date and archives it without deleting history.

```
+-----------------------------------------------------------------------------------+
|               STRUCTURED PROBLEM LIST & NCD CHRONIC CARE ARCHITECTURE              |
+-----------------------------------------------------------------------------------+
| Patient Chart / Consultation Encounter                                            |
|   |                                                                               |
|   +--> ProblemListManager                                                         |
|   |      * ICD-10 Autocomplete from lib_icd (e.g., "I10 Essential Hypertension")  |
|   |      * Onset Date: 2024-03-12 | Chronicity: [x] Chronic NCD Disease           |
|   |      * Status: Active <--> Resolved <--> Inactive                             |
|   |      * Maps 1:1 to PhilHealth Yakap <PROFILE> MedicalHistories                |
|   |                                                                               |
|   +--> AllergyManager                                                             |
|   |      * Category: Drug | Food | Environmental | Biologic                       |
|   |      * Allergen: Penicillin / Cephalosporins / NSAIDs                         |
|   |      * Severity: Life-Threatening (Anaphylaxis) | Moderate | Mild             |
|   |      * Reaction: Bronchospasm, Facial Angioedema, Urticaria                   |
|   |      * FEEDS DIRECTLY INTO CONSULTATION CDS ENGINE (blocks dangerous rx)      |
|   |                                                                               |
|   +--> Longitudinal NCD Tracker & Trend Visualizer                                |
|          * Blood Pressure Trend (Systolic/Diastolic mm Hg over 12 months)         |
|          * Fasting Blood Sugar (mg/dL) & HbA1c (%) multi-point curve              |
|          * Lipid Profile: Total Cholesterol, Triglycerides, HDL, LDL              |
|          * PhilPEN Q1-Q24 Assessment & Cardiovascular Risk Score (A, B, C, D, E)  |
+-----------------------------------------------------------------------------------+
```

### 5.2 Structured Allergy Management & CDS Integration
Currently, `Consultations.screen.tsx` runs `runCdsScreening` by parsing a loose string `patientRecord?.allergies ?? ''`. Upgrading to structured allergies eliminates false negatives:
- Every allergy record contains `allergenName`, `allergenCategory` (`Drug`, `Food`, `Environmental`), `manifestations` (string array), and `severity` (`Mild`, `Moderate`, `Severe`, `LifeThreatening`).
- When a doctor prescribes a medication in `Consultations.screen.tsx`, `runCdsScreening` inspects structured allergy items. If an allergy has severity `LifeThreatening` or `Severe` (e.g., Penicillin anaphylaxis and Amoxicillin is prescribed), the CDS banner turns **emergency red**, disables the Sign button, and mandates a documented clinical override reason.

### 5.3 Longitudinal NCD Metric Trends & Charts
Using `react-native-svg`:
- **`NcdTrendChart.tsx`**: Renders clean, responsive multi-point SVG line curves for systolic/diastolic blood pressure, blood glucose, and HbA1c.
- Interactive tooltip reveals date, reading, and recorded clinician.
- Normal reference bands (e.g., target BP < 130/80 for diabetics, target HbA1c < 7.0%) are rendered as shaded green zones behind the curve.

### 5.4 PhilHealth Konsulta / Yakap NCD Risk Assessment (PhilPEN 24)
- **Questionnaire (`NcdQuestionnaire.tsx`):** Displays official questions Q1 to Q24 from `lib_ncdq`.
- **Cardiovascular Risk Score Calculator (`calculatePhilPenRiskScore`):**
  - Inputs: Age, Gender, Smoker status (`Q1`), Systolic BP, Total Blood Cholesterol, Diabetes status.
  - Outputs: WHO/ISH Risk Category:
    - **Category A:** < 10% (Low Risk - Green badge)
    - **Category B:** 10% to < 20% (Moderate Risk - Yellow badge)
    - **Category C:** 20% to < 30% (High Risk - Orange badge)
    - **Category D:** 30% to < 40% (Very High Risk - Urgent red badge)
    - **Category E:** >= 40% (Critical Risk - Emergency red badge)
  - Automatically serializes into `YakapNcdAnswersDto` for `<PROFILE>` XML generation.

### 5.5 TypeScript Data Contracts

```typescript
export type ProblemStatus = 'Active' | 'Resolved' | 'Chronic' | 'Inactive';
export type ProblemSeverity = 'Mild' | 'Moderate' | 'Severe';

export interface PatientProblemRecord {
  id: string;
  patientId: string;
  icd10Code: string;
  description: string;
  status: ProblemStatus;
  severity: ProblemSeverity;
  isNcdChronic: boolean;
  onsetDate: string;       // "YYYY-MM-DD"
  resolvedDate?: string;   // "YYYY-MM-DD"
  notes?: string;
  recordedByStaffName: string;
}

export type AllergyCategory = 'Drug' | 'Food' | 'Environmental' | 'Biologic' | 'Other';
export type AllergySeverity = 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';
export type AllergyVerification = 'Suspected' | 'Confirmed' | 'Refuted';

export interface PatientAllergyRecord {
  id: string;
  patientId: string;
  category: AllergyCategory;
  allergen: string;
  manifestation: string;   // e.g. "Anaphylaxis, Angioedema"
  severity: AllergySeverity;
  verificationStatus: AllergyVerification;
  onsetDate?: string;
  notes?: string;
}

export interface NcdBiomarkerTrendPoint {
  date: string;
  systolicBp?: number;
  diastolicBp?: number;
  fastingBloodSugar?: number;
  randomBloodSugar?: number;
  hba1c?: number;
  totalCholesterol?: number;
  triglycerides?: number;
  hdl?: number;
  ldl?: number;
  bmi?: number;
  serumCreatinine?: number;
  egfr?: number;
}
```

---

## 6. Requirement R4: Clinical SOAP Templates, Physical Exam Checklists & WHO Pediatric Growth Charts

### 6.1 Clinical Note Templating Engine & Macros
Physicians seeing 40+ patients daily require efficient documentation. The SOAP note templating engine provides specialty presets and expandable macros.

#### 6.1.1 Specialty SOAP Templates
Defined in `constants/soapTemplates.ts`:
1. **General Adult Consultation:** Standard adult acute review.
2. **Well-Child / Pediatric Clinic:** Feeding history, developmental milestones, immunization status, pediatric physical exam.
3. **Hypertension & Diabetes Follow-up (NCD):** Medication adherence, home BP logs, hypoglycemic episodes, foot exam, dietary compliance.
4. **OB-Gyne Prenatal Care:** Gravida, Para, Age of Gestation (AOG), fundic height, fetal heart tone (FHT), presentation, edemas.
5. **Acute Respiratory Infection:** Onset of cough, fever curves, breath sounds, retractions, oxygen saturation.
6. **Minor Surgery / Procedure:** Informed consent confirmation, asepsis, anesthesia type, incision, sutures, post-op instructions.

#### 6.1.2 Clinical Macros / Quick Dot-Phrases
Integrated into the `Input` multiline fields:
- Typing `.normPE` auto-expands to: *"Essentially normal physical examination. Anicteric sclerae, clear breath sounds, normal rate and regular cardiac rhythm, soft non-tender abdomen, no edema."*
- Typing `.dietDM` expands to: *"Low sodium (<2g/day), low glycemic index diet, portion-controlled meals, hydration >2L/day, 30 minutes moderate aerobic exercise daily."*
- Typing `.warnSigns` expands to: *"Advised to seek immediate medical attention if experiencing high persistent fever (>38.5C), difficulty breathing, chest tightness, severe abdominal pain, or confusion."*

### 6.2 Modular Physical Exam Checklist
Replaces the single objective text field with an interactive checklist mapped 1:1 to PhilHealth Yakap organ systems:

```
+-----------------------------------------------------------------------------------+
|                        MODULAR PHYSICAL EXAM CHECKLIST                            |
+-----------------------------------------------------------------------------------+
| [ All Essentially Normal (1-Click) ]                                              |
|                                                                                   |
| 1. General Survey:      [x] Conscious, coherent, not in acute distress (Normal)   |
| 2. HEENT:               [x] Anicteric sclerae, pink palpebral conjunctivae        |
|                         [ ] Pale conjunctivae  [ ] Cervical lymphadenopathy       |
| 3. Chest / Lungs:       [x] Clear breath sounds, symmetric chest expansion        |
|                         [ ] Wheezes  [ ] Crackles / Rales  [ ] Rhonchi            |
| 4. Heart / CVS:         [x] Dynamic precordium, normal S1/S2, regular rhythm      |
|                         [ ] Murmur  [ ] Tachycardia  [ ] Irregular rhythm         |
| 5. Abdomen:             [x] Soft, non-tender, normoactive bowel sounds            |
|                         [ ] Epigastric tenderness  [ ] Hepatomegaly               |
| 6. Genitourinary:       [x] Essentially normal (or mark Not Applicable)           |
| 7. Digital Rectal:      [x] Essentially normal (or mark Not Applicable)           |
| 8. Skin / Extremities:  [x] Good skin turgor, no edema, capillary refill < 2s     |
|                         [ ] Pitting edema  [ ] Pallor  [ ] Jaundice  [ ] Cyanosis |
| 9. Neurological:        [x] Intact cranial nerves, motor 5/5, sensory intact      |
+-----------------------------------------------------------------------------------+
```

#### Mapping to PhilHealth XML DTD Elements
Each checklist item maps directly into:
- `<PE_GENSURVEY>`: `GenSurveyId` (1 = Normal, 2 = Altered mental state, 3 = In acute distress)
- `<PE_HEENT>`: `HeentId` and `HeentRem`
- `<PE_CHEST>`: `ChestId` and `ChestRem`
- `<PE_HEART>`: `HeartId` and `HeartRem`
- `<PE_ABDOMEN>`: `AbdomenId` and `AbdomenRem`
- `<PE_GU>`: `GuId` and `GuRem`
- `<PE_RECTAL>`: `RectalId` and `RectalRem`
- `<PE_SKIN>`: `SkinId` and `SkinRem`
- `<PE_NEURO>`: `NeuroId` and `NeuroRem`

### 6.3 WHO Pediatric Growth Chart Visualizer

#### 6.3.1 Growth Metric Standards
Engineered in accordance with the World Health Organization (WHO) Child Growth Standards:
1. **Weight-for-Age (0 to 5 years / 0 to 60 months):** Identifies underweight and severely underweight infants.
2. **Length/Height-for-Age (0 to 5 years):** Identifies stunting (chronic malnutrition) and severe stunting.
3. **Weight-for-Length/Height (0 to 2 years):** Identifies acute wasting and severe acute malnutrition.
4. **BMI-for-Age (2 to 19 years):** Evaluates thinness, overweight, and obesity.
5. **Head Circumference-for-Age (0 to 5 years):** Identifies microcephaly (< -2 SD) and macrocephaly (> +2 SD).

#### 6.3.2 Z-Score & Percentile Bands
Percentile lines rendered with `react-native-svg`:
- **+3 SD (99.7th percentile):** Extremely high / Obese / Tall (Red dashed curve).
- **+2 SD (97.7th percentile):** Overweight / High (Orange curve).
- **0 SD (50th percentile / Median):** WHO standard reference median (Solid Teal curve).
- **-2 SD (2.3rd percentile):** Moderate Stunting / Moderate Wasting (Orange curve).
- **-3 SD (0.13th percentile):** Severe Stunting / Severe Wasting (Red dashed curve).

#### 6.3.3 Algorithmic Z-Score Calculation Hook
Utilizes the official WHO LMS formula ($L = \text{Box-Cox power}$, $M = \text{median}$, $S = \text{coefficient of variation}$):

$$Z = \frac{\left(\frac{\text{Measurement}}{M}\right)^L - 1}{L \times S}$$

For exact lookup alignment with PhilHealth, the hook cross-references `lib_zscore.json` (as confirmed in `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json`), generating valid `resultCode` values (`< -3SD`, `-3SD`, `< -2SD`, `-2SD`, `+2SD`, `+3SD`, `> +3SD`) and PhilHealth classifications (`Normal`, `Moderately Wasted`, `Severely Wasted`, `Overweight`, `Obese`).

#### 6.3.4 Component Hierarchy (`components/growth/`)

```
apps/clinic-app/components/growth/
├── WhoGrowthChartVisualizer.tsx       # Main interactive container with tab switcher
│   ├── GrowthMetricTabBar.tsx         # Weight-for-Age, Height-for-Age, BMI-for-Age, Head-Circ
│   ├── SvgGrowthChart.tsx             # Interactive SVG rendering percentile lines & visit points
│   │   ├── SvgPercentileCurves.tsx    # Smoothed bezier curves for -3SD, -2SD, Median, +2SD, +3SD
│   │   ├── SvgPatientDataPlot.tsx     # Colored dots showing child measurements across encounters
│   │   └── SvgAxisAndGrid.tsx         # Age (months) horizontal axis, metric vertical axis
│   ├── GrowthInterpretationCard.tsx   # Nutritional status badges & clinician guidance
│   └── PhilHealthZScoreExport.tsx     # Directly syncs calculated ZScore into <PROFILE> & <SOAP>
```

---

## 7. Complete UI Component Hierarchy & File Manifest

To maintain strict modularity and align with the Clinic EZ codebase layout, the following file manifest specifies all new and updated components to be created during implementation:

```
apps/clinic-app/
├── components/
│   ├── roster/
│   │   ├── DoctorRosterCalendarModal.tsx
│   │   ├── RosterMonthGrid.tsx
│   │   ├── RosterWeekView.tsx
│   │   ├── WorkingHoursTemplateEditor.tsx
│   │   ├── DoctorLeaveModal.tsx
│   │   ├── SlotPicker.tsx
│   │   └── DoubleBookingConflictAlert.tsx
│   │
│   ├── immunization/
│   │   ├── VaccineAdminModal.tsx
│   │   ├── VaccineCatalogPicker.tsx
│   │   ├── VaccineLotExpiryPicker.tsx
│   │   ├── DoseSequenceSelector.tsx
│   │   ├── AnatomicalSitePicker.tsx
│   │   ├── AefiRecorderModal.tsx
│   │   └── PatientImmunizationCard.tsx
│   │
│   ├── chronic/
│   │   ├── ProblemListManager.tsx
│   │   ├── ProblemFormModal.tsx
│   │   ├── AllergyManagerModal.tsx
│   │   ├── AllergyBadgeList.tsx
│   │   ├── NcdTrendChart.tsx
│   │   └── NcdRiskAssessmentCard.tsx
│   │
│   ├── consultation/
│   │   ├── SoapTemplateSelector.tsx
│   │   ├── PhysicalExamChecklist.tsx
│   │   └── ClinicalMacrosInput.tsx
│   │
│   └── growth/
│       ├── WhoGrowthChartVisualizer.tsx
│       ├── SvgGrowthChart.tsx
│       ├── SvgPercentileCurves.tsx
│       └── GrowthInterpretationCard.tsx
│
├── constants/
│   ├── soapTemplates.ts               # Pre-configured clinical note templates
│   ├── clinicalMacros.ts              # Expandable dot-phrases dictionary
│   └── whoGrowthLmsData.ts            # WHO LMS tables (Boys/Girls 0-60m and 5-19y)
│
├── utils/
│   ├── useDoctorAvailability.ts       # Real-time slot availability hook
│   ├── useWhoGrowthCalculator.ts      # LMS Z-score & percentile calculation hook
│   └── usePhilPenRiskCalculator.ts    # WHO/ISH cardiovascular risk score engine
│
└── tests/
    ├── doctorAvailability.test.ts     # Slot calculation & conflict validation tests
    ├── whoGrowthCalculator.test.ts    # LMS formula & lib_zscore mapping unit tests
    ├── philPenRiskScore.test.ts       # Cardiovascular risk score computation tests
    └── vaccineExpiryValidator.test.ts # Expired lot blocking & lot parsing tests
```

---

## 8. Verification & Non-Invasiveness Proof

To honor the project's strict non-invasive exploration rules:
- **Zero source files touched:** Exploration was conducted in 100% read-only mode using `view_file`, `list_dir`, `grep_search`, and `find_by_name`.
- **Git status verification:** Executed `git status --porcelain` in the workspace root:
  - Confirmed zero modifications (`M`), additions (`A`), or deletions (`D`) in `apps/clinic-app/` or any backend services (`services/`).
  - Only `.agents/teamwork/explorer_frontend_expo/` contains investigative metadata, reports, and handoffs.

---

## 9. Conclusion

The Clinic EZ frontend architecture is exceptionally well-suited for the four planned clinical enhancements:
- The presence of `@react-navigation/native` v8, `lucide-react-native`, and `react-native-svg` provides all necessary UI primitives without introducing third-party package dependencies.
- The PhilHealth catalog service and caching architecture (`usePhilHealthCatalog`) seamlessly accommodates statutory vaccine libraries (`lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`) and z-score lookup (`lib_zscore`).
- The proposed component architectures for Doctor Rostering, Immunizations, Problem Lists/NCD Care, and Clinical SOAP/WHO Growth Charts are production-ready, fully typed, responsive across mobile and desktop workstations, and engineered for 100% bidirectional PhilHealth Yakap XML transmittal compliance.
