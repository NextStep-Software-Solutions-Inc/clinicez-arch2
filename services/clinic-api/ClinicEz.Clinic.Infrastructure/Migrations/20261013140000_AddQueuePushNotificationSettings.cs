using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddQueuePushNotificationSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ApproachingNotificationSent",
                schema: "clinic_dashboard",
                table: "QueueItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CalledNotificationSent",
                schema: "clinic_dashboard",
                table: "QueueItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "SyncPatientId",
                schema: "clinic_dashboard",
                table: "QueueItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "EnableQueuePushNotifications",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "QueuePushNotificationThreshold",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "integer",
                nullable: false,
                defaultValue: 2);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApproachingNotificationSent",
                schema: "clinic_dashboard",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "CalledNotificationSent",
                schema: "clinic_dashboard",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "SyncPatientId",
                schema: "clinic_dashboard",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "EnableQueuePushNotifications",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "QueuePushNotificationThreshold",
                schema: "clinic_dashboard",
                table: "ClinicSettings");
        }
    }
}
