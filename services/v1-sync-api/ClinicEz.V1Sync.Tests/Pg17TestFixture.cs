using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

/// <summary>
/// Ephemeral PostgreSQL 17 integration test fixture.
/// Connects to local PG17 (127.0.0.1:5439 by default) and creates four uniquely-named
/// disposable databases (`v1sync_test_&lt;guid&gt;_*`), dropping them with FORCE on DisposeAsync.
/// Never touches shared `CLINICEZ-*` databases, `127.0.0.1:5099`, or Neon.
/// </summary>
public sealed class Pg17TestFixture : IAsyncLifetime
{
    private readonly string _host = Environment.GetEnvironmentVariable("V1SYNC_TEST_PG_HOST") ?? "127.0.0.1";
    private readonly int _port = int.TryParse(Environment.GetEnvironmentVariable("V1SYNC_TEST_PG_PORT"), out var p) ? p : 5439;
    private readonly string _user = Environment.GetEnvironmentVariable("V1SYNC_TEST_PG_USER") ?? "clinicez_local";
    private readonly string _password = Environment.GetEnvironmentVariable("V1SYNC_TEST_PG_PASSWORD") ?? "clinicez_local_dev_password";

    private readonly string _prefix = $"v1sync_test_{Guid.NewGuid():N}";

    public string V1DbName => $"{_prefix}_v1";
    public string ClinicDbName => $"{_prefix}_clinic";
    public string PatientDbName => $"{_prefix}_patient";
    public string SyncDbName => $"{_prefix}_sync";

    public string V1ConnectionString => BuildConnString(V1DbName);
    public string ClinicConnectionString => BuildConnString(ClinicDbName);
    public string PatientConnectionString => BuildConnString(PatientDbName);
    public string SyncConnectionString => BuildConnString(SyncDbName);

    public SyncConnectionFactory Connections { get; private set; } = null!;
    public SyncLedgerRepository Ledger { get; private set; } = null!;
    public Track1ClinicSyncEngine Track1 { get; private set; } = null!;
    public Track2PatientSyncEngine Track2 { get; private set; } = null!;
    public SyncCoordinator Coordinator { get; private set; } = null!;
    public ScopedCdcIdResolver CdcResolver { get; private set; } = null!;

    public static string SqlDirectory => FindSqlDirectory();

    private string BuildConnString(string dbName) =>
        new NpgsqlConnectionStringBuilder
        {
            Host = _host,
            Port = _port,
            Username = _user,
            Password = _password,
            Database = dbName,
            Timeout = 15,
            CommandTimeout = 60
        }.ConnectionString;

