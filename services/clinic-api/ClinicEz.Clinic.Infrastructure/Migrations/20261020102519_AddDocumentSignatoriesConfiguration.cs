using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentSignatoriesConfiguration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultApproverName",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultApproverTitle",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DocumentSignatoriesJson",
                schema: "public",
                table: "ClinicSettings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultApproverName",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "DefaultApproverTitle",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "DocumentSignatoriesJson",
                schema: "public",
                table: "ClinicSettings");
        }
    }
}
