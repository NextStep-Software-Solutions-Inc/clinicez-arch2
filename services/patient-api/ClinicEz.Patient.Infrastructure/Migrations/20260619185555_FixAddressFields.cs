using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixAddressFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "street",
                table: "patient_addresses",
                newName: "house_street");

            migrationBuilder.RenameColumn(
                name: "city",
                table: "patient_addresses",
                newName: "region");

            migrationBuilder.AddColumn<string>(
                name: "city_municipality",
                table: "patient_addresses",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "city_municipality",
                table: "patient_addresses");

            migrationBuilder.RenameColumn(
                name: "region",
                table: "patient_addresses",
                newName: "city");

            migrationBuilder.RenameColumn(
                name: "house_street",
                table: "patient_addresses",
                newName: "street");
        }
    }
}
