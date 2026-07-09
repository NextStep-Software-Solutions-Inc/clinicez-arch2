# ClinicEZ Web App

Next.js application for ClinicEZ marketing, onboarding, and tenant management. This package lives inside the ClinicEZ monorepo under `packages/web-app`.

- Framework: Next.js (App Router)
- Styling: Tailwind CSS v4
- Language: TypeScript

For overall architecture and workflows, see the root README at `../../README.md`.

## Prerequisites

- Node.js 18+ (20+ recommended)
- Package manager: pnpm (recommended) or npm/yarn

## Quick Start

From the monorepo root:

```bash
cd packages/web-app
pnpm install
pnpm dev
```

Open <http://localhost:3000> in your browser.

## Scripts

- `pnpm dev` – Start the dev server (Turbopack)
- `pnpm build` – Build for production
- `pnpm start` – Start the production server
- `pnpm lint` – Run linting

If you prefer npm or yarn:

```bash
npm run dev   # or
yarn dev
```

## Project Structure

```text
packages/web-app/
  public/       # Static assets
  src/
    app/          # Next.js App Router routes, layouts, metadata
    components/ # UI components (e.g., Shell, SearchPaginatedList)
    lib/        # Utilities and helpers
    hooks/      # React hooks
    actions/    # Server/actions modules
  next.config.ts
  tsconfig.json
  postcss.config.mjs
  tailwind config files
```

## Development Notes

- This app is part of a monorepo. Keep shared logic inside package-local folders unless a true shared package is introduced.
- Follow TypeScript and ESLint rules defined in this package.
- UI images used in mock data (Unsplash) should be production-safe, royalty-free links.

## Deploying to Vercel (Monorepo)

When deploying with Vercel, make sure the project root is set to this package folder.

- Root Directory: `packages/web-app`
- Install Command: `pnpm install` (or your preferred manager)
- Build Command: `pnpm build`
- Output Directory: `.next` (default for Next.js)

Tips:

- Using the CLI from the repo root: `vercel --cwd packages/web-app`
- Or `cd packages/web-app && vercel`
- In the Vercel dashboard: Project Settings → General → Root Directory → `packages/web-app`

### Troubleshooting

Error: "The specified Root Directory \"packages\\web-app\" does not exist."

- Ensure your Vercel project is linked to the monorepo and the Root Directory is exactly `packages/web-app`.
- If using the CLI, run it from `packages/web-app` or pass `--cwd packages/web-app`.
- Verify the folder exists in the deployed branch and is not excluded by `.vercelignore`/`.gitignore`.

## Contributing

See `../../CONTRIBUTING.md` for contribution guidelines.
