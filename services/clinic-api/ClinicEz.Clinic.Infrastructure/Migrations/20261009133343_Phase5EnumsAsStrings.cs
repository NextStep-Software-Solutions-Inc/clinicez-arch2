using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Phase5EnumsAsStrings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Scopes",
                schema: "clinic_dashboard",
                table: "ShareImports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(50)");

            migrationBuilder.AlterColumn<string>(
                name: "ShareGrantScopes",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(50)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Scopes",
                schema: "clinic_dashboard",
                table: "ShareImports",
                type: "character varying(50)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "ShareGrantScopes",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "character varying(50)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);
        }
    }
}
