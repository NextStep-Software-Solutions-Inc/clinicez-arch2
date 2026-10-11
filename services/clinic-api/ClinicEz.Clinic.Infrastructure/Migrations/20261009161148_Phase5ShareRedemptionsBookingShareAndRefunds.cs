using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Phase5ShareRedemptionsBookingShareAndRefunds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DenialCode",
                schema: "clinic_dashboard",
                table: "ShareImports",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsRefresh",
                schema: "clinic_dashboard",
                table: "ShareImports",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "MaxRedemptions",
                schema: "clinic_dashboard",
                table: "ShareImports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RedemptionNumber",
                schema: "clinic_dashboard",
                table: "ShareImports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RefundedAmount",
                schema: "clinic_dashboard",
                table: "Invoices",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "SharedItemsJson",
                schema: "clinic_dashboard",
                table: "Appointments",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "SharedScopes",
                schema: "clinic_dashboard",
                table: "Appointments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "None");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DenialCode",
                schema: "clinic_dashboard",
                table: "ShareImports");

            migrationBuilder.DropColumn(
                name: "IsRefresh",
                schema: "clinic_dashboard",
                table: "ShareImports");

            migrationBuilder.DropColumn(
                name: "MaxRedemptions",
                schema: "clinic_dashboard",
                table: "ShareImports");

            migrationBuilder.DropColumn(
                name: "RedemptionNumber",
                schema: "clinic_dashboard",
                table: "ShareImports");

            migrationBuilder.DropColumn(
                name: "RefundedAmount",
                schema: "clinic_dashboard",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "SharedItemsJson",
                schema: "clinic_dashboard",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "SharedScopes",
                schema: "clinic_dashboard",
                table: "Appointments");
        }
    }
}
