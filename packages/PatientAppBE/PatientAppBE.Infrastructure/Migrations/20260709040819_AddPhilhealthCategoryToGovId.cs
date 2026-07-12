using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PatientAppBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPhilhealthCategoryToGovId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "philhealth_category",
                table: "patient_government_ids",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "philhealth_category",
                table: "patient_government_ids");
        }
    }
}
