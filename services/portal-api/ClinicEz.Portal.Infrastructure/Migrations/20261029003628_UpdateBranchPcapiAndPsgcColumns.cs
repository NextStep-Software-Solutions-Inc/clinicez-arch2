using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateBranchPcapiAndPsgcColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PhilHealthEncryptedPassword",
                schema: "public",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "PhilHealthEncryptedUsername",
                schema: "public",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "PhilHealthKonsultaEndpoint",
                schema: "public",
                table: "Branches");

            migrationBuilder.AddColumn<string>(
                name: "BarangayPsgc",
                schema: "public",
                table: "Facilities",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CityMunicipalityPsgc",
                schema: "public",
                table: "Facilities",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProvincePsgc",
                schema: "public",
                table: "Facilities",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegionPsgc",
                schema: "public",
                table: "Facilities",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PhilHealthSoftwareCertificateId",
                schema: "public",
                table: "Branches",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PhilHealthPmccNumber",
                schema: "public",
                table: "Branches",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PhilHealthEncryptedCipherKey",
                schema: "public",
                table: "Branches",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PhilHealthAccreditationNumber",
                schema: "public",
                table: "Branches",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BarangayPsgc",
                schema: "public",
                table: "Branches",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CityMunicipalityPsgc",
                schema: "public",
                table: "Branches",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthBaseUrl",
                schema: "public",
                table: "Branches",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthEncryptedSecretKey",
                schema: "public",
                table: "Branches",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProvincePsgc",
                schema: "public",
                table: "Branches",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegionPsgc",
                schema: "public",
                table: "Branches",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BarangayPsgc",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "CityMunicipalityPsgc",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "ProvincePsgc",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "RegionPsgc",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "BarangayPsgc",
                schema: "public",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "CityMunicipalityPsgc",
                schema: "public",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "PhilHealthBaseUrl",
                schema: "public",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "PhilHealthEncryptedSecretKey",
                schema: "public",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "ProvincePsgc",
                schema: "public",
                table: "Branches");

            migrationBuilder.DropColumn(
                name: "RegionPsgc",
                schema: "public",
                table: "Branches");

            migrationBuilder.AlterColumn<string>(
                name: "PhilHealthSoftwareCertificateId",
                schema: "public",
                table: "Branches",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PhilHealthPmccNumber",
                schema: "public",
                table: "Branches",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PhilHealthEncryptedCipherKey",
                schema: "public",
                table: "Branches",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(512)",
                oldMaxLength: 512,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "PhilHealthAccreditationNumber",
                schema: "public",
                table: "Branches",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthEncryptedPassword",
                schema: "public",
                table: "Branches",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthEncryptedUsername",
                schema: "public",
                table: "Branches",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthKonsultaEndpoint",
                schema: "public",
                table: "Branches",
                type: "text",
                nullable: true);
        }
    }
}
