using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStructuredProblemsAndAllergies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PatientProblems",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    Icd10Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ProblemTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PhilHealthMdiseaseCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsChronicNcd = table.Column<bool>(type: "boolean", nullable: false),
                    OnsetDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ResolvedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ClinicalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RecordedByDoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordedByDoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientProblems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PatientAllergies",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Allergen = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    AllergenDrugCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Severity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReactionManifestation = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsAnaphylactic = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    OnsetDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientAllergies", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientProblems_ClinicId_Icd10Code",
                schema: "clinic_dashboard",
                table: "PatientProblems",
                columns: new[] { "ClinicId", "Icd10Code" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientProblems_ClinicId_PatientId_Status",
                schema: "clinic_dashboard",
                table: "PatientProblems",
                columns: new[] { "ClinicId", "PatientId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientProblems_TenantId_ClinicId_PatientId",
                schema: "clinic_dashboard",
                table: "PatientProblems",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAllergies_ClinicId_PatientId_Category",
                schema: "clinic_dashboard",
                table: "PatientAllergies",
                columns: new[] { "ClinicId", "PatientId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAllergies_TenantId_ClinicId_PatientId",
                schema: "clinic_dashboard",
                table: "PatientAllergies",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PatientProblems",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "PatientAllergies",
                schema: "clinic_dashboard");
        }
    }
}
