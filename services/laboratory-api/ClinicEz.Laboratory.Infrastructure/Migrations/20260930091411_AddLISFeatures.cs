using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLISFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CriticalPanicDispatchLogs",
                schema: "laboratory_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    AccessionNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    OrderingDoctorName = table.Column<string>(type: "text", nullable: false),
                    OrderingFacilityName = table.Column<string>(type: "text", nullable: false),
                    CriticalFindings = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    DispatchedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DispatchedByMedTechName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NotifiedDoctorName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NotificationMethod = table.Column<int>(type: "integer", nullable: false),
                    ReadbackConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    ReadbackNotes = table.Column<string>(type: "text", nullable: true),
                    AcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CriticalPanicDispatchLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LabRequisitions",
                schema: "laboratory_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalRequisitionId = table.Column<Guid>(type: "uuid", nullable: true),
                    AccessionNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    OrderingFacilityId = table.Column<string>(type: "text", nullable: false),
                    OrderingFacilityName = table.Column<string>(type: "text", nullable: false),
                    OrderingDoctorName = table.Column<string>(type: "text", nullable: false),
                    OrderingDoctorPrc = table.Column<string>(type: "text", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PhilHealthPin = table.Column<string>(type: "text", nullable: true),
                    PatientAge = table.Column<int>(type: "integer", nullable: false),
                    PatientGender = table.Column<string>(type: "text", nullable: false),
                    ContactNumber = table.Column<string>(type: "text", nullable: true),
                    ClinicalDiagnosis = table.Column<string>(type: "text", nullable: true),
                    FastingInstructions = table.Column<string>(type: "text", nullable: true),
                    Urgency = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LabRequisitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QcLots",
                schema: "laboratory_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LotNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ControlName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    AnalyteCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    InstrumentName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TargetMean = table.Column<double>(type: "double precision", nullable: false),
                    TargetStandardDeviation = table.Column<double>(type: "double precision", nullable: false),
                    ManufacturerExpirationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OpenVialDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    OpenVialStabilityDays = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QcLots", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AnalyteResults",
                schema: "laboratory_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LabRequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PanelName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AnalyteCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AnalyteName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Value = table.Column<string>(type: "text", nullable: false),
                    Unit = table.Column<string>(type: "text", nullable: false),
                    ReferenceInterval = table.Column<string>(type: "text", nullable: false),
                    Flag = table.Column<int>(type: "integer", nullable: false),
                    Interpretation = table.Column<string>(type: "text", nullable: true),
                    EnteredByMedTechName = table.Column<string>(type: "text", nullable: true),
                    EnteredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyteResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AnalyteResults_LabRequisitions_LabRequisitionId",
                        column: x => x.LabRequisitionId,
                        principalSchema: "laboratory_dashboard",
                        principalTable: "LabRequisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DiagnosticReports",
                schema: "laboratory_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LabRequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReleasedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PathologistName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PathologistPrcLicense = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    MedicalTechnologistName = table.Column<string>(type: "text", nullable: false),
                    MedicalTechnologistPrcLicense = table.Column<string>(type: "text", nullable: false),
                    PathologistImpression = table.Column<string>(type: "text", nullable: true),
                    IsCriticalResult = table.Column<bool>(type: "boolean", nullable: false),
                    SignedPdfBase64 = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiagnosticReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiagnosticReports_LabRequisitions_LabRequisitionId",
                        column: x => x.LabRequisitionId,
                        principalSchema: "laboratory_dashboard",
                        principalTable: "LabRequisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Specimens",
                schema: "laboratory_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LabRequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Barcode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ContainerType = table.Column<int>(type: "integer", nullable: false),
                    SpecimenType = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CollectedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CollectedByPhlebotomistName = table.Column<string>(type: "text", nullable: true),
                    ReceivedInLabAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    RejectionReason = table.Column<int>(type: "integer", nullable: false),
                    RejectionNotes = table.Column<string>(type: "text", nullable: true),
                    RejectedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RejectedByPhlebotomistName = table.Column<string>(type: "text", nullable: true),
                    CorrectiveAction = table.Column<string>(type: "text", nullable: true),
                    RackId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    RackPosition = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    StorageTemperature = table.Column<int>(type: "integer", nullable: false),
                    StorageStatus = table.Column<int>(type: "integer", nullable: false),
                    StoredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DisposedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Specimens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Specimens_LabRequisitions_LabRequisitionId",
                        column: x => x.LabRequisitionId,
                        principalSchema: "laboratory_dashboard",
                        principalTable: "LabRequisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QcRuns",
                schema: "laboratory_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    QcLotId = table.Column<Guid>(type: "uuid", nullable: false),
                    AnalyteCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    MeasuredValue = table.Column<double>(type: "double precision", nullable: false),
                    ZScore = table.Column<double>(type: "double precision", nullable: false),
                    RunAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RunByMedTechName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ViolationRules = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    CorrectiveAction = table.Column<string>(type: "text", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QcRuns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QcRuns_QcLots_QcLotId",
                        column: x => x.QcLotId,
                        principalSchema: "laboratory_dashboard",
                        principalTable: "QcLots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnalyteResults_LabRequisitionId",
                schema: "laboratory_dashboard",
                table: "AnalyteResults",
                column: "LabRequisitionId");

            migrationBuilder.CreateIndex(
                name: "IX_DiagnosticReports_LabRequisitionId",
                schema: "laboratory_dashboard",
                table: "DiagnosticReports",
                column: "LabRequisitionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_AccessionNumber",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                column: "AccessionNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_ExternalRequisitionId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                column: "ExternalRequisitionId");

            migrationBuilder.CreateIndex(
                name: "IX_QcRuns_QcLotId",
                schema: "laboratory_dashboard",
                table: "QcRuns",
                column: "QcLotId");

            migrationBuilder.CreateIndex(
                name: "IX_Specimens_Barcode",
                schema: "laboratory_dashboard",
                table: "Specimens",
                column: "Barcode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Specimens_LabRequisitionId",
                schema: "laboratory_dashboard",
                table: "Specimens",
                column: "LabRequisitionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnalyteResults",
                schema: "laboratory_dashboard");

            migrationBuilder.DropTable(
                name: "CriticalPanicDispatchLogs",
                schema: "laboratory_dashboard");

            migrationBuilder.DropTable(
                name: "DiagnosticReports",
                schema: "laboratory_dashboard");

            migrationBuilder.DropTable(
                name: "QcRuns",
                schema: "laboratory_dashboard");

            migrationBuilder.DropTable(
                name: "Specimens",
                schema: "laboratory_dashboard");

            migrationBuilder.DropTable(
                name: "QcLots",
                schema: "laboratory_dashboard");

            migrationBuilder.DropTable(
                name: "LabRequisitions",
                schema: "laboratory_dashboard");
        }
    }
}
