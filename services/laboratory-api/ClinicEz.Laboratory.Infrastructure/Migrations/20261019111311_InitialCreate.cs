using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.CreateTable(
                name: "CriticalPanicDispatchLogs",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    NotificationMethod = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
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
                name: "interop_inbox",
                schema: "public",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ProcessedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_interop_inbox", x => x.MessageId);
                });

            migrationBuilder.CreateTable(
                name: "interop_outbox",
                schema: "public",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    EnvelopeJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DispatchedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeadLetteredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_interop_outbox", x => x.MessageId);
                });

            migrationBuilder.CreateTable(
                name: "LabRequisitions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    BranchId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalRequisitionId = table.Column<Guid>(type: "uuid", nullable: true),
                    AccessionNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    OrderingTenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    OrderingFacilityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    OrderingFacilityName = table.Column<string>(type: "text", nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: true),
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
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    VisitKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Stage = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    StageChangedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StageReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PaymentPolicy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    QuotedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    QuoteLinesJson = table.Column<string>(type: "text", nullable: true),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    PaidAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReceiptNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PaymentCorrection = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PaymentCorrectedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RefundedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DoctorReviewOutcome = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DoctorReviewedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DoctorReviewedByName = table.Column<string>(type: "text", nullable: true),
                    DoctorReviewedByPrc = table.Column<string>(type: "text", nullable: true),
                    DoctorReviewRemarks = table.Column<string>(type: "text", nullable: true),
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
                name: "LabSettings",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryName = table.Column<string>(type: "text", nullable: false),
                    PaymentPolicy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    LicenseToken = table.Column<string>(type: "text", nullable: true),
                    EntitlementVersion = table.Column<int>(type: "integer", nullable: false),
                    PlanTier = table.Column<string>(type: "text", nullable: false),
                    MaxStaffLimit = table.Column<int>(type: "integer", nullable: false),
                    MaxAnalyzersLimit = table.Column<int>(type: "integer", nullable: false),
                    LicenseExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LicenseToOperateNumber = table.Column<string>(type: "text", nullable: true),
                    TaxIdentificationNumber = table.Column<string>(type: "text", nullable: true),
                    PhilHealthAccreditationNumber = table.Column<string>(type: "text", nullable: true),
                    PhysicalAddress = table.Column<string>(type: "text", nullable: true),
                    ContactNumbers = table.Column<string>(type: "text", nullable: true),
                    EmailAndWeb = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_LabSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LabStaffMembers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    FirstName = table.Column<string>(type: "text", nullable: false),
                    LastName = table.Column<string>(type: "text", nullable: false),
                    MiddleName = table.Column<string>(type: "text", nullable: true),
                    Title = table.Column<string>(type: "text", nullable: true),
                    Role = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    PhoneNumber = table.Column<string>(type: "text", nullable: true),
                    PrcLicenseNumber = table.Column<string>(type: "text", nullable: true),
                    PtrNumber = table.Column<string>(type: "text", nullable: true),
                    Specialty = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    PasswordHash = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    MustChangePassword = table.Column<bool>(type: "boolean", nullable: false),
                    FailedLoginCount = table.Column<int>(type: "integer", nullable: false),
                    LockoutEnd = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TokenVersion = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_LabStaffMembers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Products",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Sku = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Price = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
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
                    table.PrimaryKey("PK_Products", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QcLots",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    LotNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ControlName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Level = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
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
                name: "workspace_profiles",
                schema: "public",
                columns: table => new
                {
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TenantSlug = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    ProfileJson = table.Column<string>(type: "text", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_profiles", x => x.TenantId);
                });

            migrationBuilder.CreateTable(
                name: "AnalyteResults",
                schema: "public",
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
                    Flag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
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
                        principalSchema: "public",
                        principalTable: "LabRequisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DiagnosticReports",
                schema: "public",
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
                        principalSchema: "public",
                        principalTable: "LabRequisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Specimens",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LabRequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Barcode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ContainerType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SpecimenType = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CollectedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CollectedByPhlebotomistName = table.Column<string>(type: "text", nullable: true),
                    ReceivedInLabAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    RejectionReason = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RejectionNotes = table.Column<string>(type: "text", nullable: true),
                    RejectedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RejectedByPhlebotomistName = table.Column<string>(type: "text", nullable: true),
                    CorrectiveAction = table.Column<string>(type: "text", nullable: true),
                    RackId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    RackPosition = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    StorageTemperature = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    StorageStatus = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
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
                        principalSchema: "public",
                        principalTable: "LabRequisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LabRefreshTokens",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StaffMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    FamilyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReplacedByTokenId = table.Column<Guid>(type: "uuid", nullable: true),
                    DeviceLabel = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
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
                    table.PrimaryKey("PK_LabRefreshTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LabRefreshTokens_LabStaffMembers_StaffMemberId",
                        column: x => x.StaffMemberId,
                        principalSchema: "public",
                        principalTable: "LabStaffMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QcRuns",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    QcLotId = table.Column<Guid>(type: "uuid", nullable: false),
                    AnalyteCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    MeasuredValue = table.Column<double>(type: "double precision", nullable: false),
                    ZScore = table.Column<double>(type: "double precision", nullable: false),
                    RunAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RunByMedTechName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
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
                        principalSchema: "public",
                        principalTable: "QcLots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnalyteResults_LabRequisitionId",
                schema: "public",
                table: "AnalyteResults",
                column: "LabRequisitionId");

            migrationBuilder.CreateIndex(
                name: "IX_DiagnosticReports_LabRequisitionId",
                schema: "public",
                table: "DiagnosticReports",
                column: "LabRequisitionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_interop_inbox_ProcessedAtUtc",
                schema: "public",
                table: "interop_inbox",
                column: "ProcessedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_interop_outbox_CorrelationId",
                schema: "public",
                table: "interop_outbox",
                column: "CorrelationId");

            migrationBuilder.CreateIndex(
                name: "IX_interop_outbox_DispatchedAtUtc_DeadLetteredAtUtc_NextAttemp~",
                schema: "public",
                table: "interop_outbox",
                columns: new[] { "DispatchedAtUtc", "DeadLetteredAtUtc", "NextAttemptAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_LabRefreshTokens_FamilyId",
                schema: "public",
                table: "LabRefreshTokens",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_LabRefreshTokens_StaffMemberId",
                schema: "public",
                table: "LabRefreshTokens",
                column: "StaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_LabRefreshTokens_TokenHash",
                schema: "public",
                table: "LabRefreshTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_BranchId",
                schema: "public",
                table: "LabRequisitions",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_ExternalRequisitionId",
                schema: "public",
                table: "LabRequisitions",
                column: "ExternalRequisitionId");

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_InvoiceId",
                schema: "public",
                table: "LabRequisitions",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_LaboratoryId_AccessionNumber",
                schema: "public",
                table: "LabRequisitions",
                columns: new[] { "LaboratoryId", "AccessionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_LaboratoryId_OrderingTenantId_OrderingFacil~",
                schema: "public",
                table: "LabRequisitions",
                columns: new[] { "LaboratoryId", "OrderingTenantId", "OrderingFacilityId", "ExternalRequisitionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabStaffMembers_LaboratoryId_Email",
                schema: "public",
                table: "LabStaffMembers",
                columns: new[] { "LaboratoryId", "Email" });

            migrationBuilder.CreateIndex(
                name: "IX_QcRuns_QcLotId",
                schema: "public",
                table: "QcRuns",
                column: "QcLotId");

            migrationBuilder.CreateIndex(
                name: "IX_Specimens_LabRequisitionId_Barcode",
                schema: "public",
                table: "Specimens",
                columns: new[] { "LabRequisitionId", "Barcode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_workspace_profiles_TenantSlug",
                schema: "public",
                table: "workspace_profiles",
                column: "TenantSlug");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnalyteResults",
                schema: "public");

            migrationBuilder.DropTable(
                name: "CriticalPanicDispatchLogs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "DiagnosticReports",
                schema: "public");

            migrationBuilder.DropTable(
                name: "interop_inbox",
                schema: "public");

            migrationBuilder.DropTable(
                name: "interop_outbox",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabRefreshTokens",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabSettings",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Products",
                schema: "public");

            migrationBuilder.DropTable(
                name: "QcRuns",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Specimens",
                schema: "public");

            migrationBuilder.DropTable(
                name: "workspace_profiles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabStaffMembers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "QcLots",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabRequisitions",
                schema: "public");
        }
    }
}
