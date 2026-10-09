using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Phase4EntitlementsRxStageAndBillingOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "BillingRequestedAt",
                schema: "clinic_dashboard",
                table: "Invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxPharmacyFacilityId",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxPharmacyName",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxPharmacyTenantId",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RxQuotedAmount",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxStage",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(50)",
                nullable: false,
                defaultValue: "Issued");

            migrationBuilder.AddColumn<string>(
                name: "RxStageReason",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RxStageReportedAt",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EntitlementVersion",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BillingRequestedAt",
                schema: "clinic_dashboard",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "RxPharmacyFacilityId",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxPharmacyName",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxPharmacyTenantId",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxQuotedAmount",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxStage",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxStageReason",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxStageReportedAt",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "EntitlementVersion",
                schema: "clinic_dashboard",
                table: "ClinicSettings");
        }
    }
}
