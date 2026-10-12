using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddPatientPastMedicalAndFamilyHistoryEntities : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // 1. Add notes columns to Patients table
        migrationBuilder.AddColumn<string>(
            name: "PersonalMedicalHistoryNotes",
            schema: "clinic_dashboard",
            table: "Patients",
            type: "character varying(2000)",
            maxLength: 2000,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "FamilyMedicalHistoryNotes",
            schema: "clinic_dashboard",
            table: "Patients",
            type: "character varying(2000)",
            maxLength: 2000,
            nullable: true);

        // 2. PatientPastMedicalHistories Table
        migrationBuilder.CreateTable(
            name: "PatientPastMedicalHistories",
            schema: "clinic_dashboard",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                ConditionTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                PhilHealthMdiseaseCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                Icd10Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                SpecificDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                OnsetDate = table.Column<DateOnly>(type: "date", nullable: true),
                IsResolved = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                ClinicalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                CreatedBy = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                UpdatedBy = table.Column<string>(type: "text", nullable: true),
                IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                DeletedBy = table.Column<string>(type: "text", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PatientPastMedicalHistories", x => x.Id);
                table.ForeignKey(
                    name: "FK_PatientPastMedicalHistories_Patients_PatientId",
                    column: x => x.PatientId,
                    principalSchema: "clinic_dashboard",
                    principalTable: "Patients",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_PatientPastMedicalHistories_TenantId_ClinicId_PatientId",
            schema: "clinic_dashboard",
            table: "PatientPastMedicalHistories",
            columns: new[] { "TenantId", "ClinicId", "PatientId" });

        migrationBuilder.CreateIndex(
            name: "IX_PatientPastMedicalHistories_ClinicId_PatientId_PhilHealthMdiseaseCode",
            schema: "clinic_dashboard",
            table: "PatientPastMedicalHistories",
            columns: new[] { "ClinicId", "PatientId", "PhilHealthMdiseaseCode" });

        // 3. PatientFamilyHistories Table
        migrationBuilder.CreateTable(
            name: "PatientFamilyHistories",
            schema: "clinic_dashboard",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                ConditionTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                PhilHealthMdiseaseCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                Icd10Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                SpecificDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                Relationship = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                ClinicalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                CreatedBy = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                UpdatedBy = table.Column<string>(type: "text", nullable: true),
                IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                DeletedBy = table.Column<string>(type: "text", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PatientFamilyHistories", x => x.Id);
                table.ForeignKey(
                    name: "FK_PatientFamilyHistories_Patients_PatientId",
                    column: x => x.PatientId,
                    principalSchema: "clinic_dashboard",
                    principalTable: "Patients",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_PatientFamilyHistories_TenantId_ClinicId_PatientId",
            schema: "clinic_dashboard",
            table: "PatientFamilyHistories",
            columns: new[] { "TenantId", "ClinicId", "PatientId" });

        migrationBuilder.CreateIndex(
            name: "IX_PatientFamilyHistories_ClinicId_PatientId_PhilHealthMdiseaseCode",
            schema: "clinic_dashboard",
            table: "PatientFamilyHistories",
            columns: new[] { "ClinicId", "PatientId", "PhilHealthMdiseaseCode" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "PatientPastMedicalHistories",
            schema: "clinic_dashboard");

        migrationBuilder.DropTable(
            name: "PatientFamilyHistories",
            schema: "clinic_dashboard");

        migrationBuilder.DropColumn(
            name: "PersonalMedicalHistoryNotes",
            schema: "clinic_dashboard",
            table: "Patients");

        migrationBuilder.DropColumn(
            name: "FamilyMedicalHistoryNotes",
            schema: "clinic_dashboard",
            table: "Patients");
    }
}
