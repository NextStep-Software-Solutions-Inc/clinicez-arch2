using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAppointmentRemindersAndNotificationSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AppointmentReminder24hEnabled",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AppointmentReminder2hEnabled",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "EnableAppointmentReminders",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "EnableStaffAppointmentNotifications",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastReminderSentAt",
                schema: "public",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastReminderType",
                schema: "public",
                table: "Appointments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Reminder24hSent",
                schema: "public",
                table: "Appointments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "Reminder24hSentAt",
                schema: "public",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Reminder2hSent",
                schema: "public",
                table: "Appointments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "Reminder2hSentAt",
                schema: "public",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_Status_ScheduledAt_Reminder24hSent",
                schema: "public",
                table: "Appointments",
                columns: new[] { "Status", "ScheduledAt", "Reminder24hSent" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_Status_ScheduledAt_Reminder2hSent",
                schema: "public",
                table: "Appointments",
                columns: new[] { "Status", "ScheduledAt", "Reminder2hSent" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Appointments_Status_ScheduledAt_Reminder24hSent",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropIndex(
                name: "IX_Appointments_Status_ScheduledAt_Reminder2hSent",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "AppointmentReminder24hEnabled",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "AppointmentReminder2hEnabled",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "EnableAppointmentReminders",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "EnableStaffAppointmentNotifications",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "LastReminderSentAt",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "LastReminderType",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "Reminder24hSent",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "Reminder24hSentAt",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "Reminder2hSent",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "Reminder2hSentAt",
                schema: "public",
                table: "Appointments");
        }
    }
}
