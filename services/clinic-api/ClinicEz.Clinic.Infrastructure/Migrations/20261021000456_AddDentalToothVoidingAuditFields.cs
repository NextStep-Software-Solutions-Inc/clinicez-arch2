using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDentalToothVoidingAuditFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsVoided",
                schema: "public",
                table: "DentalToothRecords",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "VoidReason",
                schema: "public",
                table: "DentalToothRecords",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "VoidedAt",
                schema: "public",
                table: "DentalToothRecords",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VoidedBy",
                schema: "public",
                table: "DentalToothRecords",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsVoided",
                schema: "public",
                table: "DentalToothRecords");

            migrationBuilder.DropColumn(
                name: "VoidReason",
                schema: "public",
                table: "DentalToothRecords");

            migrationBuilder.DropColumn(
                name: "VoidedAt",
                schema: "public",
                table: "DentalToothRecords");

            migrationBuilder.DropColumn(
                name: "VoidedBy",
                schema: "public",
                table: "DentalToothRecords");
        }
    }
}
