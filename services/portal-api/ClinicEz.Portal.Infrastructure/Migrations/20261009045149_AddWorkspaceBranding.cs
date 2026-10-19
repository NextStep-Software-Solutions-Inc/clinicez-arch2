using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaceBranding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccentColorHex",
                schema: "main",
                table: "WorkspaceSettings",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BrandName",
                schema: "main",
                table: "WorkspaceSettings",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoUrl",
                schema: "main",
                table: "WorkspaceSettings",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "ProfileVersion",
                schema: "main",
                table: "WorkspaceSettings",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AccentColorHex",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "BrandName",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "LogoUrl",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "ProfileVersion",
                schema: "main",
                table: "WorkspaceSettings");
        }
    }
}
