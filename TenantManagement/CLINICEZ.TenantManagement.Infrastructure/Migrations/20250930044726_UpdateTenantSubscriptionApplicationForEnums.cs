using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERP_EZ.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateTenantSubscriptionApplicationForEnums : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Explicit cast for Status
            migrationBuilder.Sql(
                "ALTER TABLE catalog.\"TenantSubscriptions\" " +
                "ALTER COLUMN \"Status\" TYPE integer USING \"Status\"::integer;");

            // Explicit cast for Plan
            migrationBuilder.Sql(
                "ALTER TABLE catalog.\"TenantSubscriptions\" " +
                "ALTER COLUMN \"Plan\" TYPE integer USING \"Plan\"::integer;");

            // Explicit cast for BillingCycle (nullable)
            migrationBuilder.Sql(
                "ALTER TABLE catalog.\"TenantSubscriptions\" " +
                "ALTER COLUMN \"BillingCycle\" TYPE integer USING NULLIF(\"BillingCycle\", '')::integer;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Status",
                schema: "catalog",
                table: "TenantSubscriptions",
                type: "text",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<string>(
                name: "Plan",
                schema: "catalog",
                table: "TenantSubscriptions",
                type: "text",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<string>(
                name: "BillingCycle",
                schema: "catalog",
                table: "TenantSubscriptions",
                type: "text",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);
        }
    }
}
