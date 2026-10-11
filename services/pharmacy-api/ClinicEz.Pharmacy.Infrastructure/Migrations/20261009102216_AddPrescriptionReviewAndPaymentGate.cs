using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPrescriptionReviewAndPaymentGate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PaidAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PaidAt",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PaymentPolicy",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "integer",
                nullable: false,
                defaultValue: 2);

            migrationBuilder.AddColumn<string>(
                name: "PaymentReceiptNumber",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PaymentStatus",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "PharmacyName",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "QuotedAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReviewedAt",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StatusReason",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VisitKey",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PaymentPolicy",
                schema: "pharmacy_dashboard",
                table: "PharmacySettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(
                """
                UPDATE pharmacy_dashboard."PrescriptionOrders" o
                SET "PharmacyName" = s."PharmacyName"
                FROM pharmacy_dashboard."PharmacySettings" s
                WHERE s."TenantId" = o."TenantId"
                  AND s."PharmacyId"::text = o."PharmacyId"
                  AND o."PharmacyName" = '';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaidAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PaidAt",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PaymentPolicy",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PaymentReceiptNumber",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PaymentStatus",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PharmacyName",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "QuotedAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "ReviewedAt",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "StatusReason",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "VisitKey",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PaymentPolicy",
                schema: "pharmacy_dashboard",
                table: "PharmacySettings");
        }
    }
}
