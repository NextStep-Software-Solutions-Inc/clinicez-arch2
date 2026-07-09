# MainPortalFE

MainPortalFE is the centralized web frontend application for the Clinic EZ ecosystem. It provides the unified administrative and user portal interface, built on a highly modern, performant web stack.

## Architecture & Tech Stack

This project is built using bleeding-edge React and Next.js features, optimized for maximum speed and developer experience.

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Core Library**: [React 19](https://react.dev/)
- **Package Manager**: [Bun](https://bun.sh/) (for ultra-fast dependency resolution and execution)
- **Bundler**: Turbopack (`next dev --turbo`)
- **Styling**: Tailwind CSS & [shadcn/ui](https://ui.shadcn.com/) (built on Radix UI)
- **Authentication**: [Clerk](https://clerk.com/)
- **API Communication**: Fetches data from the `MainPortalBE` Minimal API.

## Project Structure

- `src/app`: Contains the Next.js App Router definitions, pages, and layouts.
- `src/components`: Reusable React components (UI elements, layout wrappers, and domain-specific components).
- `src/lib`: Utility functions and third-party integrations (e.g., Clerk helpers).
- `src/proxy.ts`: The Next.js Edge proxy file replacing the legacy `middleware.ts` for route protection.

## Getting Started

### Prerequisites

Ensure you have [Bun](https://bun.sh/) installed on your local machine.

### Installation & Running Locally

1. Navigate to the frontend directory:
   ```bash
   cd packages/MainPortalFE
   ```

2. Install dependencies via Bun:
   ```bash
   bun install
   ```

3. Start the development server using Turbopack:
   ```bash
   bun run dev
   ```

4. The application will be available at `http://localhost:3000`.

## Scripts

- `bun run dev`: Starts the Next.js dev server with Turbopack enabled for instantaneous HMR.
- `bun run build`: Builds the production bundle using the Next.js compiler.
- `bun run start`: Starts the production server.
- `bun run lint`: Runs ESLint to check for code quality issues.
