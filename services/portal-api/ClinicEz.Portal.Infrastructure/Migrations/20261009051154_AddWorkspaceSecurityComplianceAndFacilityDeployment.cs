using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaceSecurityComplianceAndFacilityDeployment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AllowedInviteDomains",
                schema: "main",
                table: "WorkspaceSettings",
                type: "character varying(1024)",
                maxLength: 1024,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DpoEmail",
                schema: "main",
                table: "WorkspaceSettings",
                type: "character varying(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DpoName",
                schema: "main",
                table: "WorkspaceSettings",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "IdleTimeoutMinutes",
                schema: "main",
                table: "WorkspaceSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "PrivacyNoticeUrl",
                schema: "main",
                table: "WorkspaceSettings",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequireMfa",
                schema: "main",
                table: "WorkspaceSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ConsoleBaseUrl",
                schema: "main",
                table: "Facilities",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeploymentMode",
                schema: "main",
                table: "Facilities",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "SharedCloud");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AllowedInviteDomains",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "DpoEmail",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "DpoName",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "IdleTimeoutMinutes",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "PrivacyNoticeUrl",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "RequireMfa",
                schema: "main",
                table: "WorkspaceSettings");

            migrationBuilder.DropColumn(
                name: "ConsoleBaseUrl",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "DeploymentMode",
                schema: "main",
                table: "Facilities");
        }
    }
}
