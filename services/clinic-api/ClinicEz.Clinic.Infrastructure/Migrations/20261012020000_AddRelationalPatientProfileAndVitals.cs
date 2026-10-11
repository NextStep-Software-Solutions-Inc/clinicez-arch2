using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRelationalPatientProfileAndVitals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Extend TriageVitals
            migrationBuilder.AddColumn<string>(
                name: "VisualAcuityLeft",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VisualAcuityRight",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "HeadCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MidUpperArmCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsMeasuredRecumbent",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "ZScoreWeightForAge",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ZScoreLengthForAge",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ZScoreWeightForLength",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthZScoreCategory",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthZScoreCode",
                schema: "clinic_dashboard",
                table: "TriageVitals",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            // 2. PatientSurgicalHistories Table
            migrationBuilder.CreateTable(
                name: "PatientSurgicalHistories",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProcedureName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    SurgeryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    HospitalName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Findings = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Complications = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientSurgicalHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientSurgicalHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientSurgicalHistories_PatientId_SurgeryDate",
                schema: "clinic_dashboard",
                table: "PatientSurgicalHistories",
                columns: new[] { "PatientId", "SurgeryDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientSurgicalHistories_TenantId_ClinicId_PatientId",
                schema: "clinic_dashboard",
                table: "PatientSurgicalHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            // 3. PatientSocialHistories Table
            migrationBuilder.CreateTable(
                name: "PatientSocialHistories",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsSmoker = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PacksPerDay = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CigarettesPerDay = table.Column<int>(type: "integer", nullable: true),
                    YearsSmoking = table.Column<int>(type: "integer", nullable: true),
                    SmokingPackYears = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    SmokingStoppedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsAlcoholDrinker = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    AlcoholDrinksPerWeek = table.Column<int>(type: "integer", nullable: true),
                    AlcoholBottlesPerDay = table.Column<int>(type: "integer", nullable: true),
                    AlcoholFrequency = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UsesIllicitDrugs = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    SubstanceUseHistory = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DrugTypes = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsSexuallyActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CoitarcheAge = table.Column<int>(type: "integer", nullable: true),
                    PhysicalActivityFrequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DietaryHabits = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientSocialHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientSocialHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientSocialHistories_TenantId_ClinicId_PatientId",
                schema: "clinic_dashboard",
                table: "PatientSocialHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" },
                unique: true);

            // 4. PatientReproductiveHistories Table
            migrationBuilder.CreateTable(
                name: "PatientReproductiveHistories",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsApplicable = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    MenarcheAge = table.Column<int>(type: "integer", nullable: true),
                    LastMenstrualPeriod = table.Column<DateOnly>(type: "date", nullable: true),
                    PeriodDurationDays = table.Column<int>(type: "integer", nullable: true),
                    CycleIntervalDays = table.Column<int>(type: "integer", nullable: true),
                    PadsPerDay = table.Column<int>(type: "integer", nullable: true),
                    IsMenopausal = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    MenopauseAge = table.Column<int>(type: "integer", nullable: true),
                    ContraceptiveMethod = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Gravidity = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Parity = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    TermBirths = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    PretermBirths = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Abortions = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    LivingChildren = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    DeliveryType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HadPreEclampsiaHypertension = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    ReceivedFamilyPlanningCounseling = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientReproductiveHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientReproductiveHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientReproductiveHistories_TenantId_ClinicId_PatientId",
                schema: "clinic_dashboard",
                table: "PatientReproductiveHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" },
                unique: true);

            // 5. NcdRiskAssessments Table
            migrationBuilder.CreateTable(
                name: "NcdRiskAssessments",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssessmentDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AssessedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssessedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    EatsProcessedFoodWeekly = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    ThreeServingsVegetablesDaily = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    TwoToThreeServingsFruitDaily = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PhysicalActivityAtLeast150MinsWeekly = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DiagnosedDiabetes = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "N"),
                    HasPolyphagia = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    HasPolydipsia = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    HasPolyuria = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DiabetesMedicationStatus = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    HasRaisedBloodGlucose = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    FastingBloodSugarMgDl = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    FastingBloodSugarMmolL = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    FastingBloodSugarDate = table.Column<DateOnly>(type: "date", nullable: true),
                    HasChestPain = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PainInCenterOfChestOrLeftArm = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PainWhenWalkingUphill = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    SlowsDownWhenPainOccurs = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PainRelievedWithin10Mins = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PainRelievedByNitrates = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PainRelievedWithin10MinsOrNitrates = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    SevereChestPainOver30Mins = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    TransientNeurologicalDeficits = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    HasRaisedBloodLipids = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    TotalCholesterolMgDl = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    TotalCholesterolDate = table.Column<DateOnly>(type: "date", nullable: true),
                    HasHistoryAnginaHeartAttack = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    HasHistoryStrokeOrTia = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    UrineKetonesPresent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    UrineKetonesValue = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UrineKetonesDate = table.Column<DateOnly>(type: "date", nullable: true),
                    UrineProteinPresent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    UrineProteinValue = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UrineProteinDate = table.Column<DateOnly>(type: "date", nullable: true),
                    RiskBand = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "BandA"),
                    CalculatedRiskScorePercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NcdRiskAssessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NcdRiskAssessments_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_NcdRiskAssessments_ClinicId_AssessmentDate",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                columns: new[] { "ClinicId", "AssessmentDate" });

            migrationBuilder.CreateIndex(
                name: "IX_NcdRiskAssessments_TenantId_ClinicId_PatientId",
                schema: "clinic_dashboard",
                table: "NcdRiskAssessments",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NcdRiskAssessments",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "PatientReproductiveHistories",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "PatientSocialHistories",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "PatientSurgicalHistories",
                schema: "clinic_dashboard");

            migrationBuilder.DropColumn(
                name: "HeadCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "IsMeasuredRecumbent",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "MidUpperArmCircumferenceCm",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "PhilHealthZScoreCategory",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "PhilHealthZScoreCode",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "VisualAcuityLeft",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "VisualAcuityRight",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "ZScoreLengthForAge",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "ZScoreWeightForAge",
                schema: "clinic_dashboard",
                table: "TriageVitals");

            migrationBuilder.DropColumn(
                name: "ZScoreWeightForLength",
                schema: "clinic_dashboard",
                table: "TriageVitals");
        }
    }
}
