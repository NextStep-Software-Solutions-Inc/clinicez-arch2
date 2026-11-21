using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemoveLegacyPatientGender : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Gender",
                schema: "public",
                table: "Patients");

            migrationBuilder.RenameColumn(
                name: "PrincipalGender",
                schema: "public",
                table: "PatientPhilHealthMemberships",
                newName: "PrincipalSex");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "PrincipalSex",
                schema: "public",
                table: "PatientPhilHealthMemberships",
                newName: "PrincipalGender");

            migrationBuilder.AddColumn<string>(
                name: "Gender",
                schema: "public",
                table: "Patients",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");
        }
    }
}
