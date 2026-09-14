using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AlignTenantProperties : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "FacilityType",
                schema: "main",
                table: "Tenants",
                newName: "TenantType");

            migrationBuilder.RenameColumn(
                name: "ClinicalBranchesCount",
                schema: "main",
                table: "Tenants",
                newName: "FacilitiesCount");

            migrationBuilder.RenameColumn(
                name: "ClinicName",
                schema: "main",
                table: "Tenants",
                newName: "Name");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TenantType",
                schema: "main",
                table: "Tenants",
                newName: "FacilityType");

            migrationBuilder.RenameColumn(
                name: "Name",
                schema: "main",
                table: "Tenants",
                newName: "ClinicName");

            migrationBuilder.RenameColumn(
                name: "FacilitiesCount",
                schema: "main",
                table: "Tenants",
                newName: "ClinicalBranchesCount");
        }
    }
}
