using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERP_EZ.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantMemberChangeIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantMember_TenantId",
                schema: "catalog",
                table: "TenantMember");

            migrationBuilder.DropIndex(
                name: "IX_TenantMember_UserId",
                schema: "catalog",
                table: "TenantMember");

            migrationBuilder.CreateIndex(
                name: "IX_TenantMember_TenantId_UserId",
                schema: "catalog",
                table: "TenantMember",
                columns: new[] { "TenantId", "UserId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantMember_TenantId_UserId",
                schema: "catalog",
                table: "TenantMember");

            migrationBuilder.CreateIndex(
                name: "IX_TenantMember_TenantId",
                schema: "catalog",
                table: "TenantMember",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_TenantMember_UserId",
                schema: "catalog",
                table: "TenantMember",
                column: "UserId",
                unique: true);
        }
    }
}
