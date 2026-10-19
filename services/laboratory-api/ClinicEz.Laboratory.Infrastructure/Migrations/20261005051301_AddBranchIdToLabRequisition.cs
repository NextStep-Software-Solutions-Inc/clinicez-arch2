using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBranchIdToLabRequisition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BranchId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_BranchId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                column: "BranchId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_LabRequisitions_BranchId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");
        }
    }
}
