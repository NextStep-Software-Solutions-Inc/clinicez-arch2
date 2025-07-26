
# ClinicEZ New Architecture Monorepo

This repository contains the next-generation architecture for ClinicEZ, a comprehensive platform for modern clinics. The monorepo structure enables unified development, deployment, and management of all core components:

- **Patient Mobile App:** The official app for patients to manage appointments, view health records, and communicate with clinics. Built with Expo and React Native.
- **Clinic Staff Mobile App:** (Planned) The app for clinic staff to manage schedules, patient records, and clinic operations. Built with Expo and React Native.
- **Web Frontend:** (Planned) The official ClinicEZ website for marketing, onboarding, and tenant management. Cross-platform, supporting mobile and desktop browsers.
- **Backend for Mobile:** (Planned) Containerized backend services for each clinic tenant, deployed on-premise or in the cloud, supporting the mobile apps.
- **Backend for Web:** (Planned) Backend services for the web frontend and onboarding portal.

All code for backend and frontend (including marketing and tenant creation) is managed in this single repository, enabling seamless collaboration and deployment.

## Key Features

- Local-first/offline-first mobile apps with WatermelonDB
- Per-clinic backend deployment (on-premise or cloud, containerized)
- Multi-tenant onboarding and management via the web portal
- Unified codebase for all core ClinicEZ components

## Getting Started

Each package contains its own README with setup instructions. Below are the basics for the main applications:

### Patient Mobile App

```bash
cd packages/patient-app
npm install
npx expo start
```

### Clinic Staff Mobile App (Planned)

```bash
cd packages/clinic-staff-app
npm install
npx expo start
```

### Web Frontend (Planned)

```bash
cd packages/web-frontend
npm install
npm run dev
```

### Backend for Mobile (Planned)

See onboarding instructions in the web portal to download and deploy the containerized backend for your clinic.

For more details, see the individual package directories and documentation.

**Key components:**

The mobile applications are designed with a local-first (offline-first) architecture, utilizing WatermelonDB for efficient local data storage and management. Each app instance maintains its own local database, allowing users to operate fully offline. Data is synchronized with a backend specific to each clinic—this backend can be deployed either on-premise or in the cloud, depending on the clinic's preference. This approach ensures that every clinic has its own isolated backend, providing flexibility, security, and reliability for a variety of deployment scenarios.

**Onboarding and Deployment Flow:**

1. Tenants (clinics) register an account and create their tenancy through the web application.
2. The web app provides a downloadable container image (Docker) for the backend service.
3. Tenants follow provided instructions to install the containerized backend (using Docker or compatible container runtime) on their preferred server (on-premise or cloud), using the provided configuration files.
4. After installation, the tenant supplies the backend server URL to the system, enabling the mobile applications to synchronize with their dedicated backend.
5. This approach allows each clinic to maintain control over their data and deployment environment, while ensuring seamless integration with the ClinicEZ platform.

The web application is designed as a cross-platform solution, supporting both mobile and desktop browsers. This ensures accessibility for users on Android, iOS, and desktop operating systems, providing a seamless experience regardless of device.

This architecture enables unified development across:

- **Web Front End:** (Planned) Web application
- **Front End 1:** Patient mobile app
- **Front End 2:** Clinic staff mobile app
- **Back End for Mobile:** Backend services for mobile apps
- **Back End for Web:** Backend services for the web application

## Structure

```text
packages/
  patient-app/          # Mobile app for patients
  clinic-staff-app/     # (Planned) Mobile app for clinic staff
  web-frontend/         # (Planned) Web frontend (official website, onboarding, etc.)
  backend-mobile/       # (Planned) Backend services for mobile apps
  backend-web/          # (Planned) Backend services for web app
```

## About ClinicEZ

ClinicEZ aims to streamline clinic operations and improve patient experience through modern, scalable, and maintainable software architecture.

---

For more details, see the individual package directories.
