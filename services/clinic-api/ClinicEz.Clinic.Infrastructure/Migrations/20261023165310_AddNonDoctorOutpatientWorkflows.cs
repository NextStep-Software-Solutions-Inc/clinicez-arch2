using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddNonDoctorOutpatientWorkflows : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsNurseOrderable",
                schema: "public",
                table: "ServiceItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "DischargeNotes",
                schema: "public",
                table: "QueueItems",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DischargedAt",
                schema: "public",
                table: "QueueItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DischargedByStaffId",
                schema: "public",
                table: "QueueItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DivertedAt",
                schema: "public",
                table: "QueueItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DivertedByStaffId",
                schema: "public",
                table: "QueueItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DivertedToFacility",
                schema: "public",
                table: "QueueItems",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HandoverSummary",
                schema: "public",
                table: "QueueItems",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ParamedicOrEscortName",
                schema: "public",
                table: "QueueItems",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TransportMode",
                schema: "public",
                table: "QueueItems",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VisitType",
                schema: "public",
                table: "QueueItems",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Consultation");

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_TenantId_ClinicId_QueueDate_Status",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "TenantId", "ClinicId", "QueueDate", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_TenantId_ClinicId_VisitType",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "TenantId", "ClinicId", "VisitType" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_QueueItems_TenantId_ClinicId_QueueDate_Status",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropIndex(
                name: "IX_QueueItems_TenantId_ClinicId_VisitType",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "IsNurseOrderable",
                schema: "public",
                table: "ServiceItems");

            migrationBuilder.DropColumn(
                name: "DischargeNotes",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "DischargedAt",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "DischargedByStaffId",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "DivertedAt",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "DivertedByStaffId",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "DivertedToFacility",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "HandoverSummary",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "ParamedicOrEscortName",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "TransportMode",
                schema: "public",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "VisitType",
                schema: "public",
                table: "QueueItems");
        }
    }
}
