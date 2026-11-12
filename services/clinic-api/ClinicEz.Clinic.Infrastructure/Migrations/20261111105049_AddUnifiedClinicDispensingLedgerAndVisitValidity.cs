using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUnifiedClinicDispensingLedgerAndVisitValidity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "QueueItemId",
                schema: "public",
                table: "ReferralLetters",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ClinicDispensedAt",
                schema: "public",
                table: "Prescriptions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClinicDispensedBy",
                schema: "public",
                table: "Prescriptions",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ClinicDispensedQuantity",
                schema: "public",
                table: "Prescriptions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsClinicDispensed",
                schema: "public",
                table: "Prescriptions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "RosCategory",
                schema: "public",
                table: "Prescriptions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HomeInstructions",
                schema: "public",
                table: "PatientVitals",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RosCategory",
                schema: "public",
                table: "PatientVitals",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QueueItemId",
                schema: "public",
                table: "MedicalCertificates",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsSigned",
                schema: "public",
                table: "LabOrders",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QueueItemId",
                schema: "public",
                table: "LabOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DraftOrdersJson",
                schema: "public",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RosCategory",
                schema: "public",
                table: "Consultations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ClinicDispensingLogs",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    PrescriptionItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientVitalsId = table.Column<Guid>(type: "uuid", nullable: true),
                    ItemName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ItemCategory = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DosageOrSpec = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FormOrUnit = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    QuantityDispensed = table.Column<int>(type: "integer", nullable: false),
                    DirectionsOrInstructions = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    RosCategory = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsConsultationValidated = table.Column<bool>(type: "boolean", nullable: false),
                    DispensedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    DispensedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DispensedByRole = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DispensedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RequiresDoctorReview = table.Column<bool>(type: "boolean", nullable: false),
                    ReviewedByDoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedByDoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DoctorReviewNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    InterventionFlagged = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_ClinicDispensingLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ClinicDispensingLogs_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ClinicDispensingLogs_PatientVitals_PatientVitalsId",
                        column: x => x.PatientVitalsId,
                        principalSchema: "public",
                        principalTable: "PatientVitals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ClinicDispensingLogs_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ClinicDispensingLogs_Prescriptions_PrescriptionItemId",
                        column: x => x.PrescriptionItemId,
                        principalSchema: "public",
                        principalTable: "Prescriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ClinicDispensingLogs_QueueItems_QueueItemId",
                        column: x => x.QueueItemId,
                        principalSchema: "public",
                        principalTable: "QueueItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_ClinicId_ConsultationEncounterId",
                schema: "public",
                table: "ClinicDispensingLogs",
                columns: new[] { "ClinicId", "ConsultationEncounterId" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_ClinicId_DispensedAt",
                schema: "public",
                table: "ClinicDispensingLogs",
                columns: new[] { "ClinicId", "DispensedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_ClinicId_QueueItemId",
                schema: "public",
                table: "ClinicDispensingLogs",
                columns: new[] { "ClinicId", "QueueItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_ClinicId_RequiresDoctorReview_Reviewed~",
                schema: "public",
                table: "ClinicDispensingLogs",
                columns: new[] { "ClinicId", "RequiresDoctorReview", "ReviewedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_ConsultationEncounterId",
                schema: "public",
                table: "ClinicDispensingLogs",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_PatientId",
                schema: "public",
                table: "ClinicDispensingLogs",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_PatientVitalsId",
                schema: "public",
                table: "ClinicDispensingLogs",
                column: "PatientVitalsId");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_PrescriptionItemId",
                schema: "public",
                table: "ClinicDispensingLogs",
                column: "PrescriptionItemId");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicDispensingLogs_QueueItemId",
                schema: "public",
                table: "ClinicDispensingLogs",
                column: "QueueItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ClinicDispensingLogs",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "QueueItemId",
                schema: "public",
                table: "ReferralLetters");

            migrationBuilder.DropColumn(
                name: "ClinicDispensedAt",
                schema: "public",
                table: "Prescriptions");

            migrationBuilder.DropColumn(
                name: "ClinicDispensedBy",
                schema: "public",
                table: "Prescriptions");

            migrationBuilder.DropColumn(
                name: "ClinicDispensedQuantity",
                schema: "public",
                table: "Prescriptions");

            migrationBuilder.DropColumn(
                name: "IsClinicDispensed",
                schema: "public",
                table: "Prescriptions");

            migrationBuilder.DropColumn(
                name: "RosCategory",
                schema: "public",
                table: "Prescriptions");

            migrationBuilder.DropColumn(
                name: "HomeInstructions",
                schema: "public",
                table: "PatientVitals");

            migrationBuilder.DropColumn(
                name: "RosCategory",
                schema: "public",
                table: "PatientVitals");

            migrationBuilder.DropColumn(
                name: "QueueItemId",
                schema: "public",
                table: "MedicalCertificates");

            migrationBuilder.DropColumn(
                name: "IsSigned",
                schema: "public",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "QueueItemId",
                schema: "public",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "DraftOrdersJson",
                schema: "public",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RosCategory",
                schema: "public",
                table: "Consultations");
        }
    }
}
