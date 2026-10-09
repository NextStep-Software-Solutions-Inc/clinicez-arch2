using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLabPaymentCorrection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PaymentCorrectedAtUtc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PaymentCorrection",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaymentCorrectedAtUtc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "PaymentCorrection",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");
        }
    }
}
