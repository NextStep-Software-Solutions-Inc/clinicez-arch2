using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddHomeInstructionsAndTriagePreAssessment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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

            migrationBuilder.AlterColumn<bool>(
                name: "UrineProteinPresent",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "UrineKetonesPresent",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "TwoToThreeServingsFruitDaily",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "TransientNeurologicalDeficits",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "ThreeServingsVegetablesDaily",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "SlowsDownWhenPainOccurs",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "SevereChestPainOver30Mins",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "PhysicalActivityAtLeast150MinsWeekly",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "PainWhenWalkingUphill",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "PainRelievedWithin10MinsOrNitrates",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "PainRelievedWithin10Mins",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "PainRelievedByNitrates",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "PainInCenterOfChestOrLeftArm",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "HasRaisedBloodLipids",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "HasRaisedBloodGlucose",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "HasPolyuria",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "HasPolyphagia",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "HasPolydipsia",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "HasHistoryStrokeOrTia",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "HasHistoryAnginaHeartAttack",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "HasChestPain",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<bool>(
                name: "EatsProcessedFoodWeekly",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<string>(
                name: "DiagnosedDiabetes",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(10)",
                oldMaxLength: 10,
                oldDefaultValue: "N");

            migrationBuilder.AddColumn<string>(
                name: "HomeInstructions",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
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

            migrationBuilder.DropColumn(
                name: "HomeInstructions",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.AlterColumn<bool>(
                name: "UrineProteinPresent",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "UrineKetonesPresent",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "TwoToThreeServingsFruitDaily",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "TransientNeurologicalDeficits",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "ThreeServingsVegetablesDaily",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "SlowsDownWhenPainOccurs",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "SevereChestPainOver30Mins",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "PhysicalActivityAtLeast150MinsWeekly",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "PainWhenWalkingUphill",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "PainRelievedWithin10MinsOrNitrates",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "PainRelievedWithin10Mins",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "PainRelievedByNitrates",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "PainInCenterOfChestOrLeftArm",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HasRaisedBloodLipids",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HasRaisedBloodGlucose",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HasPolyuria",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HasPolyphagia",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HasPolydipsia",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HasHistoryStrokeOrTia",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HasHistoryAnginaHeartAttack",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HasChestPain",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "EatsProcessedFoodWeekly",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "DiagnosedDiabetes",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "N",
                oldClrType: typeof(string),
                oldType: "character varying(10)",
                oldMaxLength: 10,
                oldNullable: true);
        }
    }
}
