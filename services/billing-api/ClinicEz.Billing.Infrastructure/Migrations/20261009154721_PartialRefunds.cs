using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Billing.Infrastructure.Migrations
{
    /// <summary>
    /// A refund becomes a numbered header (<c>RF-000001</c> per counter facility) with one line per payment allocation it returned
    /// money against, and allocations remember how much of them was refunded. Existing refunds were always full refunds of what was
    /// then held on the invoice: each is converted into lines covering the allocations paid before it and not covered by an earlier
    /// refund, in the method the old refund recorded, so shift cash totals and reports keep their figures.
    /// </summary>
    public partial class PartialRefunds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Sequence",
                schema: "billing",
                table: "refunds",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Number",
                schema: "billing",
                table: "refunds",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RefundedAmount",
                schema: "billing",
                table: "payment_allocations",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "refund_lines",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RefundId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentAllocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_refund_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_refund_lines_refunds_RefundId",
                        column: x => x.RefundId,
                        principalSchema: "billing",
                        principalTable: "refunds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Number the existing refunds per counter facility in the order they happened, and start the RF sequence after them.
            migrationBuilder.Sql("""
                UPDATE billing.refunds r
                SET "Sequence" = n.seq,
                    "Number" = 'RF-' || lpad(n.seq::text, 6, '0')
                FROM (
                    SELECT "Id", row_number() OVER (PARTITION BY "TenantId", "FacilityId" ORDER BY "RefundedAtUtc", "Id") AS seq
                    FROM billing.refunds
                ) n
                WHERE r."Id" = n."Id";
                """);

            migrationBuilder.Sql("""
                INSERT INTO billing.document_sequences ("Id", "TenantId", "FacilityId", "Kind", "LastValue", "Version")
                SELECT gen_random_uuid(), "TenantId", "FacilityId", 'RF', MAX("Sequence"), 0
                FROM billing.refunds
                GROUP BY "TenantId", "FacilityId";
                """);

            // An allocation was returned by the first refund of its invoice made at or after the payment.
            migrationBuilder.Sql("""
                INSERT INTO billing.refund_lines ("Id", "TenantId", "RefundId", "PaymentId", "PaymentAllocationId", "Method", "Amount")
                SELECT gen_random_uuid(), a."TenantId", c."RefundId", a."PaymentId", a."Id", c."Method", a."Amount"
                FROM billing.payment_allocations a
                JOIN billing.payments p ON p."Id" = a."PaymentId"
                CROSS JOIN LATERAL (
                    SELECT r."Id" AS "RefundId", r."Method"
                    FROM billing.refunds r
                    WHERE r."TenantId" = a."TenantId" AND r."InvoiceId" = a."InvoiceId" AND r."RefundedAtUtc" >= p."PaidAtUtc"
                    ORDER BY r."RefundedAtUtc", r."Id"
                    LIMIT 1
                ) c;
                """);

            migrationBuilder.Sql("""
                UPDATE billing.payment_allocations a
                SET "RefundedAmount" = a."Amount"
                WHERE EXISTS (SELECT 1 FROM billing.refund_lines l WHERE l."PaymentAllocationId" = a."Id");
                """);

            migrationBuilder.DropColumn(
                name: "Method",
                schema: "billing",
                table: "refunds");

            migrationBuilder.AlterColumn<string>(
                name: "Number",
                schema: "billing",
                table: "refunds",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_refunds_TenantId_FacilityId_Number",
                schema: "billing",
                table: "refunds",
                columns: new[] { "TenantId", "FacilityId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_refund_lines_PaymentAllocationId",
                schema: "billing",
                table: "refund_lines",
                column: "PaymentAllocationId");

            migrationBuilder.CreateIndex(
                name: "IX_refund_lines_RefundId",
                schema: "billing",
                table: "refund_lines",
                column: "RefundId");
        }

        /// <summary>
        /// The old model only knows full refunds: each refund keeps the method of its first line, and a partly refunded invoice goes
        /// back to PartiallyPaid (what is still held is below its total), so it is collectable again rather than silently settled.
        /// </summary>
        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Method",
                schema: "billing",
                table: "refunds",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Cash");

            migrationBuilder.Sql("""
                UPDATE billing.refunds r
                SET "Method" = l."Method"
                FROM (
                    SELECT DISTINCT ON ("RefundId") "RefundId", "Method"
                    FROM billing.refund_lines
                    ORDER BY "RefundId", "Id"
                ) l
                WHERE r."Id" = l."RefundId";
                """);

            migrationBuilder.Sql("""UPDATE billing.invoices SET "Status" = 'PartiallyPaid' WHERE "Status" = 'PartiallyRefunded';""");

            migrationBuilder.Sql("""DELETE FROM billing.document_sequences WHERE "Kind" = 'RF';""");

            migrationBuilder.DropTable(
                name: "refund_lines",
                schema: "billing");

            migrationBuilder.DropIndex(
                name: "IX_refunds_TenantId_FacilityId_Number",
                schema: "billing",
                table: "refunds");

            migrationBuilder.DropColumn(
                name: "Number",
                schema: "billing",
                table: "refunds");

            migrationBuilder.DropColumn(
                name: "Sequence",
                schema: "billing",
                table: "refunds");

            migrationBuilder.DropColumn(
                name: "RefundedAmount",
                schema: "billing",
                table: "payment_allocations");
        }
    }
}
