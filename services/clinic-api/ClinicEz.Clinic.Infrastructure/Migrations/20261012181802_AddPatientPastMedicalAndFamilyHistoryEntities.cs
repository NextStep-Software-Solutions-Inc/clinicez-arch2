using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientPastMedicalAndFamilyHistoryEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Clean up any stale migration history record from previous manual migration attempt
            migrationBuilder.Sql(@"
DELETE FROM clinic_dashboard.""__EFMigrationsHistory""
WHERE ""MigrationId"" = '20261013000000_AddPatientPastMedicalAndFamilyHistoryEntities';
");

            // 1. Add notes columns to Patients table idempotently
            migrationBuilder.Sql(@"
ALTER TABLE clinic_dashboard.""Patients"" ADD COLUMN IF NOT EXISTS ""FamilyMedicalHistoryNotes"" text;
ALTER TABLE clinic_dashboard.""Patients"" ADD COLUMN IF NOT EXISTS ""PersonalMedicalHistoryNotes"" text;
");

            // 2. PatientFamilyHistories Table
            migrationBuilder.Sql(@"
CREATE TABLE IF NOT EXISTS clinic_dashboard.""PatientFamilyHistories"" (
    ""Id"" uuid NOT NULL,
    ""TenantId"" character varying(100) NOT NULL,
    ""ClinicId"" uuid NOT NULL,
    ""PatientId"" uuid NOT NULL,
    ""ConditionTitle"" character varying(255) NOT NULL,
    ""PhilHealthMdiseaseCode"" character varying(50),
    ""Icd10Code"" character varying(50),
    ""SpecificDescription"" character varying(500),
    ""Relationship"" character varying(100),
    ""ClinicalNotes"" character varying(1000),
    ""CreatedAt"" timestamp with time zone NOT NULL,
    ""CreatedBy"" text NOT NULL,
    ""UpdatedAt"" timestamp with time zone,
    ""UpdatedBy"" text,
    ""IsDeleted"" boolean NOT NULL,
    ""DeletedAt"" timestamp with time zone,
    ""DeletedBy"" text,
    CONSTRAINT ""PK_PatientFamilyHistories"" PRIMARY KEY (""Id""),
    CONSTRAINT ""FK_PatientFamilyHistories_Patients_PatientId"" FOREIGN KEY (""PatientId"") REFERENCES clinic_dashboard.""Patients"" (""Id"") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ""IX_PatientFamilyHistories_ClinicId_PatientId_PhilHealthMdiseas~"" 
    ON clinic_dashboard.""PatientFamilyHistories"" (""ClinicId"", ""PatientId"", ""PhilHealthMdiseaseCode"");

CREATE INDEX IF NOT EXISTS ""IX_PatientFamilyHistories_PatientId"" 
    ON clinic_dashboard.""PatientFamilyHistories"" (""PatientId"");

CREATE INDEX IF NOT EXISTS ""IX_PatientFamilyHistories_TenantId_ClinicId_PatientId"" 
    ON clinic_dashboard.""PatientFamilyHistories"" (""TenantId"", ""ClinicId"", ""PatientId"");
");

            // 3. PatientPastMedicalHistories Table
            migrationBuilder.Sql(@"
CREATE TABLE IF NOT EXISTS clinic_dashboard.""PatientPastMedicalHistories"" (
    ""Id"" uuid NOT NULL,
    ""TenantId"" character varying(100) NOT NULL,
    ""ClinicId"" uuid NOT NULL,
    ""PatientId"" uuid NOT NULL,
    ""ConditionTitle"" character varying(255) NOT NULL,
    ""PhilHealthMdiseaseCode"" character varying(50),
    ""Icd10Code"" character varying(50),
    ""SpecificDescription"" character varying(500),
    ""OnsetDate"" date,
    ""IsResolved"" boolean NOT NULL,
    ""ClinicalNotes"" character varying(1000),
    ""CreatedAt"" timestamp with time zone NOT NULL,
    ""CreatedBy"" text NOT NULL,
    ""UpdatedAt"" timestamp with time zone,
    ""UpdatedBy"" text,
    ""IsDeleted"" boolean NOT NULL,
    ""DeletedAt"" timestamp with time zone,
    ""DeletedBy"" text,
    CONSTRAINT ""PK_PatientPastMedicalHistories"" PRIMARY KEY (""Id""),
    CONSTRAINT ""FK_PatientPastMedicalHistories_Patients_PatientId"" FOREIGN KEY (""PatientId"") REFERENCES clinic_dashboard.""Patients"" (""Id"") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ""IX_PatientPastMedicalHistories_ClinicId_PatientId_PhilHealthMd~"" 
    ON clinic_dashboard.""PatientPastMedicalHistories"" (""ClinicId"", ""PatientId"", ""PhilHealthMdiseaseCode"");

CREATE INDEX IF NOT EXISTS ""IX_PatientPastMedicalHistories_PatientId"" 
    ON clinic_dashboard.""PatientPastMedicalHistories"" (""PatientId"");

CREATE INDEX IF NOT EXISTS ""IX_PatientPastMedicalHistories_TenantId_ClinicId_PatientId"" 
    ON clinic_dashboard.""PatientPastMedicalHistories"" (""TenantId"", ""ClinicId"", ""PatientId"");
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DROP TABLE IF EXISTS clinic_dashboard.""PatientFamilyHistories"";
DROP TABLE IF EXISTS clinic_dashboard.""PatientPastMedicalHistories"";
ALTER TABLE clinic_dashboard.""Patients"" DROP COLUMN IF EXISTS ""FamilyMedicalHistoryNotes"";
ALTER TABLE clinic_dashboard.""Patients"" DROP COLUMN IF EXISTS ""PersonalMedicalHistoryNotes"";
");
        }
    }
}
