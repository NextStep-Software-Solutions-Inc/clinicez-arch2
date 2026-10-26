using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Comms.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddP2CTriageFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GrantId",
                schema: "comms",
                table: "comms_conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "GrantWindowEndUtc",
                schema: "comms",
                table: "comms_conversations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "IdleDeadlineUtc",
                schema: "comms",
                table: "comms_conversations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsOffHoursSubmission",
                schema: "comms",
                table: "comms_conversations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "PatientId",
                schema: "comms",
                table: "comms_conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Relationship",
                schema: "comms",
                table: "comms_conversations",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SlaBreached",
                schema: "comms",
                table: "comms_conversations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "SubmittingAccountId",
                schema: "comms",
                table: "comms_conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SupervisorAlertedAtUtc",
                schema: "comms",
                table: "comms_conversations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TriageDueAtUtc",
                schema: "comms",
                table: "comms_conversations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TriagedAtUtc",
                schema: "comms",
                table: "comms_conversations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TriagedByStaffId",
                schema: "comms",
                table: "comms_conversations",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TriagedByStaffName",
                schema: "comms",
                table: "comms_conversations",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_comms_conversations_TenantId_FacilityId_Status_TriageDueAtU~",
                schema: "comms",
                table: "comms_conversations",
                columns: new[] { "TenantId", "FacilityId", "Status", "TriageDueAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_conversations_TenantId_PatientId_Status_CreatedAtUtc",
                schema: "comms",
                table: "comms_conversations",
                columns: new[] { "TenantId", "PatientId", "Status", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_comms_conversations_TenantId_FacilityId_Status_TriageDueAtU~",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropIndex(
                name: "IX_comms_conversations_TenantId_PatientId_Status_CreatedAtUtc",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "GrantId",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "GrantWindowEndUtc",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "IdleDeadlineUtc",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "IsOffHoursSubmission",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "PatientId",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "Relationship",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "SlaBreached",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "SubmittingAccountId",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "SupervisorAlertedAtUtc",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "TriageDueAtUtc",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "TriagedAtUtc",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "TriagedByStaffId",
                schema: "comms",
                table: "comms_conversations");

            migrationBuilder.DropColumn(
                name: "TriagedByStaffName",
                schema: "comms",
                table: "comms_conversations");
        }
    }
}
