using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStaffAppointmentCadenceAndDeduplication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EnableStaffMorningDigest",
                schema: "public",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "EnableStaffOverdueAlerts",
                schema: "public",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "EnableStaffPreSlotReminders",
                schema: "public",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StaffOverdueNotifiedAt",
                schema: "public",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StaffPreSlotNotifiedAt",
                schema: "public",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StaffNotifications_ClinicId_SourceType_SourceId",
                schema: "public",
                table: "StaffNotifications",
                columns: new[] { "ClinicId", "SourceType", "SourceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_Status_ScheduledAt_StaffOverdueNotifiedAt",
                schema: "public",
                table: "Appointments",
                columns: new[] { "Status", "ScheduledAt", "StaffOverdueNotifiedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_Status_ScheduledAt_StaffPreSlotNotifiedAt",
                schema: "public",
                table: "Appointments",
                columns: new[] { "Status", "ScheduledAt", "StaffPreSlotNotifiedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StaffNotifications_ClinicId_SourceType_SourceId",
                schema: "public",
                table: "StaffNotifications");

            migrationBuilder.DropIndex(
                name: "IX_Appointments_Status_ScheduledAt_StaffOverdueNotifiedAt",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropIndex(
                name: "IX_Appointments_Status_ScheduledAt_StaffPreSlotNotifiedAt",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "EnableStaffMorningDigest",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "EnableStaffOverdueAlerts",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "EnableStaffPreSlotReminders",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "StaffOverdueNotifiedAt",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "StaffPreSlotNotifiedAt",
                schema: "public",
                table: "Appointments");
        }
    }
}
