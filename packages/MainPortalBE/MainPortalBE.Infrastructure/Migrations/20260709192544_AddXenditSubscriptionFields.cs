using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddXenditSubscriptionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SubscriptionId",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionPlanId",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionStatus",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "XenditCustomerId",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SubscriptionId",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionPlanId",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionStatus",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "XenditCustomerId",
                schema: "main",
                table: "Tenants");
        }
    }
}
