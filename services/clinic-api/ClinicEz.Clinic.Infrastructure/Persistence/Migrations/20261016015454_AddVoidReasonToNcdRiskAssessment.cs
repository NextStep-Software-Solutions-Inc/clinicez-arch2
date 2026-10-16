using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddVoidReasonToNcdRiskAssessment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "VoidReason",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "VoidReason",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments");
        }
    }
}
