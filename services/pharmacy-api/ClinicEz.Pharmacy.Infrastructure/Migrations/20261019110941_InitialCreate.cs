using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
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
                name: "GamotBeneficiaryLedgers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PharmacyId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PhilHealthIdentificationNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    MemberPhilHealthIdentificationNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    BenefitYear = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    AnnualAllocation = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalAmountUtilized = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
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
                    table.PrimaryKey("PK_GamotBeneficiaryLedgers", x => x.Id);
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
                name: "InventoryItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    PharmacyId = table.Column<string>(type: "text", nullable: false),
                    Sku = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    GenericName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    BrandName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    DosageForm = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Strength = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CurrentStock = table.Column<int>(type: "integer", nullable: false),
                    ReorderLevel = table.Column<int>(type: "integer", nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    StorageCondition = table.Column<string>(type: "text", nullable: true),
                    IsDangerousDrug = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_InventoryItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PharmacySettings",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    PharmacyId = table.Column<Guid>(type: "uuid", nullable: false),
                    PharmacyName = table.Column<string>(type: "text", nullable: false),
                    PaymentPolicy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    LicenseToken = table.Column<string>(type: "text", nullable: true),
                    EntitlementVersion = table.Column<int>(type: "integer", nullable: false),
                    PlanTier = table.Column<string>(type: "text", nullable: false),
                    MaxStaffLimit = table.Column<int>(type: "integer", nullable: false),
                    LicenseExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LicenseToOperateNumber = table.Column<string>(type: "text", nullable: true),
                    TaxIdentificationNumber = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_PharmacySettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PharmacyStaffMembers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    PharmacyId = table.Column<Guid>(type: "uuid", nullable: false),
                    FirstName = table.Column<string>(type: "text", nullable: false),
                    LastName = table.Column<string>(type: "text", nullable: false),
                    MiddleName = table.Column<string>(type: "text", nullable: true),
                    Title = table.Column<string>(type: "text", nullable: true),
                    Role = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    PhoneNumber = table.Column<string>(type: "text", nullable: true),
                    PrcLicenseNumber = table.Column<string>(type: "text", nullable: true),
                    S2LicenseNumber = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_PharmacyStaffMembers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PrescriptionOrders",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    BranchId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PharmacyId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ExternalPrescriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    OrderingFacilityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    OrderingTenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    PharmacyName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    VisitKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PaymentPolicy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PaymentStatus = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    QuotedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    PaidAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    PaidAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PaymentReceiptNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PaymentCorrectedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PaymentReversedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    StatusReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    OrderingFacilityName = table.Column<string>(type: "text", nullable: false),
                    OrderingDoctorName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    DoctorPrcLicense = table.Column<string>(type: "text", nullable: false),
                    DoctorPtr = table.Column<string>(type: "text", nullable: true),
                    DoctorS2License = table.Column<string>(type: "text", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PatientAge = table.Column<int>(type: "integer", nullable: false),
                    PatientGender = table.Column<string>(type: "text", nullable: false),
                    PatientContact = table.Column<string>(type: "text", nullable: true),
                    PatientAllergies = table.Column<string>(type: "text", nullable: true),
                    ClinicalDiagnosis = table.Column<string>(type: "text", nullable: true),
                    SpecialInstructions = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IssuedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DispensedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DispensingPharmacistName = table.Column<string>(type: "text", nullable: true),
                    DispensingPharmacistPrc = table.Column<string>(type: "text", nullable: true),
                    TotalAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    IsPhilHealthGamot = table.Column<bool>(type: "boolean", nullable: false),
                    PhilHealthIdentificationNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    PhilHealthMemberPin = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    GamotCoverageAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PatientCoPayAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
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
                    table.PrimaryKey("PK_PrescriptionOrders", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Products",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
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
                name: "GamotLedgerTransactions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PharmacyId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    GamotBeneficiaryLedgerId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionOrderItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    PrescriptionNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TransactionDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PhilHealthDrugCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    GenericName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    BrandName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    QuantityDispensed = table.Column<int>(type: "integer", nullable: false),
                    PhilHealthReferencePrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalGamotAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PatientCoPay = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    UniquePrescriptionSecurityCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DispensingPharmacistName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    DispensingPharmacistPrc = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    HciAccreditationNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PhilHealthClaimSequenceNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
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
                    table.PrimaryKey("PK_GamotLedgerTransactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GamotLedgerTransactions_GamotBeneficiaryLedgers_GamotBenefi~",
                        column: x => x.GamotBeneficiaryLedgerId,
                        principalSchema: "public",
                        principalTable: "GamotBeneficiaryLedgers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InventoryBatches",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    PharmacyId = table.Column<string>(type: "text", nullable: false),
                    InventoryItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    QuantityReceived = table.Column<int>(type: "integer", nullable: false),
                    QuantityRemaining = table.Column<int>(type: "integer", nullable: false),
                    ReceivedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
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
                    table.PrimaryKey("PK_InventoryBatches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryBatches_InventoryItems_InventoryItemId",
                        column: x => x.InventoryItemId,
                        principalSchema: "public",
                        principalTable: "InventoryItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RefreshTokens",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StaffMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PharmacyId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_RefreshTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RefreshTokens_PharmacyStaffMembers_StaffMemberId",
                        column: x => x.StaffMemberId,
                        principalSchema: "public",
                        principalTable: "PharmacyStaffMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DispenseAuditRecords",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    PharmacistName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PharmacistPrcLicense = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DispensedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ReceiptNumber = table.Column<string>(type: "text", nullable: true),
                    BatchDeductionsJson = table.Column<string>(type: "text", nullable: false),
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
                    table.PrimaryKey("PK_DispenseAuditRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DispenseAuditRecords_PrescriptionOrders_PrescriptionOrderId",
                        column: x => x.PrescriptionOrderId,
                        principalSchema: "public",
                        principalTable: "PrescriptionOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PrescriptionOrderItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    InventoryItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    GenericName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    BrandName = table.Column<string>(type: "text", nullable: true),
                    Dosage = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Form = table.Column<string>(type: "text", nullable: false),
                    Sig = table.Column<string>(type: "text", nullable: false),
                    QuantityPrescribed = table.Column<int>(type: "integer", nullable: false),
                    QuantityDispensed = table.Column<int>(type: "integer", nullable: false),
                    AllocatedBatchNumber = table.Column<string>(type: "text", nullable: true),
                    AllocatedBatchExpiry = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Subtotal = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsDangerousDrug = table.Column<bool>(type: "boolean", nullable: false),
                    IsGamotCovered = table.Column<bool>(type: "boolean", nullable: false),
                    PhilHealthDrugCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UniquePrescriptionSecurityCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    GamotReferencePrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    Remarks = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_PrescriptionOrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PrescriptionOrderItems_PrescriptionOrders_PrescriptionOrder~",
                        column: x => x.PrescriptionOrderId,
                        principalSchema: "public",
                        principalTable: "PrescriptionOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DispenseAuditRecords_PrescriptionOrderId",
                schema: "public",
                table: "DispenseAuditRecords",
                column: "PrescriptionOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_GamotBeneficiaryLedgers_TenantId_PharmacyId_PhilHealthIdent~",
                schema: "public",
                table: "GamotBeneficiaryLedgers",
                columns: new[] { "TenantId", "PharmacyId", "PhilHealthIdentificationNumber", "BenefitYear" });

            migrationBuilder.CreateIndex(
                name: "IX_GamotLedgerTransactions_GamotBeneficiaryLedgerId",
                schema: "public",
                table: "GamotLedgerTransactions",
                column: "GamotBeneficiaryLedgerId");

            migrationBuilder.CreateIndex(
                name: "IX_GamotLedgerTransactions_TenantId_PharmacyId_UniquePrescript~",
                schema: "public",
                table: "GamotLedgerTransactions",
                columns: new[] { "TenantId", "PharmacyId", "UniquePrescriptionSecurityCode" });

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
                name: "IX_InventoryBatches_InventoryItemId",
                schema: "public",
                table: "InventoryBatches",
                column: "InventoryItemId");

            migrationBuilder.CreateIndex(
                name: "IX_PharmacyStaffMembers_PharmacyId_Email",
                schema: "public",
                table: "PharmacyStaffMembers",
                columns: new[] { "PharmacyId", "Email" });

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionOrderItems_PrescriptionOrderId",
                schema: "public",
                table: "PrescriptionOrderItems",
                column: "PrescriptionOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionOrders_BranchId",
                schema: "public",
                table: "PrescriptionOrders",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionOrders_TenantId_PharmacyId_OrderingTenantId_Ord~",
                schema: "public",
                table: "PrescriptionOrders",
                columns: new[] { "TenantId", "PharmacyId", "OrderingTenantId", "OrderingFacilityId", "ExternalPrescriptionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_FamilyId",
                schema: "public",
                table: "RefreshTokens",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_StaffMemberId",
                schema: "public",
                table: "RefreshTokens",
                column: "StaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_TokenHash",
                schema: "public",
                table: "RefreshTokens",
                column: "TokenHash",
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
                name: "DispenseAuditRecords",
                schema: "public");

            migrationBuilder.DropTable(
                name: "GamotLedgerTransactions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "interop_inbox",
                schema: "public");

            migrationBuilder.DropTable(
                name: "interop_outbox",
                schema: "public");

            migrationBuilder.DropTable(
                name: "InventoryBatches",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PharmacySettings",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PrescriptionOrderItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Products",
                schema: "public");

            migrationBuilder.DropTable(
                name: "RefreshTokens",
                schema: "public");

            migrationBuilder.DropTable(
                name: "workspace_profiles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "GamotBeneficiaryLedgers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "InventoryItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PrescriptionOrders",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PharmacyStaffMembers",
                schema: "public");
        }
    }
}
