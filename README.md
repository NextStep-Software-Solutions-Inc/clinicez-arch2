# ClinicEZ New Architecture Monorepo

This system represents the new architecture of ClinicEZ, designed as a modern monorepo to support web, mobile, and backend development in a unified codebase.

This is a large-scale project, structured as a monorepo that brings together:

- Two mobile applications (built with Expo) for patients and clinic staff
- A backend system supporting all business logic, APIs, and multi-tenant capabilities
- Frontend and backend code for marketing and tenant management features

All code for backend and frontend (including marketing and tenant creation) is managed in this single repository, enabling unified development and deployment for the entire ClinicEZ platform.

ClinicEZ's new architecture is a composition of backend, web, and mobile frontend projects, all managed in a single repository for seamless development and deployment.

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
