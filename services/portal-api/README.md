# Clinic EZ Portal API (`portal-api`)

The Portal API is the centralized .NET 10 control-plane backend service for the Clinic EZ ecosystem. It manages cross-tenant data, handles clinic onboarding, coordinates centralized administration and licensing, handles billing via Xendit, and powers the `@clinicez/portal-web` application.

## Architecture

This service is built using **Clean Architecture** principles and utilizes ASP.NET Core **Minimal APIs**.

### Key Technologies
- **.NET 10**: High-performance cross-platform runtime.
- **Minimal APIs**: Lightweight endpoint routing via `IEndpoint` abstractions.
- **Scalar**: Modern OpenAPI reference UI (`Scalar.AspNetCore`).
- **Entity Framework Core 10**: ORM for PostgreSQL database access.
- **Clerk Integration**: Secure authentication and JWT verification.
- **Xendit Integration**: Subscription and invoicing payment lifecycle.
- **MassTransit / RabbitMQ**: Event publishing across the microservices mesh.
- **Shared Package**: References `ClinicEz.Shared` (`packages/shared-dotnet`).

## Project Structure

- `ClinicEz.Portal.Api`: The entry point. Contains Minimal API endpoints, middleware, Scalar setup, and DI registration.
- `ClinicEz.Portal.Application`: Core application logic, CQRS commands/queries, validation behaviors, and interfaces.
- `ClinicEz.Portal.Domain`: Domain models, entities, enums, and repository abstractions.
- `ClinicEz.Portal.Infrastructure`: Data access implementations, PostgreSQL EF Core `ApplicationDbContext`, migrations, seeders, and external client integrations.
- `ClinicEz.Portal.Tests`: Unit and integration tests.

## Getting Started

### Prerequisites
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Running PostgreSQL database instance

### Running Locally

1. Navigate to the API directory:
   ```bash
   cd services/portal-api/ClinicEz.Portal.Api
   ```

2. Restore dependencies and run:
   ```bash
   dotnet run
   ```

3. The API will start on configured local ports. Navigate to `/scalar/v1` in your browser to view interactive API documentation.

## Docker Deployment

A multi-stage `Dockerfile` is provided at the service root:

```bash
docker build -t portal-api:dev -f services/portal-api/Dockerfile .
```
