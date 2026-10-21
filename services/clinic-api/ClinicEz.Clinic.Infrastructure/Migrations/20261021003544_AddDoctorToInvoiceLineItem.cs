using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDoctorToInvoiceLineItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttendingDoctorName",
                schema: "public",
                table: "Invoices");

            migrationBuilder.AddColumn<Guid>(
                name: "DoctorId",
                schema: "public",
                table: "InvoiceLineItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DoctorName",
                schema: "public",
                table: "InvoiceLineItems",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DoctorId",
                schema: "public",
                table: "InvoiceLineItems");

            migrationBuilder.DropColumn(
                name: "DoctorName",
                schema: "public",
                table: "InvoiceLineItems");

            migrationBuilder.AddColumn<string>(
                name: "AttendingDoctorName",
                schema: "public",
                table: "Invoices",
                type: "text",
                nullable: true);
        }
    }
}
