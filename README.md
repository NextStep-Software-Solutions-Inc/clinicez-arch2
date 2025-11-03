# CLINICEZ: Enterprise Resource Planning

A comprehensive, multi-tenant Enterprise Resource Planning (ERP) platform designed for both government structures and private institutions. CLINICEZ integrates a suite of applications to manage the full lifecycle of organizational resources, from planning and procurement to supply and asset management.

## Project Structure

This repository contains two primary services organized into subdirectories:

- **`Dashboard/`**: This subdirectory contains the core codebase for the main application logic.
- **`Portal/`**: This subdirectory contains a separate service responsible for creating and configuring new tenants and managing all tenancy-related settings.

---

## Key Features & Architecture

- **Clean Architecture**: A clear separation between Domain, Application, Infrastructure, and API layers to ensure maintainability and testability.
- **CQRS Pattern**: Uses the MediatR library to separate commands (write operations) from queries (read operations), leading to a more focused and scalable design.
- **Repository & Unit of Work Patterns**: Abstracts data access logic, keeping business rules clean and independent of the persistence technology.
- **Advanced API Querying**: All API endpoints that return lists are paginated and utilize the **Sieve** library to handle complex filtering and sorting operations directly through query string parameters.
- **Background Processing**: Integrated with **Hangfire** for scheduling and executing background jobs, such as sending reports or processing data.

---

## Tech Stack

- **Framework**: .NET 8 / ASP.NET Core
- **Database**: PostgreSQL
- **ORM**: Entity Framework Core
- **Key Libraries**:
  - MediatR
  - Sieve
  - Hangfire
  - Swashbuckle (Swagger)
  - EFCore.BulkExtensions

---

## Getting Started Guide

### 1. Prerequisites

Ensure you have the following installed on your machine:

- .NET 9 SDK
- PostgreSQL Server

### 2. Configuration

This project uses User Secrets to store the database connection string during development.

1.  Navigate to the `Dashboard/Dashboard.Api` directory in your terminal.
2.  Initialize user secrets for the project:
    ```bash
    dotnet user-secrets init
    ```
3.  Set the connection string (replace with your own credentials):
    ```bash
    dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Database=CLINICEZ_Db;Username=postgres;Password=your_password"
    ```
4.  Repeat the process for the `Portal/CLINICEZ.Portal.Api` project.

### 3. Database Migrations

The project uses EF Core for database migrations.

#### Important Note on Schemas

When adding a migration for a new table, you **must** specify which schema it belongs to in the `DbContext`. If you forget, it will be added to the default `public` schema. Always be mindful of this to keep the database organized.

To apply the existing migrations, run the following command from the solution root:

```bash
dotnet ef database update --startup-project Dashboard/Dashboard.Api
```

Repeat for the Portal service as needed.

### 4. Running the Application

Open the CLINICEZ.sln file in your IDE (e.g., Visual Studio).

Set CLINICEZ.Api as the startup project.

Run the application.

#### Developer Guidelines

It is crucial that all new development adheres to the established Clean Architecture and CQRS patterns. Please be mindful of the project structure and dependency rules to keep the codebase clean, maintainable, and consistent.

#### Credits

This project was developed by Next Steps Software Solution.
� 2025 Next Steps Software Solution.
