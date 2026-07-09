# MainPortalBE

MainPortalBE is the centralized .NET 10 backend service for the Clinic EZ Web Portal. It manages cross-tenant data, handles clinic onboarding, coordinates centralized administration, and powers the `MainPortalFE`.

## Architecture

This project is built using **Clean Architecture** principles and utilizes a **Minimal API** design. It is functionally aligned with the `PatientAppBE` architecture to ensure optimal code reuse and maintainability.

### Key Technologies
- **.NET 10**: The latest framework for high-performance cross-platform services.
- **Minimal APIs**: Lightweight `IEndpoint` abstractions for route handling.
- **Scalar**: Modern OpenAPI reference UI (`Scalar.AspNetCore`).
- **Entity Framework Core**: ORM for database access.
- **Hangfire**: Background job processing.
- **JWT / Clerk Integration**: Secure authentication and authorization.

## Project Structure

- `MainPortalBE.Api`: The entry point. Contains the Minimal API endpoints, middleware, and dependency injection configuration.
- `MainPortalBE.Application`: Contains the core business logic, interfaces, and CQRS handlers.
- `MainPortalBE.Domain`: Contains the enterprise domain models, entities, and enums.
- `MainPortalBE.Infrastructure`: Contains data access implementation, external API integrations, and database contexts.

## Getting Started

### Prerequisites
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)

### Running Locally

1. Navigate to the API directory:
   ```bash
   cd MainPortalBE.Api
   ```

2. Restore dependencies and run the project:
   ```bash
   dotnet run
   ```

3. The API will start on the configured local ports (usually `https://localhost:7xxx`). Navigate to `/scalar` in your browser to view the interactive API documentation.

## Docker Deployment

A `Dockerfile` is provided at the root of `MainPortalBE` for containerized deployment.

```bash
docker build -t Clinic EZ-mainportal-be -f Dockerfile .
docker run -p 8080:8080 Clinic EZ-mainportal-be
```
