using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAnthropometricsAndGrowthZScores : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "PhilHealthZScoreCode",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                newName: "GrowthZScoreCode");

            migrationBuilder.RenameColumn(
                name: "PhilHealthZScoreCategory",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                newName: "GrowthZScoreCategory");

            migrationBuilder.AddColumn<decimal>(
                name: "BodyLengthCm",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "HipCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LimbsCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SkinfoldThicknessMm",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WaistCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BodyLengthCm",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "HipCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "LimbsCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "SkinfoldThicknessMm",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "WaistCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.RenameColumn(
                name: "GrowthZScoreCode",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                newName: "PhilHealthZScoreCode");

            migrationBuilder.RenameColumn(
                name: "GrowthZScoreCategory",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                newName: "PhilHealthZScoreCategory");
        }
    }
}
