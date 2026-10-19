using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPharmacyLicensingAndStaffManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InventoryItems",
                schema: "pharmacy_dashboard",
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
                schema: "pharmacy_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    PharmacyId = table.Column<Guid>(type: "uuid", nullable: false),
                    PharmacyName = table.Column<string>(type: "text", nullable: false),
                    LicenseToken = table.Column<string>(type: "text", nullable: true),
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
                schema: "pharmacy_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    PharmacyId = table.Column<Guid>(type: "uuid", nullable: false),
                    FirstName = table.Column<string>(type: "text", nullable: false),
                    LastName = table.Column<string>(type: "text", nullable: false),
                    MiddleName = table.Column<string>(type: "text", nullable: true),
                    Title = table.Column<string>(type: "text", nullable: true),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    PhoneNumber = table.Column<string>(type: "text", nullable: true),
                    PrcLicenseNumber = table.Column<string>(type: "text", nullable: true),
                    S2LicenseNumber = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_PharmacyStaffMembers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PrescriptionOrders",
                schema: "pharmacy_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    PharmacyId = table.Column<string>(type: "text", nullable: false),
                    ExternalPrescriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrescriptionNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    OrderingFacilityId = table.Column<string>(type: "text", nullable: false),
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
                    Status = table.Column<int>(type: "integer", nullable: false),
                    IssuedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DispensedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DispensingPharmacistName = table.Column<string>(type: "text", nullable: true),
                    DispensingPharmacistPrc = table.Column<string>(type: "text", nullable: true),
                    TotalAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
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
                name: "InventoryBatches",
                schema: "pharmacy_dashboard",
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
                    table.PrimaryKey("PK_InventoryBatches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryBatches_InventoryItems_InventoryItemId",
                        column: x => x.InventoryItemId,
                        principalSchema: "pharmacy_dashboard",
                        principalTable: "InventoryItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DispenseAuditRecords",
                schema: "pharmacy_dashboard",
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
                        principalSchema: "pharmacy_dashboard",
                        principalTable: "PrescriptionOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PrescriptionOrderItems",
                schema: "pharmacy_dashboard",
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
                    Status = table.Column<int>(type: "integer", nullable: false),
                    IsDangerousDrug = table.Column<bool>(type: "boolean", nullable: false),
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
                        principalSchema: "pharmacy_dashboard",
                        principalTable: "PrescriptionOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DispenseAuditRecords_PrescriptionOrderId",
                schema: "pharmacy_dashboard",
                table: "DispenseAuditRecords",
                column: "PrescriptionOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryBatches_InventoryItemId",
                schema: "pharmacy_dashboard",
                table: "InventoryBatches",
                column: "InventoryItemId");

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionOrderItems_PrescriptionOrderId",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems",
                column: "PrescriptionOrderId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DispenseAuditRecords",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropTable(
                name: "InventoryBatches",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropTable(
                name: "PharmacySettings",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropTable(
                name: "PharmacyStaffMembers",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropTable(
                name: "PrescriptionOrderItems",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropTable(
                name: "InventoryItems",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropTable(
                name: "PrescriptionOrders",
                schema: "pharmacy_dashboard");
        }
    }
}
