using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveTurnstileBotProtectionSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TurnstileEnabled",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "TurnstileSiteKey",
                schema: "public",
                table: "ClinicSettings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "TurnstileEnabled",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "TurnstileSiteKey",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);
        }
    }
}
