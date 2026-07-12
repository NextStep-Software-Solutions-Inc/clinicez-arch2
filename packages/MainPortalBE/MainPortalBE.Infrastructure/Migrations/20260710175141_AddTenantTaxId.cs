using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantTaxId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TaxId",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9560));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9563));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9565));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9566));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9568));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9569));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9570));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9571));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9573));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9574));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9575));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(9576));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(4376));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(4495));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("33333333-3333-3333-3333-333333333333"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 51, 40, 817, DateTimeKind.Utc).AddTicks(4497));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TaxId",
                schema: "main",
                table: "Tenants");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7906));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7908));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7910));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7911));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7912));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7913));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7914));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7916));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7917));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7918));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7919));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(7920));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(3978));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(4089));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("33333333-3333-3333-3333-333333333333"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 17, 14, 19, 31, DateTimeKind.Utc).AddTicks(4091));
        }
    }
}
