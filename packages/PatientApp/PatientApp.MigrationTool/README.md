# PatientApp Migration Tool

Internal ASP.NET Core web UI for migrating legacy PatientApp data from a source PostgreSQL database into an empty PatientApp target database.

## Configuration

Set secrets through environment variables or user-secrets. Do not commit real connection strings.

```powershell
$env:PATIENTAPP_MIGRATION_SOURCE_CONNECTION = "postgresql://..."
$env:PATIENTAPP_MIGRATION_TARGET_CONNECTION = "Host=...;Database=...;Username=...;Password=..."
$env:PATIENTAPP_MIGRATION_ADMIN_KEY = "choose-a-long-internal-key"
$env:PATIENTAPP_MIGRATION_REPORT_DIR = "F:\secure-migration-reports"
```

The source database is read-only from the tool's perspective. The target database must already have PatientApp migrations applied and all PatientApp tables must be empty before apply is allowed.

## Run

```powershell
dotnet run --project packages\PatientApp\PatientApp.MigrationTool\PatientApp.MigrationTool.csproj
```

Open the printed local URL, sign in with `PATIENTAPP_MIGRATION_ADMIN_KEY`, then run:

1. Check connections
2. Scan source
3. Run dry-run
4. Review mappings, trash, and generated UUIDs
5. Type `APPLY` on the apply form to commit

## Reports

Each run writes JSON and CSV artifacts to `PATIENTAPP_MIGRATION_REPORT_DIR`, or to `migration-reports` under the app output folder when no directory is configured.

