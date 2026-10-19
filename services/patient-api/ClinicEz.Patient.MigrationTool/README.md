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
dotnet run --project services\patient-api\ClinicEz.Patient.MigrationTool\ClinicEz.Patient.MigrationTool.csproj
```

Open the printed local URL, sign in with `PATIENTAPP_MIGRATION_ADMIN_KEY`, then run:

1. Check connections
2. Scan source
3. Review and edit mapping configuration
4. Run dry-run
5. Review mappings, trash, and generated UUIDs
6. Type `APPLY` on the apply form to commit

## Manual Mapping Overrides

Use **Review and edit mapping configuration** to manually connect PatientApp target tables and columns to legacy source tables and columns. Pick a target table card, choose its primary row source table, then map each target column to a source column. A column can use the primary row source table or a secondary source table connected to the primary source table through source FK metadata. When no secondary source table is selected, the source-column dropdown is populated from the primary source table; when a secondary table is selected, it is populated from that secondary table. Leave a table or column on Auto to keep the inferred mapping.

Each column also has a transform option. Use **Convert to target type** when the source and target types differ but the value should be converted, such as a numeric legacy ID into a PatientApp string column. Use **Stringify JSON** when a target string column is intended to contain JSON text; the tool serializes the selected source value to JSON regardless of the source data type.

Saved overrides are persisted in `mapping-configuration.json` inside `PATIENTAPP_MIGRATION_REPORT_DIR` or the default `migration-reports` folder, so they survive page reloads and app restarts. Scan, dry-run, and apply all use the saved configuration. If mappings change after a dry-run, run dry-run again before apply.

After changing a table's target table, save once and reopen the mapping page to edit that target table's column mappings.

## Reports

Each run writes JSON and CSV artifacts to `PATIENTAPP_MIGRATION_REPORT_DIR`, or to `migration-reports` under the app output folder when no directory is configured.
