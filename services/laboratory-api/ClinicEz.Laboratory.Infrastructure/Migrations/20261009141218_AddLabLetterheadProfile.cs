using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLabLetterheadProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContactNumbers",
                schema: "laboratory_dashboard",
                table: "LabSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmailAndWeb",
                schema: "laboratory_dashboard",
                table: "LabSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthAccreditationNumber",
                schema: "laboratory_dashboard",
                table: "LabSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhysicalAddress",
                schema: "laboratory_dashboard",
                table: "LabSettings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContactNumbers",
                schema: "laboratory_dashboard",
                table: "LabSettings");

            migrationBuilder.DropColumn(
                name: "EmailAndWeb",
                schema: "laboratory_dashboard",
                table: "LabSettings");

            migrationBuilder.DropColumn(
                name: "PhilHealthAccreditationNumber",
                schema: "laboratory_dashboard",
                table: "LabSettings");

            migrationBuilder.DropColumn(
                name: "PhysicalAddress",
                schema: "laboratory_dashboard",
                table: "LabSettings");
        }
    }
}
