using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERP_EZ.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixColumnTenantSettingAndTenant : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantSettings_Name_TenantId",
                schema: "catalog",
                table: "TenantSettings");

            migrationBuilder.DropIndex(
                name: "IX_Tenants_BillingContactEmail_Name",
                schema: "catalog",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Name",
                schema: "catalog",
                table: "TenantSettings");

            migrationBuilder.DropColumn(
                name: "BillingContactEmail",
                schema: "catalog",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "OnPremise",
                schema: "catalog",
                table: "Tenants");

            migrationBuilder.AlterColumn<decimal>(
                name: "Amount",
                schema: "catalog",
                table: "TenantSubscriptions",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<bool>(
                name: "OnPremise",
                schema: "catalog",
                table: "TenantSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                schema: "catalog",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_Name",
                schema: "catalog",
                table: "Tenants",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tenants_Name",
                schema: "catalog",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "OnPremise",
                schema: "catalog",
                table: "TenantSettings");

            migrationBuilder.DropColumn(
                name: "Description",
                schema: "catalog",
                table: "Tenants");

            migrationBuilder.AlterColumn<int>(
                name: "Amount",
                schema: "catalog",
                table: "TenantSubscriptions",
                type: "integer",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric");

            migrationBuilder.AddColumn<string>(
                name: "Name",
                schema: "catalog",
                table: "TenantSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "BillingContactEmail",
                schema: "catalog",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "OnPremise",
                schema: "catalog",
                table: "Tenants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_TenantSettings_Name_TenantId",
                schema: "catalog",
                table: "TenantSettings",
                columns: new[] { "Name", "TenantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_BillingContactEmail_Name",
                schema: "catalog",
                table: "Tenants",
                columns: new[] { "BillingContactEmail", "Name" },
                unique: true);
        }
    }
}
