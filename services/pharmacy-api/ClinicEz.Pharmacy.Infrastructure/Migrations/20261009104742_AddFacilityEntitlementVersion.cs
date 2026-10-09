using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFacilityEntitlementVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EntitlementVersion",
                schema: "pharmacy_dashboard",
                table: "PharmacySettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EntitlementVersion",
                schema: "pharmacy_dashboard",
                table: "PharmacySettings");
        }
    }
}
