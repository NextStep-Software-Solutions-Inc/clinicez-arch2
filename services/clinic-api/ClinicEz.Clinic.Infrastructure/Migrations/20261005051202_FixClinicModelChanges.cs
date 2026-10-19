using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixClinicModelChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPhilHealthFormulary",
                schema: "clinic_dashboard",
                table: "ServiceItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthCode",
                schema: "clinic_dashboard",
                table: "ServiceItems",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthDescription",
                schema: "clinic_dashboard",
                table: "ServiceItems",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPhilHealthFormulary",
                schema: "clinic_dashboard",
                table: "ServiceItems");

            migrationBuilder.DropColumn(
                name: "PhilHealthCode",
                schema: "clinic_dashboard",
                table: "ServiceItems");

            migrationBuilder.DropColumn(
                name: "PhilHealthDescription",
                schema: "clinic_dashboard",
                table: "ServiceItems");
        }
    }
}
