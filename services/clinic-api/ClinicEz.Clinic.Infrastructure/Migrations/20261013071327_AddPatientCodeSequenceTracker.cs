using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientCodeSequenceTracker : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PatientSearchDisplayFieldsJson",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ServiceType",
                schema: "clinic_dashboard",
                table: "Appointments",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100,
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "PatientCodeSequenceTrackers",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    Year = table.Column<int>(type: "integer", nullable: false),
                    CurrentSequence = table.Column<int>(type: "integer", nullable: false),
                    LastAssignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
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
                    table.PrimaryKey("PK_PatientCodeSequenceTrackers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientCodeSequenceTrackers_TenantId_ClinicId_Year",
                schema: "clinic_dashboard",
                table: "PatientCodeSequenceTrackers",
                columns: new[] { "TenantId", "ClinicId", "Year" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PatientCodeSequenceTrackers",
                schema: "clinic_dashboard");

            migrationBuilder.DropColumn(
                name: "PatientSearchDisplayFieldsJson",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.AlterColumn<string>(
                name: "ServiceType",
                schema: "clinic_dashboard",
                table: "Appointments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(255)",
                oldMaxLength: 255,
                oldNullable: true);
        }
    }
}
