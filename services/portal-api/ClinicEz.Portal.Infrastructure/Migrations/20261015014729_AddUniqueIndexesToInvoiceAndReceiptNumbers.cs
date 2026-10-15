using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueIndexesToInvoiceAndReceiptNumbers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_ReceiptNumber",
                schema: "main",
                table: "PaymentReceipts",
                column: "ReceiptNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingInvoices_InvoiceNumber",
                schema: "main",
                table: "BillingInvoices",
                column: "InvoiceNumber",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PaymentReceipts_ReceiptNumber",
                schema: "main",
                table: "PaymentReceipts");

            migrationBuilder.DropIndex(
                name: "IX_BillingInvoices_InvoiceNumber",
                schema: "main",
                table: "BillingInvoices");
        }
    }
}
