using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddHealthScreeningsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AllowNurseMidwifeYakapFpeFacilitator",
                schema: "public",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "DefaultHealthScreeningServiceCode",
                schema: "public",
                table: "Settings",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DefaultHealthScreeningServiceItemId",
                schema: "public",
                table: "Settings",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "HealthScreenings",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    YakapEnlistmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientVitalsId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientPhysicalExamId = table.Column<Guid>(type: "uuid", nullable: true),
                    NcdRiskAssessmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ServiceItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    ScreeningType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    WorkflowMode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Disposition = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ScreeningDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ScreenedByNurseId = table.Column<Guid>(type: "uuid", nullable: true),
                    ScreenedByNurseName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    NurseCompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExaminedByDoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExaminedByDoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    NurseScreeningNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ClinicalImpression = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    PreventiveCounselingNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    RecommendedFollowUpDate = table.Column<DateOnly>(type: "date", nullable: true),
                    AdultsRoutineScreeningCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PediatricRoutineScreeningCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PrenatalScreeningServicesCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BreastCancerScreeningCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CervicalCancerScreeningCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ColorectalCancerScreeningCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ProstateCancerScreeningCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthAtc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsWalkedIn = table.Column<bool>(type: "boolean", nullable: false),
                    ServiceDeliveryMethod = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    FpeClassificationType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ProfilingTransNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HealthScreenings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HealthScreenings_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_HealthScreenings_NcdRiskAssessments_NcdRiskAssessmentId",
                        column: x => x.NcdRiskAssessmentId,
                        principalSchema: "public",
                        principalTable: "NcdRiskAssessments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_HealthScreenings_PatientPhysicalExams_PatientPhysicalExamId",
                        column: x => x.PatientPhysicalExamId,
                        principalSchema: "public",
                        principalTable: "PatientPhysicalExams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_HealthScreenings_PatientVitals_PatientVitalsId",
                        column: x => x.PatientVitalsId,
                        principalSchema: "public",
                        principalTable: "PatientVitals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_HealthScreenings_PatientYakapEnlistments_YakapEnlistmentId",
                        column: x => x.YakapEnlistmentId,
                        principalSchema: "public",
                        principalTable: "PatientYakapEnlistments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_HealthScreenings_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HealthScreenings_QueueItems_QueueItemId",
                        column: x => x.QueueItemId,
                        principalSchema: "public",
                        principalTable: "QueueItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HealthScreenings_ServiceItems_ServiceItemId",
                        column: x => x.ServiceItemId,
                        principalSchema: "public",
                        principalTable: "ServiceItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_ClinicId_PatientId_ScreeningDateUtc",
                schema: "public",
                table: "HealthScreenings",
                columns: new[] { "ClinicId", "PatientId", "ScreeningDateUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_ClinicId_QueueItemId",
                schema: "public",
                table: "HealthScreenings",
                columns: new[] { "ClinicId", "QueueItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_ClinicId_Status",
                schema: "public",
                table: "HealthScreenings",
                columns: new[] { "ClinicId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_ConsultationEncounterId",
                schema: "public",
                table: "HealthScreenings",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_NcdRiskAssessmentId",
                schema: "public",
                table: "HealthScreenings",
                column: "NcdRiskAssessmentId");

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_PatientId",
                schema: "public",
                table: "HealthScreenings",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_PatientPhysicalExamId",
                schema: "public",
                table: "HealthScreenings",
                column: "PatientPhysicalExamId");

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_PatientVitalsId",
                schema: "public",
                table: "HealthScreenings",
                column: "PatientVitalsId");

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_QueueItemId",
                schema: "public",
                table: "HealthScreenings",
                column: "QueueItemId");

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_ServiceItemId",
                schema: "public",
                table: "HealthScreenings",
                column: "ServiceItemId");

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "HealthScreenings",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_YakapEnlistmentId",
                schema: "public",
                table: "HealthScreenings",
                column: "YakapEnlistmentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HealthScreenings",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "AllowNurseMidwifeYakapFpeFacilitator",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "DefaultHealthScreeningServiceCode",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "DefaultHealthScreeningServiceItemId",
                schema: "public",
                table: "Settings");
        }
    }
}
