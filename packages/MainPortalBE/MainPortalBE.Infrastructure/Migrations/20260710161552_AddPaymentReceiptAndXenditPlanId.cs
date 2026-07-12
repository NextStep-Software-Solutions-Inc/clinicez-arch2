using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentReceiptAndXenditPlanId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "XenditPlanId",
                schema: "main",
                table: "SubscriptionPlans",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PaymentReceipts",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    XenditInvoiceId = table.Column<string>(type: "text", nullable: false),
                    ReceiptNumber = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    PaidAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PlanSlug = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentReceipts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

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
                columns: new[] { "CreatedAt", "XenditPlanId" },
                values: new object[] { new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(3221), null });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                columns: new[] { "CreatedAt", "XenditPlanId" },
                values: new object[] { new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(3365), null });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("33333333-3333-3333-3333-333333333333"),
                columns: new[] { "CreatedAt", "XenditPlanId" },
                values: new object[] { new DateTime(2026, 7, 10, 16, 15, 51, 936, DateTimeKind.Utc).AddTicks(3368), null });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_TenantId",
                schema: "main",
                table: "PaymentReceipts",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_XenditInvoiceId",
                schema: "main",
                table: "PaymentReceipts",
                column: "XenditInvoiceId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentReceipts",
                schema: "main");

            migrationBuilder.DropColumn(
                name: "XenditPlanId",
                schema: "main",
                table: "SubscriptionPlans");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(886));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(894));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(896));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("11111111-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(898));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(900));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(901));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(902));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(904));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000001"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(905));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000002"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(906));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000003"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(907));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                keyColumn: "Id",
                keyValue: new Guid("33333333-0000-0000-0000-000000000004"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(909));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 182, DateTimeKind.Utc).AddTicks(2089));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 182, DateTimeKind.Utc).AddTicks(2414));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "SubscriptionPlans",
                keyColumn: "Id",
                keyValue: new Guid("33333333-3333-3333-3333-333333333333"),
                column: "CreatedAt",
                value: new DateTime(2026, 7, 10, 3, 25, 33, 182, DateTimeKind.Utc).AddTicks(2417));
        }
    }
}
