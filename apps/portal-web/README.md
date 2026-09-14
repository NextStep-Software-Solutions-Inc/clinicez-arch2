# Clinic EZ Web Portal (`@clinicez/portal-web`)

The Web Portal is the centralized web application for the Clinic EZ ecosystem. It provides the unified administrative console, tenant onboarding workspace, and public marketing interface, built on Next.js 16 and React 19.

## Architecture & Tech Stack

This project is built using modern React and Next.js features, optimized for maximum speed and developer experience.

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Core Library**: [React 19](https://react.dev/)
- **Package Manager**: [Bun](https://bun.sh/) (monorepo workspace)
- **Bundler**: Turbopack (`next dev --turbopack`)
- **Styling**: Tailwind CSS v4 & [shadcn/ui](https://ui.shadcn.com/) (built on Radix UI)
- **Authentication**: [Clerk](https://clerk.com/)
- **API Communication**: Communicates with the `portal-api` (`ClinicEz.Portal.Api`) backend.
- **Shared Packages**: Consumes `@shared/safe` from `packages/shared-ts/safe`.

## Project Structure

- `src/app`: Next.js App Router definitions, pages, and layouts.
- `src/components`: Reusable React components (UI elements, layout wrappers, domain tables).
- `src/lib`: Utility functions and third-party integrations (e.g., Clerk helpers).
- `src/services`: Frontend API client services (admin, billing, tenant).
- `src/proxy.ts`: Next.js Edge proxy for route protection and multi-tenant URL rewriting.

## Getting Started

### Prerequisites

Ensure you have [Bun](https://bun.sh/) (v1.2+) installed.

### Installation & Running Locally

1. Navigate to the portal web directory (or run from monorepo root):
   ```bash
   cd apps/portal-web
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Start the development server using Turbopack:
   ```bash
   bun run dev
   ```

4. The application will be available at `http://localhost:3000`.

## Scripts

- `bun run dev`: Starts the Next.js dev server with Turbopack enabled.
- `bun run build`: Builds the production bundle.
- `bun run start`: Starts the production server.
- `bun run lint`: Runs ESLint to check for code quality issues.
