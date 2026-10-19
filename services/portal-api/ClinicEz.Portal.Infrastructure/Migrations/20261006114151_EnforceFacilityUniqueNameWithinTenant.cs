using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EnforceFacilityUniqueNameWithinTenant : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Facilities_TenantId",
                schema: "main",
                table: "Facilities");

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_TenantId_Name",
                schema: "main",
                table: "Facilities",
                columns: new[] { "TenantId", "Name" },
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Facilities_TenantId_Name",
                schema: "main",
                table: "Facilities");

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_TenantId",
                schema: "main",
                table: "Facilities",
                column: "TenantId");
        }
    }
}
