using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientImmunization : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PatientImmunizations",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    PhilHealthLibrary = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PhilHealthCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    VaccineName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    BrandName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Manufacturer = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    LotBatchNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ExpirationDate = table.Column<DateOnly>(type: "date", nullable: false),
                    DoseSequence = table.Column<int>(type: "integer", nullable: false),
                    IsSeriesCompleted = table.Column<bool>(type: "boolean", nullable: false),
                    Route = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    InjectionSite = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AdministeredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AdministeredByStaffId = table.Column<Guid>(type: "uuid", nullable: false),
                    AdministeredByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    AdministeredByPrcLicense = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HasAdverseReaction = table.Column<bool>(type: "boolean", nullable: false),
                    AdverseReactionSeverity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "None"),
                    AdverseReactionRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    AdverseReactionRecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsHistorical = table.Column<bool>(type: "boolean", nullable: false),
                    HistoricalFacilityName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IsSynchronizedToPatientApp = table.Column<bool>(type: "boolean", nullable: false),
                    SynchronizedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientImmunizations", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_ClinicId_AdministeredAtUtc",
                schema: "clinic_dashboard",
                table: "PatientImmunizations",
                columns: new[] { "ClinicId", "AdministeredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_LotBatchNumber_ExpirationDate",
                schema: "clinic_dashboard",
                table: "PatientImmunizations",
                columns: new[] { "LotBatchNumber", "ExpirationDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_TenantId_ClinicId_PatientId",
                schema: "clinic_dashboard",
                table: "PatientImmunizations",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PatientImmunizations",
                schema: "clinic_dashboard");
        }
    }
}
