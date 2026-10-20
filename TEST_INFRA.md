# Clinic Calendar Test Infrastructure & Quality Gate Specification (TEST_INFRA.md)

**Feature**: Clinic Calendar (Multi-Mode Workstation Calendar Suite)  
**Target Applications**: `apps/clinic-app`, `services/clinic-api`  
**Repository Root**: `/Users/macuser/projects/github/nextstep/clinicez-calendar`  
**Authoritative Documents**:
- `ORIGINAL_REQUEST.md` (## 2026-10-20T02:26:31Z R1–R5)
- `PROJECT.md` (Milestones M1–M4, Track-E2E, Features F1–F17, Interface Contracts)
- `clinicez-ui-ux-expert` (Design Tokens, 4 UX States, Clinical Urgency Badges)
**Version**: 1.0.0  
**Status**: APPROVED & ACTIVE  

---

## 1. Testing Methodology

The Clinic Calendar verification framework utilizes a rigorous four-pillar testing methodology designed for mission-critical clinical software. Every test case in the suite is derived directly from authoritative requirements and interface specifications, operating as genuine opaque-box tests without depending on internal implementation details.

```
+---------------------------------------------------------------------------------------+
|                                4-Pillar Testing Methodology                           |
+---------------------------+-----------------------------+-----------------------------+
| 1. Category-Partition     | 2. Boundary Value Analysis  | 3. Pairwise Combinatorial   |
| (Equivalence Classes)     | (Gregorian, Slots, Offsets) | (Orthogonal Factor Testing) |
+---------------------------+-----------------------------+-----------------------------+
                            | 4. Real-World Workloads     |
                            | (High-Pressure OPD Clincs)  |
                            +-----------------------------+
```

### 1.1 Category-Partition Method (Ostrand & Balcer)
Functional inputs and environment states are decomposed into orthogonal categories and partitioned into formal equivalence classes:

1. **View Mode Category ($V$)**:
   - $V_1$: Month View (7-column Gregorian monthly matrix, 35 or 42 cells)
   - $V_2$: Week View (7-day matrix, 07:00–19:00 vertical time axis, 30-minute intervals)
   - $V_3$: Day View (multi-provider side-by-side columns on $\ge 1024\text{px}$ desktop; adaptive single-column agenda on $<768\text{px}$)
   - $V_4$: Agenda / List View (chronological list grouped by date with search and status filters)

2. **UI/UX Interaction State Category ($S$)**:
   - $S_1$: Skeleton Loading (`CalendarSkeleton` consuming `skeletonBase` and `skeletonHighlight`, `aria-busy="true"`)
   - $S_2$: Contextual Empty State (`EmptyState` with calendar icon, clear message, and primary "Book appointment" CTA)
   - $S_3$: Actionable Error State (`ErrorState` with user-friendly message and retry button triggering API refetch)
   - $S_4$: Active Data State (interactive appointment blocks, chips, and cards with immediate feedback toasts)

3. **Clinical Urgency & Lifecycle Status Category ($U \times L$)**:
   - $U_1$: STAT / Emergency (`emergencyBg`, `emergencyText`, `emergencyBorder` - Red)
   - $U_2$: Urgent (`urgentBg`, `urgentText`, `urgentBorder` - Orange)
   - $U_3$: Routine (`routineBg`, `routineText`, `routineBorder` - Teal)
   - $L_1$: Pending (Warning yellow pill)
   - $L_2$: Confirmed (Primary teal pill)
   - $L_3$: Checked-In (Success green pill)
   - $L_4$: In Consultation (Purple pill)
   - $L_5$: Completed (Neutral surface muted pill)
   - $L_6$: Cancelled (Strikethrough text decoration with muted text)

4. **Physician Availability & Roster State Category ($R$)**:
   - $R_1$: On-Duty Working Hours (unrestricted open booking slot)
   - $R_2$: Shift Break Interval (shaded overlay with break label, e.g. "Lunch Break" 12:00–13:00)
   - $R_3$: Approved Leave Interval (blackout overlay with leave type: Vacation, Sick Leave, CME)
   - $R_4$: Unconfigured / Off-Duty Hours (muted slots outside doctor template)

5. **Desk Action Category ($A$)**:
   - $A_1$: 1-Click Empty Slot Booking (pre-populates Date, Time, and Doctor into booking modal)
   - $A_2$: Appointment Inspection Drawer (glanceable patient demographics, provider, room, notes, quick CTAs)
   - $A_3$: Appointment Rescheduling (date/time pickers, conflict handling, reasons)
   - $A_4$: Fast-Track Arrival Check-In (opens `QueueRoutingSelector`, confirms room/doctor, assigns queue ticket)

---

### 1.2 Boundary Value Analysis (BVA)
Boundary Value Analysis targets critical edge cases and transitional values where software historically experiences high defect density:

1. **Gregorian Calendar & Date Math Boundaries**:
   - **Month Transition**: Month boundary crossover (e.g. October 31 23:59:59 to November 1 00:00:00).
   - **February Leap Year vs Non-Leap Year**:
     - Leap years (2024, 2028): February has 29 days (2024-02-29, 2028-02-29 are valid, 2024-02-30 invalid).
     - Non-leap years (2025, 2026, 2027): February has 28 days (2026-02-28 valid, 2026-02-29 invalid, transitions directly to 2026-03-01).
   - **Leading & Trailing Days**: Verifying month grids calculate correct leading days from previous month and trailing days into next month to maintain uniform 35-cell or 42-cell layouts.
   - **Timezone Offset & Asia/Manila (UTC+8)**: Boundary between UTC midnight and Manila local morning (00:00 UTC = 08:00 PHT). Ensures date queries filter on the Manila calendar day rather than the server's local UTC date.

2. **Operational Time Axis Boundaries**:
   - **Clinic Opening Boundary**: First operational slot at 07:00 (07:00–07:30).
   - **Clinic Closing Boundary**: Last operational slot ending at 19:00 (18:30–19:00).
   - **Out-of-Bounds Timeslots**: Bookings before 07:00 or starting at/after 19:00 are rejected or visually flagged.
   - **Slot Intervals**: Discrete 15-minute, 30-minute, and 60-minute duration boundaries without fractional minute drift.

3. **Concurrency & Database GiST Exclusion Boundaries**:
   - **Exact Slot Overlap**: Two appointments for the same physician at identical start and end times ($[t_1, t_2] \cap [t_1, t_2] \neq \emptyset$) $\rightarrow$ PostgreSQL `23P01` GiST exclusion violation $\rightarrow$ HTTP 409 Conflict.
   - **Partial / Abutting Overlap**: Appointment starting at 09:15 overlapping a 09:00–09:30 slot $\rightarrow$ Conflict.
   - **Zero-Overlap Boundary (Abutting)**: Appointment A ending at 09:30 and Appointment B starting at exactly 09:30 $\rightarrow$ Valid, non-overlapping ($[09:00, 09:30) \cap [09:30, 10:00) = \emptyset$).
   - **Shift Break Collision**: Booking scheduled to start or overlap during a scheduled shift break (e.g. 12:30 in 12:00–13:00 lunch) $\rightarrow$ Rejected with break notice.

---

### 1.3 Pairwise Combinatorial Testing (All-Pairs)
Pairwise testing systematically tests combinations of orthogonal variables to achieve complete interaction coverage with optimal test suite execution time:

$$\text{Test Factors} = \{ \text{View Mode (4)}, \text{Action (4)}, \text{Urgency (3)}, \text{Provider State (4)}, \text{Viewport Width (2)} \}$$

The combinatorial matrix exercises:
- View Mode Switching $\leftrightarrow$ Slot Selection $\leftrightarrow$ Pre-Filled Booking Modal $\leftrightarrow$ Creation $\leftrightarrow$ Active View Refresh.
- Appointment Card Click $\leftrightarrow$ Inspection Drawer $\leftrightarrow$ Reschedule Modal $\leftrightarrow$ Conflict Error $\leftrightarrow$ Recovery.
- Appointment Card Click $\leftrightarrow$ Inspection Drawer $\leftrightarrow$ Arrival Check-In $\leftrightarrow$ Room Selection $\leftrightarrow$ Queue Ticket Assignment.
- Month Grid Day Badge Selection $\leftrightarrow$ Transition to Day View Multi-Provider $\leftrightarrow$ Doctor Schedule Filter.
- Server Date-Range Query Serialization $\leftrightarrow$ StartDate + EndDate + DoctorId $\leftrightarrow$ Backward Compatibility with legacy single `Date`.

---

### 1.4 Real-World Clinical Workloads & Stress Scenarios
High-fidelity end-to-end scenarios simulating operational conditions in busy Philippine outpatient departments (OPDs):

1. **Scenario 1: Monday Morning OPD Rush**:
   - 3 active physicians with differing shift templates (Dr. Santos 08:00–12:00, Dr. Reyes 09:00–17:00 with 12:00–13:00 lunch break, Dr. Tan on approved CME leave).
   - High-density arrivals: simultaneous check-in of arriving patients, queue ticket generation (`Q-001`, `Q-002`), transition to `CheckedIn`.
   - On-the-fly rescheduling of delayed patient from 09:00 to 11:30 with documented clinical reason.

2. **Scenario 2: Multi-Provider Simultaneous Scheduling**:
   - Desktop workstation ($\ge 1024\text{px}$) displaying side-by-side doctor columns.
   - Desk staff books appointments across multiple doctor columns sequentially using 1-click slot clicks.
   - Verifies pre-filled date, time, and doctor identity carry over without state contamination between physicians.

3. **Scenario 3: STAT Urgent Walk-In Arrival & Slot Preemption**:
   - Acute emergency patient (severe chest pain, STAT urgency) arrives without prior booking.
   - Desk staff inspects calendar, identifies nearest slot occupied by a routine consultation, initiates reschedule of routine patient with courtesy reason, and books the emergency patient into the newly opened slot with `STAT` emergency badge.

4. **Scenario 4: Doctor Sudden Emergency Leave Blackout & Mass Rescheduling**:
   - Attending physician unexpectedly goes on sick leave for the afternoon.
   - Doctor's afternoon slots transition to on-leave blackout state.
   - Desk staff uses inspection drawer to review scheduled patients and reschedules each patient to alternative open slots or next available clinic day.

5. **Scenario 5: End-of-Day Clinic Reconciliation**:
   - Desk staff reviews agenda and month views at clinic closing (19:00).
   - Reconciliation across all lifecycle states: confirmed appointments marked completed, no-shows updated, cancelled appointments preserved with audit notes, zero phantom queue tickets.

---

## 2. Feature Inventory & Test Architecture

The test suite directly verifies the 17 features defined in `PROJECT.md` across the four tiers of verification:

| Feature ID | Feature Name | Component / Service Scope | E2E Verification Tier |
|---|---|---|---|
| **F1** | Server-Side Date-Range & Doctor Filtering | `GetAppointmentsQuery.cs`, `AppointmentsController.cs` | Tier 1, Tier 2 |
| **F2** | Frontend Service Query Options | `clinicService.ts` (`getAppointments(options)`) | Tier 1, Tier 2 |
| **F3** | Calendar Core Types & Date/Time Utilities | `calendarUtils.ts`, Asia/Manila Gregorian math | Tier 1, Tier 2 |
| **F4** | Semantic Token Primitives & 4 UX States | `CalendarSkeleton`, `EmptyState`, `ErrorState`, Active | Tier 1, Tier 2 |
| **F5** | Month View Component | 7-column Gregorian grid, count badges, urgency dots | Tier 1, Tier 2, Tier 3 |
| **F6** | Week View Component | 7-day matrix (07:00–19:00, 30m slots), block placement | Tier 1, Tier 2, Tier 3 |
| **F7** | Day View Multi-Provider Timeline | Side-by-side doctor columns, shift template overlays | Tier 1, Tier 2, Tier 3, Tier 4 |
| **F8** | Agenda View Component | Chronological date grouping, card action buttons | Tier 1, Tier 2, Tier 3 |
| **F9** | Mobile Responsive Carousel | `<DateCarousel />` compact 7-day selector (<768px) | Tier 1, Tier 2 |
| **F10** | 1-Click Empty Slot Booking | Slot click pre-fills date, time, doctor into booking modal | Tier 1, Tier 3, Tier 4 |
| **F11** | Appointment Inspection Modal | Patient demographics, attending doctor, room, notes, CTAs | Tier 1, Tier 3, Tier 4 |
| **F12** | Appointment Rescheduling Modal | Date/time pickers, conflict detection, reason capture | Tier 1, Tier 2, Tier 3, Tier 4 |
| **F13** | Fast-Track Arrival Check-In | 1-click check-in, `QueueRoutingSelector`, queue ticket | Tier 1, Tier 3, Tier 4 |
| **F14** | Integration into `Appointments.screen.tsx` | View switcher (`SegmentedControl`), route params, key 4 | Tier 1, Tier 3 |
| **F15** | Strict Token Audit Compliance | Zero raw hex literals, semantic theme tokens, strict guard | Tier 1, Token Guard |
| **F16** | Opaque-Box E2E Test Suite | `apps/clinic-app/tests/calendarE2E.test.ts` | Tiers 1–4 Complete |
| **F17** | Adversarial Hardening | Concurrency, timezone bounds, race conditions | Tier 2, Tier 5 |

---

## 3. Test Coverage Thresholds & Minimum Targets

To ensure thoroughness and prevent superficial tests, the test suite enforces the following quantitative thresholds:

| Tier | Description | Minimum Requirement | Suite Allocation |
|---|---|---|---|
| **Tier 1** | Primary Feature Coverage (Happy Path & Core Functions) | $\ge 5$ test cases per core feature | $\ge 20$ test cases |
| **Tier 2** | Boundary Values & Error Handling (BVA, Conflicts, Edges) | $\ge 5$ test cases per boundary domain | $\ge 15$ test cases |
| **Tier 3** | Pairwise Combinatorial & Cross-Feature Workflows | Comprehensive all-pairs interaction paths | $\ge 8$ test cases |
| **Tier 4** | Real-World Outpatient Clinic Scenarios | $\ge 5$ multi-step clinical scenarios | $\ge 5$ scenarios |
| **Total** | Full Opaque-Box E2E Test Suite (`calendarE2E.test.ts`) | **$\ge 48$ verifiable assertions / cases** | Comprehensive |

---

## 4. Test Suite Execution & Verification Commands

All tests must be executed with standard project tooling:

```bash
# 1. Ensure PATH includes Bun and .NET
export PATH="$HOME/.dotnet:$HOME/.bun/bin:$PATH"

# 2. Execute TypeScript typecheck
cd apps/clinic-app && bun run typecheck

# 3. Execute strict design token audit (zero raw hex colors)
bun apps/clinic-app/scripts/check-tokens.mjs --strict

# 4. Run the Clinic Calendar E2E Test Suite
bun test apps/clinic-app/tests/calendarE2E.test.ts

# 5. Run appointment regression test suites
bun test apps/clinic-app/tests/appointmentsPreselectBooking.test.ts
bun test apps/clinic-app/tests/rosterEdgeStates.test.ts
```

---

## 5. Architectural Invariants & Anti-Cheating Protocol

1. **Requirements-Driven Opaque-Box Verification**:
   - Tests assert observable behavior, UI markup, state machines, and contract payloads.
   - Tests must NOT depend on private internal component variables or cheat by matching mock signatures.
2. **Deterministic Timezone Alignment**:
   - All calendar computations adhere strictly to `Asia/Manila` (UTC+8) standard time.
3. **Semantic Design Token Consumption**:
   - Zero hardcoded hex values (`#...`) or direct `palette.ts` imports in any test assertion or component code.
4. **Self-Contained Isolation**:
   - Each test sets up its own state, executes deterministically, and cleans up after itself with zero order dependencies.
