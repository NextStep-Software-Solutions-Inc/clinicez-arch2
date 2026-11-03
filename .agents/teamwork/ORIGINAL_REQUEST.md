# Original User Request

## Parameters

[skip-interview]
How this run was launched; not part of the task.

## Initial Request — 2026-11-03T00:31:28Z

Proceed directly to execution.

Requirements & Plan:
1. Replace patient-app home screens completely using the Google Stitch designs (all 4 states: First Login, No Appointment, Multiple Appointments, Search Results).
2. Hidden header title & subtitle initially hidden at scroll offset y=0 and animate into view as screen is scrolled.
3. Zero mock data: wire completely to real patient-api endpoints:
   - Patient Vitals: query/store live vitals (Heart rate, Blood pressure, Blood glucose, Sleep/SpO2) from patient-api. Build any missing backend endpoints in services/patient-api (e.g. GET/POST /patients/{patientId}/vitals) and client integration in patient-app.
   - Medications: query active patient medications and support "Log Now" adherence / taken status.
   - Appointments: query patient appointments (handling 0 appointments, single, and multiple appointments).
   - Search: connect search query input to live backend search (clinics, doctors, services, symptoms) matching Stitch Screen 4 (0a03c140a91843e59b4be878d9d3b196).
4. Update apps/patient-app/navigation/screens/Home.screen.tsx, Home.screen.web.tsx, and add SearchResults screen/modal.
5. Enforce strict design tokens (0 violations for bun run lint:tokens), 0 TypeScript errors (bun run typecheck:patient), and full test coverage (bun test).
6. Commit and push to origin/connect_google_stitch_patient_home to update GitHub PR #128.
