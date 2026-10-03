using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGamotBeneficiaryLedgerAndUpsc : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "GamotCoverageAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "IsPhilHealthGamot",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "PatientCoPayAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthIdentificationNumber",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthMemberPin",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "GamotReferencePrice",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsGamotCovered",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthDrugCode",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UniquePrescriptionSecurityCode",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GamotBeneficiaryLedgers",
                schema: "pharmacy_dashboard",
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
                name: "GamotLedgerTransactions",
                schema: "pharmacy_dashboard",
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
                    Status = table.Column<int>(type: "integer", nullable: false),
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
                        principalSchema: "pharmacy_dashboard",
                        principalTable: "GamotBeneficiaryLedgers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GamotBeneficiaryLedgers_TenantId_PharmacyId_PhilHealthIdent~",
                schema: "pharmacy_dashboard",
                table: "GamotBeneficiaryLedgers",
                columns: new[] { "TenantId", "PharmacyId", "PhilHealthIdentificationNumber", "BenefitYear" });

            migrationBuilder.CreateIndex(
                name: "IX_GamotLedgerTransactions_GamotBeneficiaryLedgerId",
                schema: "pharmacy_dashboard",
                table: "GamotLedgerTransactions",
                column: "GamotBeneficiaryLedgerId");

            migrationBuilder.CreateIndex(
                name: "IX_GamotLedgerTransactions_TenantId_PharmacyId_UniquePrescript~",
                schema: "pharmacy_dashboard",
                table: "GamotLedgerTransactions",
                columns: new[] { "TenantId", "PharmacyId", "UniquePrescriptionSecurityCode" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GamotLedgerTransactions",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropTable(
                name: "GamotBeneficiaryLedgers",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropColumn(
                name: "GamotCoverageAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "IsPhilHealthGamot",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PatientCoPayAmount",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PhilHealthIdentificationNumber",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "PhilHealthMemberPin",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrders");

            migrationBuilder.DropColumn(
                name: "GamotReferencePrice",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems");

            migrationBuilder.DropColumn(
                name: "IsGamotCovered",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems");

            migrationBuilder.DropColumn(
                name: "PhilHealthDrugCode",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems");

            migrationBuilder.DropColumn(
                name: "UniquePrescriptionSecurityCode",
                schema: "pharmacy_dashboard",
                table: "PrescriptionOrderItems");
        }
    }
}
