using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Billing.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBillingFacilityLicenseColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EntitlementVersion",
                schema: "billing",
                table: "billing_facilities",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LicenseExpiresAt",
                schema: "billing",
                table: "billing_facilities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LicenseToken",
                schema: "billing",
                table: "billing_facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlanTier",
                schema: "billing",
                table: "billing_facilities",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EntitlementVersion",
                schema: "billing",
                table: "billing_facilities");

            migrationBuilder.DropColumn(
                name: "LicenseExpiresAt",
                schema: "billing",
                table: "billing_facilities");

            migrationBuilder.DropColumn(
                name: "LicenseToken",
                schema: "billing",
                table: "billing_facilities");

            migrationBuilder.DropColumn(
                name: "PlanTier",
                schema: "billing",
                table: "billing_facilities");
        }
    }
}
