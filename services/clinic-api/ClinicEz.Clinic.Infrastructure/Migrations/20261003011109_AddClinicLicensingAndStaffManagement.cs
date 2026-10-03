using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicLicensingAndStaffManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CriticalFindingsJson",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalLabName",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalReportFileBase64",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalReportType",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalReportUrl",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasCriticalPanicAlert",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ObservationsJson",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PanicAcknowledgedAt",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PanicAcknowledgedBy",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PanicAlertTriggeredAt",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PathologistImpression",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PathologistPrcLicense",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicUploadToken",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReportReleasedAt",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UploadedBy",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerifiedByPathologist",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrescriptionNumber",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxDispenseStatus",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(50)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "RxDispensedAt",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxDispensedPharmacistName",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxDispensedPharmacistPrc",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxDispensedPharmacyName",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxDispensedReceiptNumber",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxDispensedReceiptUrl",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxNotes",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxPublicVerificationToken",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LicenseExpiresAt",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LicenseToken",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxStaffLimit",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "PlanTier",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CriticalFindingsJson",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "ExternalLabName",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "ExternalReportFileBase64",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "ExternalReportType",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "ExternalReportUrl",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "HasCriticalPanicAlert",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "ObservationsJson",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "PanicAcknowledgedAt",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "PanicAcknowledgedBy",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "PanicAlertTriggeredAt",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "PathologistImpression",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "PathologistPrcLicense",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "PublicUploadToken",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "ReportReleasedAt",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "UploadedBy",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "VerifiedByPathologist",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "PrescriptionNumber",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxDispenseStatus",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxDispensedAt",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxDispensedPharmacistName",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxDispensedPharmacistPrc",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxDispensedPharmacyName",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxDispensedReceiptNumber",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxDispensedReceiptUrl",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxNotes",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxPublicVerificationToken",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "LicenseExpiresAt",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "LicenseToken",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "MaxStaffLimit",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "PlanTier",
                schema: "clinic_dashboard",
                table: "ClinicSettings");
        }
    }
}