    public async Task InitializeAsync()
    {
        await using (var admin = new NpgsqlConnection(BuildConnString("postgres")))
        {
            await admin.OpenAsync();
            foreach (var db in new[] { V1DbName, ClinicDbName, PatientDbName, SyncDbName })
            {
                await using var cmd = new NpgsqlCommand($"""CREATE DATABASE "{db}" """, admin);
                await cmd.ExecuteNonQueryAsync();
            }
        }

        await ExecuteSqlAsync(V1ConnectionString, V1MinimalSchemaSql);
        await ExecuteSqlAsync(ClinicConnectionString, ClinicMinimalSchemaSql);
        await ExecuteSqlAsync(PatientConnectionString, PatientMinimalSchemaSql);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:V1Source"] = V1ConnectionString,
                ["ConnectionStrings:ClinicDb"] = ClinicConnectionString,
                ["ConnectionStrings:PatientDb"] = PatientConnectionString,
                ["ConnectionStrings:SyncLedgerDb"] = SyncConnectionString,
                ["V1Sync:MaxPoolSize"] = "2"
            })
            .Build();

        Connections = new SyncConnectionFactory(config, NullLogger<SyncConnectionFactory>.Instance);
        Ledger = new SyncLedgerRepository(Connections);
        await Ledger.EnsureSchemaAsync();

        Track1 = new Track1ClinicSyncEngine(Connections, Ledger, NullLogger<Track1ClinicSyncEngine>.Instance);
        Track2 = new Track2PatientSyncEngine(Connections, Ledger, NullLogger<Track2PatientSyncEngine>.Instance);
        Coordinator = new SyncCoordinator(Ledger, Track1, Track2, NullLogger<SyncCoordinator>.Instance);
        CdcResolver = new ScopedCdcIdResolver();
    }

    public async Task DisposeAsync()
    {
        if (Connections is not null)
        {
            await Connections.DisposeAsync();
        }

        NpgsqlConnection.ClearAllPools();

        await using var admin = new NpgsqlConnection(BuildConnString("postgres"));
        await admin.OpenAsync();
        foreach (var db in new[] { SyncDbName, PatientDbName, ClinicDbName, V1DbName })
        {
            await using var cmd = new NpgsqlCommand($"""DROP DATABASE IF EXISTS "{db}" WITH (FORCE)""", admin);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    public static async Task ExecuteSqlAsync(string connectionString, string sql, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static string FindSqlDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "services", "v1-sync-api", "sql");
            if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "01_install_v1_sync_changelog.sql")))
            {
                return candidate;
            }
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("Could not locate services/v1-sync-api/sql directory from test base directory.");
    }

    private const string V1MinimalSchemaSql = """
        CREATE TABLE public."User" (
            id                  SERIAL PRIMARY KEY,
            "userId"            TEXT,
            email               TEXT,
            picture             TEXT,
            "firstName"         TEXT NOT NULL,
            "lastName"          TEXT NOT NULL,
            "middleName"        TEXT,
            suffix              TEXT,
            dob                 DATE,
            gender              TEXT,
            "civilStatus"       TEXT,
            "bloodType"         TEXT,
            mobile              TEXT,
            telephone           TEXT,
            nationality         TEXT,
            religion            TEXT,
            nickname            TEXT,
            "placeOfBirth"      TEXT,
            "caseNumber"        TEXT,
            "accountType"       TEXT,
            "onboardingStatus"  TEXT,
            "verificationStatus" TEXT,
            "isActive"          BOOLEAN NOT NULL DEFAULT TRUE,
            "deletedAt"         TIMESTAMPTZ,
            "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE public."UserPreference" (
            id       SERIAL PRIMARY KEY,
            "userId" INT NOT NULL
        );

        CREATE TABLE public."ClinicPatient" (
            id          SERIAL PRIMARY KEY,
            "clinicId"  INT NOT NULL,
            "patientId" INT NOT NULL,
            "deletedAt" TIMESTAMPTZ
        );

        CREATE TABLE public."OrganizationMember" (
            id               SERIAL PRIMARY KEY,
            "organizationId" INT NOT NULL,
            "userId"         INT NOT NULL
        );

        CREATE TABLE public."StudentLevel" (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            "deletedAt" TIMESTAMPTZ
        );

        CREATE TABLE public."OrganizationCollege" (
            id               SERIAL PRIMARY KEY,
            "organizationId" INT NOT NULL,
            name             TEXT NOT NULL,
            "deletedAt"      TIMESTAMPTZ
        );

        CREATE TABLE public."OrganizationProgram" (
            id               SERIAL PRIMARY KEY,
            "organizationId" INT NOT NULL,
            name             TEXT NOT NULL,
            "deletedAt"      TIMESTAMPTZ
        );

        CREATE TABLE public."OrganizationDepartment" (
            id               SERIAL PRIMARY KEY,
            "organizationId" INT NOT NULL,
            name             TEXT NOT NULL,
            "deletedAt"      TIMESTAMPTZ
        );

        CREATE TABLE public."OrganizationOffice" (
            id               SERIAL PRIMARY KEY,
            "organizationId" INT NOT NULL,
            name             TEXT NOT NULL,
            "deletedAt"      TIMESTAMPTZ
        );

        CREATE TABLE public."OrganizationYearLevel" (
            id               SERIAL PRIMARY KEY,
            "organizationId" INT NOT NULL,
            name             TEXT NOT NULL,
            "deletedAt"      TIMESTAMPTZ
        );

        CREATE TABLE public."UserStudentRecord" (
            id               SERIAL PRIMARY KEY,
            "userId"         INT NOT NULL,
            "organizationId" INT,
            "studentId"      TEXT,
            lrn              TEXT,
            level            INT,
            "collegeId"      INT,
            "programId"      INT,
            "yearLevel"      INT,
            "isActive"       BOOLEAN NOT NULL DEFAULT TRUE,
            "deletedAt"      TIMESTAMPTZ,
            "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE public."UserEmploymentRecord" (
            id               SERIAL PRIMARY KEY,
            "userId"         INT NOT NULL,
            "organizationId" INT,
            "employeeId"     TEXT,
            "departmentId"   INT,
            "officeId"       INT,
            "collegeId"      INT,
            position         TEXT,
            designation      TEXT,
            "isActive"       BOOLEAN NOT NULL DEFAULT TRUE,
            "deletedAt"      TIMESTAMPTZ,
            "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE public."PhilHealthRecord" (
            id          SERIAL PRIMARY KEY,
            "userId"    INT NOT NULL,
            pin         TEXT,
            tin         TEXT,
            "philSysId" TEXT,
            "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
            "deletedAt" TIMESTAMPTZ,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE public."PhilHealthDependent" (
            id                   SERIAL PRIMARY KEY,
            "philHealthRecordId" INT NOT NULL
        );

        CREATE TABLE public."UserAddress" (
            id            SERIAL PRIMARY KEY,
            "userId"      INT NOT NULL,
            "addressLine" TEXT,
            street        TEXT,
            address       TEXT,
            barangay      TEXT,
            city          TEXT,
            state         TEXT,
            region        TEXT,
            "isPrimary"   BOOLEAN NOT NULL DEFAULT TRUE,
            "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
            "deletedAt"   TIMESTAMPTZ
        );

        CREATE TABLE public."UserEmergencyContact" (
            id            SERIAL PRIMARY KEY,
            "userId"      INT NOT NULL,
            name          TEXT,
            "firstName"   TEXT,
            "middleName"  TEXT,
            "lastName"    TEXT,
            suffix        TEXT,
            phone         TEXT,
            relationship  TEXT,
            "isPrimary"   BOOLEAN NOT NULL DEFAULT TRUE,
            "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
            "deletedAt"   TIMESTAMPTZ
        );

        CREATE TABLE public."PatientNcdQuestionnaire" (
            id          SERIAL PRIMARY KEY,
            "patientId" INT NOT NULL
        );

        CREATE TABLE public."Appointment" (
            id          SERIAL PRIMARY KEY,
            "clinicId"  INT NOT NULL,
            "deletedAt" TIMESTAMPTZ
        );

        CREATE TABLE public."AppointmentRequester" (
            id              SERIAL PRIMARY KEY,
            "appointmentId" INT NOT NULL,
            "userId"        INT NOT NULL
        );

        CREATE TABLE public."AppointmentRouting" (
            id              SERIAL PRIMARY KEY,
            "appointmentId" INT NOT NULL
        );

        CREATE TABLE public."AppointmentTag" (
            id              SERIAL PRIMARY KEY,
            "appointmentId" INT NOT NULL
        );

        CREATE TABLE public."ConsultationTicket" (
            id                SERIAL PRIMARY KEY,
            "clinicId"        INT NOT NULL,
            "clinicPatientId" INT,
            "appointmentId"   INT,
            "isActive"        BOOLEAN NOT NULL DEFAULT TRUE
        );

        CREATE TABLE public."ConsultationDiagnosis" (
            id                     SERIAL PRIMARY KEY,
            "consultationTicketId" INT NOT NULL
        );

        CREATE TABLE public."ConsultationManagement" (
            id                     TEXT PRIMARY KEY,
            "consultationTicketId" INT NOT NULL
        );

        CREATE TABLE public."Intervention" (
            id                     SERIAL PRIMARY KEY,
            "clinicId"             INT NOT NULL,
            "consultationTicketId" INT NOT NULL
        );

        CREATE TABLE public."PhysicalExamination" (
            id                     TEXT PRIMARY KEY,
            "userId"               INT,
            "consultationTicketId" INT
        );

        CREATE TABLE public."Prescription" (
            id                     SERIAL PRIMARY KEY,
            "clinicId"             INT NOT NULL,
            "patientId"            INT,
            "consultationTicketId" INT
        );

        CREATE TABLE public."Medicine" (
            id               SERIAL PRIMARY KEY,
            "prescriptionId" INT NOT NULL
        );

        CREATE TABLE public."MedicineDispenseRecord" (
            id           SERIAL PRIMARY KEY,
            "medicineId" INT NOT NULL
        );

        CREATE TABLE public."Medication" (
            id          SERIAL PRIMARY KEY,
            "clinicId"  INT NOT NULL,
            "patientId" INT NOT NULL
        );

        CREATE TABLE public."MedicationDrug" (
            id             SERIAL PRIMARY KEY,
            "medicationId" INT NOT NULL
        );

        CREATE TABLE public."ClinicReferralSlip" (
            id                     SERIAL PRIMARY KEY,
            "clinicId"             INT NOT NULL,
            "clinicPatientId"      INT,
            "consultationTicketId" INT,
            "appointmentId"        INT
        );

        CREATE TABLE public."DiagnosticRequest" (
            id                     TEXT PRIMARY KEY,
            "clinicId"             INT NOT NULL,
            "patientId"            INT NOT NULL,
            "consultationTicketId" INT
        );

        CREATE TABLE public."ClinicLaboratoryRequest" (
            id                SERIAL PRIMARY KEY,
            "clinicId"        INT NOT NULL,
            "clinicPatientId" INT NOT NULL
        );

        CREATE TABLE public."ClinicLaboratoryRequestProcedure" (
            id                          SERIAL PRIMARY KEY,
            "clinicLaboratoryRequestId" INT NOT NULL
        );

        CREATE TABLE public."ClinicImagingRequest" (
            id                SERIAL PRIMARY KEY,
            "clinicId"        INT NOT NULL,
            "clinicPatientId" INT NOT NULL
        );

        CREATE TABLE public."ClinicImagingRequestProcedure" (
            id                       SERIAL PRIMARY KEY,
            "clinicImagingRequestId" INT NOT NULL
        );

        CREATE TABLE public."ClinicHeartStationRequest" (
            id                SERIAL PRIMARY KEY,
            "clinicId"        INT NOT NULL,
            "clinicPatientId" INT NOT NULL
        );

        CREATE TABLE public."ClinicHeartStationRequestProcedure" (
            id                            SERIAL PRIMARY KEY,
            "clinicHeartStationRequestId" INT NOT NULL
        );

        CREATE TABLE public."Folder" (
            id       SERIAL PRIMARY KEY,
            "userId" INT NOT NULL
        );

        CREATE TABLE public."FolderSetting" (
            id         SERIAL PRIMARY KEY,
            "folderId" INT NOT NULL
        );

        CREATE TABLE public."FolderClinicShare" (
            id                SERIAL PRIMARY KEY,
            "folderSettingId" INT NOT NULL,
            "clinicId"        INT NOT NULL
        );

        CREATE TABLE public."File" (
            id         SERIAL PRIMARY KEY,
            "folderId" INT NOT NULL
        );

        CREATE TABLE public."FileSetting" (
            id       SERIAL PRIMARY KEY,
            "fileId" INT NOT NULL
        );

        CREATE TABLE public."FileClinicShare" (
            id              SERIAL PRIMARY KEY,
            "fileSettingId" INT NOT NULL,
            "clinicId"      INT NOT NULL
        );

        CREATE TABLE public."OrgMemberRequirementFile" (
            id            SERIAL PRIMARY KEY,
            "orgMemberId" INT NOT NULL,
            "fileId"      INT NOT NULL
        );
        """;

    private const string ClinicMinimalSchemaSql = """
        CREATE TABLE public."Settings" (
            "Id"           UUID PRIMARY KEY,
            "TenantId"     VARCHAR(100) NOT NULL,
            "TenantSlug"   VARCHAR(100),
            "FacilitySlug" VARCHAR(100),
            "ClinicId"     UUID NOT NULL,
            "ClinicName"   VARCHAR(200) NOT NULL,
            "CreatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
            "IsDeleted"    BOOLEAN NOT NULL DEFAULT FALSE
        );

        CREATE TABLE public."CustomFieldDefinitions" (
            "Id"                     UUID PRIMARY KEY,
            "EntityType"             TEXT NOT NULL,
            "FieldKey"               TEXT NOT NULL,
            "Label"                  TEXT NOT NULL,
            "DataType"               TEXT NOT NULL,
            "Category"               TEXT NOT NULL,
            "IsRequired"             BOOLEAN NOT NULL DEFAULT FALSE,
            "DisplayOrder"           INT NOT NULL DEFAULT 0,
            "OptionsJson"            TEXT,
            "Placeholder"            TEXT,
            "IsActive"               BOOLEAN NOT NULL DEFAULT TRUE,
            "VisibilityRuleJson"     TEXT,
            "ConditionalOptionsJson" TEXT,
            "BoundaryMode"           TEXT,
            "CreatedAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
            "CreatedBy"              TEXT,
            "UpdatedAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
            "UpdatedBy"              TEXT,
            "IsDeleted"              BOOLEAN NOT NULL DEFAULT FALSE,
            "TenantId"               TEXT NOT NULL,
            "ClinicId"               UUID NOT NULL
        );

        CREATE TABLE public."Patients" (
            "Id"                           UUID PRIMARY KEY,
            "PatientCode"                  TEXT NOT NULL,
            "FirstName"                    VARCHAR(100) NOT NULL,
            "LastName"                     VARCHAR(100) NOT NULL,
            "MiddleName"                   VARCHAR(100),
            "Suffix"                       VARCHAR(20),
            "DateOfBirth"                  DATE,
            "Sex"                          TEXT NOT NULL,
            "CivilStatus"                  TEXT,
            "BloodType"                    TEXT,
            "ContactNumber"                VARCHAR(50) NOT NULL,
            "LandlineNumber"               VARCHAR(50),
            "Email"                        VARCHAR(255),
            "Occupation"                   TEXT,
            "EmergencyContactName"         TEXT,
            "EmergencyContactNumber"       TEXT,
            "EmergencyContactRelationship" TEXT,
            "PhilHealthNumber"             VARCHAR(30),
            "PreferredName"                VARCHAR(100),
            "Nationality"                  VARCHAR(100),
            "Religion"                     VARCHAR(100),
            "IsDeceased"                   BOOLEAN NOT NULL DEFAULT FALSE,
            "CustomFields"                 JSONB NOT NULL DEFAULT '{}'::jsonb,
            "HasActiveSafetyAlert"         BOOLEAN NOT NULL DEFAULT FALSE,
            "VerificationStatus"           TEXT NOT NULL DEFAULT 'Verified',
            "ShareGrantScopes"             TEXT NOT NULL DEFAULT '',
            "CreatedAt"                    TIMESTAMPTZ NOT NULL DEFAULT now(),
            "CreatedBy"                    TEXT,
            "UpdatedAt"                    TIMESTAMPTZ NOT NULL DEFAULT now(),
            "UpdatedBy"                    TEXT,
            "IsDeleted"                    BOOLEAN NOT NULL DEFAULT FALSE,
            "TenantId"                     TEXT NOT NULL,
            "ClinicId"                     UUID NOT NULL
        );
        """;

    private const string PatientMinimalSchemaSql = """
        CREATE TABLE public.patients (
            id                    UUID PRIMARY KEY,
            client_id             UUID NOT NULL,
            clerk_user_id         TEXT,
            clinic_ez_id          TEXT NOT NULL,
            first_name            VARCHAR(100) NOT NULL,
            middle_name           VARCHAR(100),
            last_name             VARCHAR(100) NOT NULL,
            suffix                VARCHAR(20),
            sex                   TEXT,
            date_of_birth         DATE,
            place_of_birth        VARCHAR(250),
            civil_status          TEXT,
            blood_type            TEXT,
            nationality           VARCHAR(80),
            religion              VARCHAR(80),
            avatar_url            VARCHAR(500),
            mobile                VARCHAR(20),
            alt_phone             VARCHAR(20),
            email                 VARCHAR(254),
            consent_to_share_info BOOLEAN NOT NULL DEFAULT TRUE,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by            TEXT,
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by            TEXT,
            is_deleted            BOOLEAN NOT NULL DEFAULT FALSE
        );
        """;
}
