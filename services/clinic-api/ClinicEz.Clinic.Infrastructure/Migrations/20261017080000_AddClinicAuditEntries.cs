using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicAuditEntries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ClinicAuditEntries",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Action = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ActorStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClientIpAddress = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UserAgent = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    TargetEntityType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TargetEntityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientNameMasked = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    PatientPinMasked = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Outcome = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    MetadataJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClinicAuditEntries", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_ActorStaffId_Timestamp",
                schema: "clinic_dashboard",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "ActorStaffId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_Category_Timestamp",
                schema: "clinic_dashboard",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "Category", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_PatientId_Timestamp",
                schema: "clinic_dashboard",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "PatientId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_Severity_Timestamp",
                schema: "clinic_dashboard",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "Severity", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_TargetEntityType_TargetEntityId",
                schema: "clinic_dashboard",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "TargetEntityType", "TargetEntityId" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_TenantId_ClinicId_Timestamp",
                schema: "clinic_dashboard",
                table: "ClinicAuditEntries",
                columns: new[] { "TenantId", "ClinicId", "Timestamp" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ClinicAuditEntries",
                schema: "clinic_dashboard");
        }
    }
}
