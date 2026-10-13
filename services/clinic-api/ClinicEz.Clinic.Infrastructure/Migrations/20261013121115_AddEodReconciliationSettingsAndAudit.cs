using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEodReconciliationSettingsAndAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AutoEodEnabled",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "EodReconciliationTime",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "21:00");

            migrationBuilder.CreateTable(
                name: "EodReconciliationAudits",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReconciliationDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ReconciledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TriggerType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReconciledBy = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    StaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    TotalTicketsProcessed = table.Column<int>(type: "integer", nullable: false),
                    AffectedTicketNumbersJson = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
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
                    table.PrimaryKey("PK_EodReconciliationAudits", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EodReconciliationAudits_TenantId_ClinicId_ReconciliationDate",
                schema: "clinic_dashboard",
                table: "EodReconciliationAudits",
                columns: new[] { "TenantId", "ClinicId", "ReconciliationDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EodReconciliationAudits",
                schema: "clinic_dashboard");

            migrationBuilder.DropColumn(
                name: "AutoEodEnabled",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "EodReconciliationTime",
                schema: "clinic_dashboard",
                table: "ClinicSettings");
        }
    }
}
