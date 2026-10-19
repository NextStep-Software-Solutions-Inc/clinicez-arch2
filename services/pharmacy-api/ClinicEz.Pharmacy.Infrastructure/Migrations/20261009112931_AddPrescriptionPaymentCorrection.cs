using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPrescriptionPaymentCorrection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PaymentCorrectedAt",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PaymentReversedAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaymentCorrectedAt",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PaymentReversedAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");
        }
    }
}
