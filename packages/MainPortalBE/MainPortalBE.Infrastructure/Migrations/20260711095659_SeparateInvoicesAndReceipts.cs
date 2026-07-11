using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeparateInvoicesAndReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM main.\"PaymentReceipts\";");

            migrationBuilder.DropIndex(
                name: "IX_PaymentReceipts_XenditInvoiceId",
                schema: "main",
                table: "PaymentReceipts");

            migrationBuilder.DropColumn(
                name: "IsAnnual",
                schema: "main",
                table: "PaymentReceipts");

            migrationBuilder.DropColumn(
                name: "PlanSlug",
                schema: "main",
                table: "PaymentReceipts");

            migrationBuilder.RenameColumn(
                name: "XenditInvoiceId",
                schema: "main",
                table: "PaymentReceipts",
                newName: "PaymentMethod");

            migrationBuilder.RenameColumn(
                name: "Amount",
                schema: "main",
                table: "PaymentReceipts",
                newName: "AmountPaid");

            migrationBuilder.AlterColumn<DateTime>(
                name: "PaidAt",
                schema: "main",
                table: "PaymentReceipts",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified),
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "ExpiryDate",
                schema: "main",
                table: "PaymentReceipts",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified),
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldNullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InvoiceId",
                schema: "main",
                table: "PaymentReceipts",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "BillingInvoices",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    XenditInvoiceId = table.Column<string>(type: "text", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    PlanSlug = table.Column<string>(type: "text", nullable: false),
                    IsAnnual = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_BillingInvoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingInvoices_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_InvoiceId",
                schema: "main",
                table: "PaymentReceipts",
                column: "InvoiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingInvoices_TenantId",
                schema: "main",
                table: "BillingInvoices",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingInvoices_XenditInvoiceId",
                schema: "main",
                table: "BillingInvoices",
                column: "XenditInvoiceId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_PaymentReceipts_BillingInvoices_InvoiceId",
                schema: "main",
                table: "PaymentReceipts",
                column: "InvoiceId",
                principalSchema: "main",
                principalTable: "BillingInvoices",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PaymentReceipts_BillingInvoices_InvoiceId",
                schema: "main",
                table: "PaymentReceipts");

            migrationBuilder.DropTable(
                name: "BillingInvoices",
                schema: "main");

            migrationBuilder.DropIndex(
                name: "IX_PaymentReceipts_InvoiceId",
                schema: "main",
                table: "PaymentReceipts");

            migrationBuilder.DropColumn(
                name: "InvoiceId",
                schema: "main",
                table: "PaymentReceipts");

            migrationBuilder.RenameColumn(
                name: "PaymentMethod",
                schema: "main",
                table: "PaymentReceipts",
                newName: "XenditInvoiceId");

            migrationBuilder.RenameColumn(
                name: "AmountPaid",
                schema: "main",
                table: "PaymentReceipts",
                newName: "Amount");

            migrationBuilder.AlterColumn<DateTime>(
                name: "PaidAt",
                schema: "main",
                table: "PaymentReceipts",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone");

            migrationBuilder.AlterColumn<DateTime>(
                name: "ExpiryDate",
                schema: "main",
                table: "PaymentReceipts",
                type: "timestamp with time zone",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone");

            migrationBuilder.AddColumn<bool>(
                name: "IsAnnual",
                schema: "main",
                table: "PaymentReceipts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PlanSlug",
                schema: "main",
                table: "PaymentReceipts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_XenditInvoiceId",
                schema: "main",
                table: "PaymentReceipts",
                column: "XenditInvoiceId",
                unique: true);
        }
    }
}
