using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLabRefundedAmount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "RefundedAmount",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RefundedAmount",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");
        }
    }
}
