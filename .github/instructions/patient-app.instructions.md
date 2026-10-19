---
description: "Always-on rules for the Clinic EZ Patient App (Expo/React Native). Covers component conventions, file placement, DB patterns, and styling. Applied automatically to all files in apps/patient-app/."
applyTo: "apps/patient-app/**"
---
## Component Rules
- ALWAYS use `ThemedView` and `ThemedText` instead of bare `View` and `Text`.
- Import from `@/components/ThemedView` and `@/components/ThemedText`.

## File Placement
- `app/` — Expo Router route files ONLY. No JSX component definitions, no screen logic.
- `screens/` — Full-screen components (one file per screen).
- `components/` — Reusable UI components.
- `stores/` — State stores (e.g. Zustand).
- `services/` — Business logic (auth, sync, audit, storage).
- `hooks/` — Custom React hooks.

## Imports
- Use `@/` path alias for all internal imports. Never use relative `../../` paths across directory boundaries.

## Styling
- Use `className` prop with Tailwind/NativeWind classes for styling. Avoid inline `style` objects unless required by a third-party component.

## Database (Drizzle ORM)
- All table definitions go in `db/schema/`. Export every table from `db/schema/index.ts`.
- Always infer types: `typeof table.$inferSelect` / `typeof table.$inferInsert`. Never write manual type definitions for DB rows.
- After adding or changing schema, run `bun run db:generate` in `apps/patient-app/`.
- Never edit files in `drizzle/` — they are auto-generated.

## Sync / Offline-First
- All mutations that need to reach a backend must be enqueued in the `syncQueue` table before returning to the caller.
- Never call a clinic's `baseUrl` directly from a screen or component — go through `syncService`.

## Security
- Sensitive user actions must be logged via `auditLogger`. Never log PII in plain log output.
- PIN and tokens must be stored via `secureStorage` (expo-secure-store). Never use AsyncStorage for secrets.

## Verification
After every change, run in `apps/patient-app/` (or from monorepo root):
- `bun run typecheck` — TypeScript strict mode check
