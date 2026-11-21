# Patient web smoke checklist

Manual regression pass for the web build (`bun run build:patient-web` or `bunx expo start --web` in `apps/patient-app`).
Run in **Chrome** and one of Safari/Firefox at three widths: **390px** (compact), **820px** (tablet rail), **1440px** (desktop).
Also repeat the whole pass once in **Dark** appearance (Settings → Appearance).

> All patient health records and documents are stored offline-first with zero client-side recovery keys.

## Global shell

- [ ] ≥ 1024px: expanded sidebar (260px) with brand, Home / Appointments / My Files / My Profile, Notifications / Settings, user + Sign out.
- [ ] 768–1023px: collapsed icon rail (72px) with tooltips; < 768px: no sidebar, compact bottom tab bar.
- [ ] Active item follows deep routes (e.g. Allergies → My Profile, Booking → Appointments).
- [ ] Pushed pages show a header with Back + title; browser back/forward and deep links/refresh work (URLs in `navigation/linking.ts`).
- [ ] `g` then `h/a/f/p/n/s` jumps between sections; shortcuts do nothing while typing in a field.
- [ ] Fonts are Geist, brand colour is teal (no blue `#3B82F6`) on every screen; no emoji icons anywhere.
- [ ] Keyboard focus ring is visible on buttons, links, inputs, sidebar items; hover states on rows/cards/buttons.
- [ ] Resize the window across breakpoints without reload – layout switches correctly.

## Auth & lock

- [ ] `/` Welcome → `/onboard` → `/register` → `/verify` → `/login` → `/forgot-password` render as centered cards.
- [ ] Sign-in works; first login → `/setup-pin` (PIN entry works with the hardware keyboard: digits, Backspace, Enter).
- [ ] Reloading the page does **not** ask for the PIN; after the idle timeout (15 min) or explicit lock the Unlock screen appears.
- [ ] Switching browser tabs does not lock the app.
- [ ] Sign out (sidebar) asks for confirmation (themed dialog) and returns to Login.

## Home / Appointments / Booking

- [ ] `/home` dashboard: greeting, upcoming appointment, stats, quick actions; two columns at ≥ 1024px.
- [ ] `/appointments` tabs (upcoming/past/cancelled), hover rows; open `/appointments/:id` (map link opens Google Maps in a new tab).
- [ ] Reschedule and Attach files open as pages and complete successfully.
- [ ] `/explore/clinics`, `/explore/orgs`, details pages → `/booking/draft` completes a booking (summary card sticky at ≥ 1024px).

## Records (offline-first health records hub)

- [ ] `/records` category filter pills (All, Lab Results, Prescriptions, Lab Requests, Certificates, Outside Uploads), search, provenance badges, and offline indicators.
- [ ] `/records/upload`: file/photo picker, category selector, title, date, notes; instant local preview with background sync; 25 MB limit.
- [ ] `/records/view/:fileId`: image, PDF and preview; works seamlessly offline once cached.
- [ ] Delete record: deletes local file and purges metadata cleanly.

## Profile & records

- [ ] `/profile` section grid (1/2/3 columns), search, completeness bar.
- [ ] Each editable form (e.g. `/profile/allergies`, `/profile/medications`, `/profile/addresses`) opens, edits, saves, and **data persists after reload**.
- [ ] Bottom-sheet pickers appear as bottom sheet (< 768px) / centered dialog (≥ 768px); date fields use the browser date picker.
- [ ] Read-only clinical records (`/profile/prescriptions`, `/profile/lab-results`, …) render lists/detail without layout overflow.

## Notifications & settings

- [ ] `/notifications` list with hover actions; unread badge in the sidebar updates (polls every 60s and on window focus).
- [ ] `/notifications/:id` detail page.
- [ ] `/settings`, `/settings/security`, `/settings/pin`, `/settings/password`, `/settings/appearance` (Light/Dark/System), `/settings/notifications`, `/settings/about`.
- [ ] No OTA-update, biometric, or native push controls on web.
- [ ] Changing appearance switches the whole app including dialogs and sidebar immediately.

## Offline behaviour (web)

- [ ] Going offline (DevTools) shows only the compact "You are offline – reconnect to continue" bar; no sync-queue UI; actions fail with readable errors.
