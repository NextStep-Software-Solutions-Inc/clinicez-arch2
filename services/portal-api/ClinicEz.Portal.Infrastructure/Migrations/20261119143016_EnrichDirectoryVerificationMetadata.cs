using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EnrichDirectoryVerificationMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ReviewedByDisplayName",
                schema: "public",
                table: "PractitionerVerificationRequests",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewedByEmail",
                schema: "public",
                table: "PractitionerVerificationRequests",
                type: "character varying(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubmittedByDisplayName",
                schema: "public",
                table: "PractitionerVerificationRequests",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewedByDisplayName",
                schema: "public",
                table: "FacilityVerificationRequests",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewedByEmail",
                schema: "public",
                table: "FacilityVerificationRequests",
                type: "character varying(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "LtoExpiryDate",
                schema: "public",
                table: "Facilities",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReviewedByDisplayName",
                schema: "public",
                table: "PractitionerVerificationRequests");

            migrationBuilder.DropColumn(
                name: "ReviewedByEmail",
                schema: "public",
                table: "PractitionerVerificationRequests");

            migrationBuilder.DropColumn(
                name: "SubmittedByDisplayName",
                schema: "public",
                table: "PractitionerVerificationRequests");

            migrationBuilder.DropColumn(
                name: "ReviewedByDisplayName",
                schema: "public",
                table: "FacilityVerificationRequests");

            migrationBuilder.DropColumn(
                name: "ReviewedByEmail",
                schema: "public",
                table: "FacilityVerificationRequests");

            migrationBuilder.DropColumn(
                name: "LtoExpiryDate",
                schema: "public",
                table: "Facilities");
        }
    }
}
