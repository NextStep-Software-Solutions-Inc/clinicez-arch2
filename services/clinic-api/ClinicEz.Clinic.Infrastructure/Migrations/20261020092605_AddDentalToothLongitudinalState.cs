using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDentalToothLongitudinalState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActiveSurface",
                schema: "public",
                table: "DentalToothRecords",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsCurrent",
                schema: "public",
                table: "DentalToothRecords",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "RecordedBy",
                schema: "public",
                table: "DentalToothRecords",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SupersededAt",
                schema: "public",
                table: "DentalToothRecords",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupersededByRecordId",
                schema: "public",
                table: "DentalToothRecords",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_ClinicId_PatientId_ToothNumber_IsCurrent",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "ClinicId", "PatientId", "ToothNumber", "IsCurrent" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DentalToothRecords_ClinicId_PatientId_ToothNumber_IsCurrent",
                schema: "public",
                table: "DentalToothRecords");

            migrationBuilder.DropColumn(
                name: "ActiveSurface",
                schema: "public",
                table: "DentalToothRecords");

            migrationBuilder.DropColumn(
                name: "IsCurrent",
                schema: "public",
                table: "DentalToothRecords");

            migrationBuilder.DropColumn(
                name: "RecordedBy",
                schema: "public",
                table: "DentalToothRecords");

            migrationBuilder.DropColumn(
                name: "SupersededAt",
                schema: "public",
                table: "DentalToothRecords");

            migrationBuilder.DropColumn(
                name: "SupersededByRecordId",
                schema: "public",
                table: "DentalToothRecords");
        }
    }
}
