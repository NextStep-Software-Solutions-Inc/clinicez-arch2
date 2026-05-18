## Component Usage

- Always use `ThemedView` and `ThemedText` components instead of the default `View` and `Text` for all UI code except for the web-app, to ensure a unified component view across the project.
# Copilot Instructions for ClinicEZ Monorepo

## Big Picture Architecture
- **Monorepo Structure:** All projects live under `packages/`. Each package is a separate app or service (e.g., `patient-app`, `web-frontend`, `backend-mobile`).
- **Mobile Apps:** Built with Expo/React Native. Patient app is local-first (Expo SQLite + Drizzle ORM), supports multiple clinics, and syncs to a per-clinic backend (on-premise or cloud, containerized via Docker).
- **Web Frontend:** (Planned) Cross-platform (mobile/desktop) for marketing, onboarding, and tenant management.
- **Backends:** Each clinic has its own backend (containerized, deployed by tenant). Mobile and web may use separate backends.
- **Onboarding Flow:** Patients join clinics via invite code/email or search. Clinics deploy their own backend and register its URL.

## Developer Workflows
- **Install/Run:** Use `yarn` in each package (e.g., `yarn install`, `yarn start`).
- **Reset Patient App:** `yarn run reset-project` in `packages/patient-app` resets starter code.
- **No global build/test scripts:** Each package manages its own scripts and dependencies.
- **No node_modules in VCS:** All `node_modules` are gitignored at all levels.

## Project-Specific Conventions
- **All code must live in `packages/`** (including web, mobile, and backend projects).
- **File-based routing** is used in Expo apps (see `app/` in `patient-app`).
- **Local-first/offline-first** patterns in mobile: always use Expo SQLite + Drizzle ORM for local storage, with a queue-based sync engine per clinic.
- **Multi-clinic support:** Patient app must allow switching between clinics in-session.
- **Containerized backends:** All tenant backends are distributed as Docker images with config download via web onboarding.

## Integration & Communication
- **Mobile <-> Backend:** Sync via REST/GraphQL (implementation-specific per backend). Each clinic's backend URL is registered during onboarding.
- **Web <-> Backend:** (Planned) Web frontend communicates with its own backend for onboarding, marketing, and admin.
- **No monolithic backend:** Each clinic is isolated for data privacy and deployment flexibility.

## Examples & Key Files
- `packages/patient-app/README.md`: Details on local-first, multi-clinic, onboarding, and dev workflow.
- `packages/patient-app/app/`: File-based routing for Expo.
- `packages/patient-app/scripts/reset-project.js`: Project reset logic.
- `README.md` (root): Monorepo structure, architecture, and getting started for all apps.


## Coding Principles
 - All AI-generated code must always adhere to SOLID principles and the DRY (Don't Repeat Yourself) design pattern.
 - Ensure code is modular, maintainable, and avoids duplication.
 - See `CONTRIBUTING.md` and per-package `COPILOT.md` for more details.

---
For new packages, follow the structure and conventions above. When in doubt, check the root and package READMEs for examples.
