using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantBillingDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BusinessType",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Country",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhoneNumber",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PostalCode",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Province",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StreetLine1",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StreetLine2",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TradingName",
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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BusinessType",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "City",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Country",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "PhoneNumber",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "PostalCode",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Province",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "StreetLine1",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "StreetLine2",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "TradingName",
                schema: "main",
                table: "Tenants");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7518));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7521));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7523));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7524));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7525));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7526));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7528));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7529));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7530));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7531));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7533));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(7534));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(3221));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(3365));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("33333333-3333-3333-3333-333333333333"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(3368));
        }
    }
}
