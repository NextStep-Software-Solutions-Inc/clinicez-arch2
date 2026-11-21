using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPsgcLocationsAndStructuredAddress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "barangay_name",
                table: "patient_addresses",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "barangay_psgc",
                table: "patient_addresses",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "city_municipality_name",
                table: "patient_addresses",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "city_municipality_psgc",
                table: "patient_addresses",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_same_as_permanent",
                table: "patient_addresses",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "province_name",
                table: "patient_addresses",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "province_psgc",
                table: "patient_addresses",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "region_name",
                table: "patient_addresses",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "region_psgc",
                table: "patient_addresses",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "street_address",
                table: "patient_addresses",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "barangay_name",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "barangay_psgc",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "city_municipality_name",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "city_municipality_psgc",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "is_same_as_permanent",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "province_name",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "province_psgc",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "region_name",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "region_psgc",
                table: "patient_addresses");

            migrationBuilder.DropColumn(
                name: "street_address",
                table: "patient_addresses");
        }
    }
}
