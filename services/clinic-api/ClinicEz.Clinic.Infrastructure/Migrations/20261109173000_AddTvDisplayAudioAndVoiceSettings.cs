using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTvDisplayAudioAndVoiceSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TvDisplaySoundTheme",
                schema: "public",
                table: "Settings",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "classicChime");

            migrationBuilder.AddColumn<bool>(
                name: "TvDisplayVoiceEnabled",
                schema: "public",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TvDisplaySoundTheme",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "TvDisplayVoiceEnabled",
                schema: "public",
                table: "Settings");
        }
    }
}
