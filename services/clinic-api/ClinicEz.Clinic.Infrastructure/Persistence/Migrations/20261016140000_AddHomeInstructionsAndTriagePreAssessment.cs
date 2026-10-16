using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddHomeInstructionsAndTriagePreAssessment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HomeInstructions",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreAssessmentNotes",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreAssessmentRemarks",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TriageAcuityReason",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HomeInstructions",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "PreAssessmentNotes",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "PreAssessmentRemarks",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "TriageAcuityReason",
                schema: "clinic_dashboard",
                table: "TriageVitals");
        }
    }
}
