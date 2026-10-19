using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBranchIdToPrescriptionOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BranchId",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionOrders_BranchId",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                column: "BranchId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PrescriptionOrders_BranchId",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");
        }
    }
}
