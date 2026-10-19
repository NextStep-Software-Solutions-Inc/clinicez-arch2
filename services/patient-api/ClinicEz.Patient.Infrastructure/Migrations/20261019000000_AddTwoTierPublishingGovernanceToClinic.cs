using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTwoTierPublishingGovernanceToClinic : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_workspace_eligible",
                table: "clinics",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_directory_published",
                table: "clinics",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<bool>(
                name: "is_public",
                table: "clinics",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean");

            // Backfill existing records: If already public, both tiers are considered satisfied
            migrationBuilder.Sql(
                "UPDATE clinics SET is_workspace_eligible = is_public, is_directory_published = is_public;");

            migrationBuilder.CreateIndex(
                name: "ix_clinics_is_public",
                table: "clinics",
                column: "is_public");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_clinics_is_public",
                table: "clinics");

            migrationBuilder.DropColumn(
                name: "is_workspace_eligible",
                table: "clinics");

            migrationBuilder.DropColumn(
                name: "is_directory_published",
                table: "clinics");
        }
    }
}
