using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFacilityLicensingAndLimits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Barangay",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Classification",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactEmail",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactNumber",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadAddress",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadContact",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadFooter",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadHeader",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadSubHeader",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LicenseExpiresAt",
                schema: "main",
                table: "Facilities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LicenseToOperate",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LicenseToken",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoUrl",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxStaffLimit",
                schema: "main",
                table: "Facilities",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "NotificationPreferencesJson",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OperatingHours",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthAccreditationNumber",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlanTier",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Province",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Region",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StampPhysicianName",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StampPrcLicense",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StampPtrNumber",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StampS2License",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StreetAddress",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TaxIdentificationNumber",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ZipCode",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Barangay",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "City",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "Classification",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "ContactEmail",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "ContactNumber",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadAddress",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadContact",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadFooter",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadHeader",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadSubHeader",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LicenseExpiresAt",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LicenseToOperate",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LicenseToken",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LogoUrl",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "MaxStaffLimit",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "NotificationPreferencesJson",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "OperatingHours",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "PhilHealthAccreditationNumber",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "PlanTier",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "Province",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "Region",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StampPhysicianName",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StampPrcLicense",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StampPtrNumber",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StampS2License",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StreetAddress",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "TaxIdentificationNumber",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "ZipCode",
                schema: "main",
                table: "Facilities");
        }
    }
}
