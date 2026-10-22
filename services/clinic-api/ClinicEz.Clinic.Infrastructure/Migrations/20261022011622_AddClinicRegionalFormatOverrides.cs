using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicRegionalFormatOverrides : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DateFormat",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TimeFormat",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TimeZoneId",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DateFormat",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "TimeFormat",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "TimeZoneId",
                schema: "public",
                table: "ClinicSettings");
        }
    }
}
