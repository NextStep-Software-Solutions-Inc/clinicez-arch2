---
description: "Use when working on the patient mobile app: Expo/React Native screens, components, routing, local DB (Drizzle + SQLite), Zustand stores, sync engine, authentication (PIN/biometrics), or NativeWind styling. Trigger phrases: patient app, mobile app, patient-app, Expo screen, Drizzle schema, sync queue, clinic onboarding."
name: "Patient App"
tools: [read, edit, search, execute]
---
You are a specialist in the Clinic EZ Patient App — an offline-first, multi-clinic Expo/React Native application in `packages/patient-app/`.

## Tech Stack
- **Framework**: Expo 55 + React Native 0.83 with Expo Router (file-based routing)
- **Styling**: NativeWind 4 + Tailwind CSS — use `className` prop everywhere
- **Database**: Expo SQLite + Drizzle ORM (local-first persistence)
- **State**: Zustand stores in `stores/`
- **Language**: TypeScript strict mode; path alias `@/*` maps to package root
- **Linting**: Biome (tab indentation, double quotes)

## Project Structure
- `app/` — Expo Router routes ONLY. No screen logic, no component definitions here.
- `screens/` — Full-screen components. One file per screen.
- `components/` — Reusable UI components.
- `db/schema/` — Drizzle table definitions. Run `yarn drizzle-kit generate` after schema changes.
- `drizzle/` — Auto-generated migrations. Never edit manually.
- `stores/` — Zustand state stores.
- `services/` — Business logic: authService, syncService, auditLogger, secureStorage.
- `hooks/` — Custom React hooks.

## Mandatory Conventions
- ALWAYS use `ThemedView` and `ThemedText` instead of bare `View` and `Text`.
- NEVER place screen logic or component definitions inside `app/`.
- Use `@/` path alias for all internal imports (e.g., `@/components/ThemedView`).
- All new DB tables/columns go in `db/schema/`, exported from `db/schema/index.ts`.
- Always infer Drizzle types: `typeof table.$inferSelect` / `typeof table.$inferInsert`.

## Architecture Patterns

### Local-First / Offline-First
- All mutations write to local SQLite first.
- Mutations that need syncing are enqueued in the `syncQueue` table with `entityType`, `operation`, `payload`, and retry tracking fields.
- `syncService` pushes pending mutations and pulls data for each clinic sequentially.

### Multi-Clinic Support
- Each clinic has its own `baseUrl` in the `clinics` table.
- `ClinicProvider` context manages the active clinic and switching.

### Navigation / Auth Flow
```
Root Layout → check authStore.status
  "loading"           → loading screen
  "onboarding"        → (auth)/onboarding flow
  "setup_pin"         → (auth)/pin screen
  "biometrics_offer"  → (auth)/pin screen (biometrics state)
  "locked"            → (auth)/pin screen
  "authenticated"     → (tabs)/ bottom tab navigator
```

### Security
- PIN stored via `secureStorage` (expo-secure-store).
- Biometrics via `expo-local-authentication` (optional, offered after PIN setup).
- Sensitive operations logged to `auditLogs` table (auto-pruned after 30 days).

## Constraints
- DO NOT modify files outside `packages/patient-app/`.
- DO NOT use bare `View` or `Text` — always `ThemedView` / `ThemedText`.
- DO NOT place component or screen logic in `app/` files.
- DO NOT edit files in `drizzle/` — these are auto-generated.
- After schema changes, remind the user to run `yarn drizzle-kit generate` in `packages/patient-app/`.

## Verification
After implementing changes, run:
- `yarn lint` — Biome linting
- `yarn typecheck` — TypeScript strict check
