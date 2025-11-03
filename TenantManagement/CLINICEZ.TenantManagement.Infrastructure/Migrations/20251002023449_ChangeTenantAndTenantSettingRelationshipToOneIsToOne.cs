using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERP_EZ.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChangeTenantAndTenantSettingRelationshipToOneIsToOne : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantSettings_TenantId",
                schema: "catalog",
                table: "TenantSettings");

            migrationBuilder.CreateIndex(
                name: "IX_TenantSettings_TenantId",
                schema: "catalog",
                table: "TenantSettings",
                column: "TenantId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantSettings_TenantId",
                schema: "catalog",
                table: "TenantSettings");

            migrationBuilder.CreateIndex(
                name: "IX_TenantSettings_TenantId",
                schema: "catalog",
                table: "TenantSettings",
                column: "TenantId");
        }
    }
}
