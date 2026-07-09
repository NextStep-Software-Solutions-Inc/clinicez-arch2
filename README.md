# ClinicEZ Architecture

Welcome to the **ClinicEZ** monorepo! This repository houses the entire next-generation architecture for the ClinicEZ platform, providing a seamless, multi-tenant solution for modern clinics.

## ?? Platform Ecosystem

Our monorepo is divided into several specialized packages to ensure clean separation of concerns while maintaining a unified developer experience:

### 1. PatientAppFE (Patient Mobile Application)
The mobile application designed specifically for patients. Built with Expo and React Native, it features a local-first/offline-first architecture using **Expo SQLite + Drizzle ORM**.
- Patients can manage appointments, view their health records, and communicate with clinics seamlessly, even offline.
- Synced automatically with the backend when online.

### 2. MainPortalFE (Web Portal & Marketing)
The official ClinicEZ website and web portal, built using **Next.js 16** (with Turbopack) and **Bun**. 
- Serves as the landing page and marketing site.
- Handles tenant onboarding, clinic registration, and administration.
- Provides a unified web experience across desktop and mobile browsers.

### 3. PatientAppBE (Mobile Backend API)
The containerized minimal API backend service that powers the mobile applications.
- Built on **.NET 10**.
- Deployed on a per-clinic basis (on-premise or cloud).
- Utilizes an elegant **Minimal API** architecture with IEndpoint abstractions.
- Features Scalar.AspNetCore for modern OpenAPI reference documentation.

### 4. MainPortalBE (Web Backend API)
The centralized backend service that powers the MainPortalFE.
- Built on **.NET 10**.
- Fully integrated with the same Minimal API architecture used in PatientAppBE for optimal code reuse and maintainability.
- Manages cross-tenant data, onboarding coordination, and centralized clinic administration.

---

## ?? Getting Started

We use modern tooling like **Bun** and **.NET 10**. Please ensure you have them installed before proceeding.

### Running the Web Portal (Frontend)
`ash
cd packages/MainPortalFE
bun install
bun run dev
`

### Running the Web Portal (Backend)
`ash
cd packages/MainPortalBE/MainPortalBE.Api
dotnet run
`

### Running the Patient App
`ash
cd packages/PatientAppFE
npm install
npx expo start
`

---

## ??? Architecture & Deployment Model

1. **Local-First Mobile**: The mobile applications prioritize offline reliability. Data is read from and written to the local SQLite database instantly, syncing with the clinic's dedicated backend whenever a connection is available.
2. **Containerized Tenancy**: Every clinic can have its own isolated containerized backend (PatientAppBE), providing flexibility and security for on-premise or cloud deployments.
3. **Centralized Administration**: Clinics register and manage their infrastructure through the MainPortalFE, which is powered by MainPortalBE.

*This unified codebase guarantees consistent types, shared libraries (via CLINICEZ.Shared), and a powerful developer experience.*