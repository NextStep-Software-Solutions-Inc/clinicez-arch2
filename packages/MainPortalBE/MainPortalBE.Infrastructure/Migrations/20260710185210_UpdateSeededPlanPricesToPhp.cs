using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateSeededPlanPricesToPhp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                columns: new[] { "PriceAnnually", "PriceMonthly" },
                values: new object[] { 3900m, 4900m });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                columns: new[] { "PriceAnnually", "PriceMonthly" },
                values: new object[] { 9900m, 12900m });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                columns: new[] { "PriceAnnually", "PriceMonthly" },
                values: new object[] { 39m, 49m });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                columns: new[] { "PriceAnnually", "PriceMonthly" },
                values: new object[] { 99m, 129m });
        }
    }
}
