using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLabEntitlementVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EntitlementVersion",
                schema: "laboratory_dashboard",
                table: "LabSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EntitlementVersion",
                schema: "laboratory_dashboard",
                table: "LabSettings");
        }
    }
}
