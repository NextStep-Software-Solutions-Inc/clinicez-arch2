using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MakeNcdRiskAssessmentFieldsNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var booleanCols = new[]
            {
                "EatsProcessedFoodWeekly",
                "ThreeServingsVegetablesDaily",
                "TwoToThreeServingsFruitDaily",
                "PhysicalActivityAtLeast150MinsWeekly",
                "HasPolyphagia",
                "HasPolydipsia",
                "HasPolyuria",
                "HasRaisedBloodGlucose",
                "HasChestPain",
                "PainInCenterOfChestOrLeftArm",
                "PainWhenWalkingUphill",
                "SlowsDownWhenPainOccurs",
                "PainRelievedWithin10Mins",
                "PainRelievedByNitrates",
                "PainRelievedWithin10MinsOrNitrates",
                "SevereChestPainOver30Mins",
                "TransientNeurologicalDeficits",
                "HasRaisedBloodLipids",
                "HasHistoryAnginaHeartAttack",
                "HasHistoryStrokeOrTia",
                "UrineKetonesPresent",
                "UrineProteinPresent"
            };

            foreach (var col in booleanCols)
            {
                migrationBuilder.AlterColumn<bool>(
                    name: col,
                    schema: "clinic_dashboard",
                    table: "NcdRiskAssessments",
                    type: "boolean",
                    nullable: true,
                    oldClrType: typeof(bool),
                    oldType: "boolean");
            }

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
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            var booleanCols = new[]
            {
                "EatsProcessedFoodWeekly",
                "ThreeServingsVegetablesDaily",
                "TwoToThreeServingsFruitDaily",
                "PhysicalActivityAtLeast150MinsWeekly",
                "HasPolyphagia",
                "HasPolydipsia",
                "HasPolyuria",
                "HasRaisedBloodGlucose",
                "HasChestPain",
                "PainInCenterOfChestOrLeftArm",
                "PainWhenWalkingUphill",
                "SlowsDownWhenPainOccurs",
                "PainRelievedWithin10Mins",
                "PainRelievedByNitrates",
                "PainRelievedWithin10MinsOrNitrates",
                "SevereChestPainOver30Mins",
                "TransientNeurologicalDeficits",
                "HasRaisedBloodLipids",
                "HasHistoryAnginaHeartAttack",
                "HasHistoryStrokeOrTia",
                "UrineKetonesPresent",
                "UrineProteinPresent"
            };

            foreach (var col in booleanCols)
            {
                migrationBuilder.AlterColumn<bool>(
                    name: col,
                    schema: "clinic_dashboard",
                    table: "NcdRiskAssessments",
                    type: "boolean",
                    nullable: false,
                    defaultValue: false,
                    oldClrType: typeof(bool),
                    oldType: "boolean",
                    oldNullable: true);
            }

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
