using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLabPaymentGateAndOrderStages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Specimens_Barcode",
                schema: "laboratory_dashboard",
                table: "Specimens");

            migrationBuilder.DropIndex(
                name: "IX_Specimens_LabRequisitionId",
                schema: "laboratory_dashboard",
                table: "Specimens");

            migrationBuilder.DropIndex(
                name: "IX_LabRequisitions_AccessionNumber",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.AddColumn<Guid>(
                name: "LaboratoryId",
                schema: "laboratory_dashboard",
                table: "QcRuns",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "LaboratoryId",
                schema: "laboratory_dashboard",
                table: "QcLots",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "LaboratoryId",
                schema: "laboratory_dashboard",
                table: "Products",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "TenantId",
                schema: "laboratory_dashboard",
                table: "Products",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "PaymentPolicy",
                schema: "laboratory_dashboard",
                table: "LabSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "InvoiceId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PaidAtUtc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PaymentPolicy",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "QuoteLinesJson",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "QuotedAmount",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceiptNumber",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Stage",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "StageChangedAtUtc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StageReason",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VisitKey",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LaboratoryId",
                schema: "laboratory_dashboard",
                table: "CriticalPanicDispatchLogs",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            // Orders that already exist were accepted before the payment gate: they stay unbilled (PaymentPolicy.None = 2)
            // and keep a stage that matches their processing status, so nothing in flight is suddenly blocked.
            migrationBuilder.Sql(@"
UPDATE laboratory_dashboard.""LabRequisitions""
SET ""Currency"" = 'PHP',
    ""PaymentPolicy"" = 2,
    ""Stage"" = CASE ""Status""
        WHEN 0 THEN 0  -- PendingAccession -> Routed
        WHEN 1 THEN 4  -- SpecimenCollected
        WHEN 2 THEN 5  -- InTesting -> InProcess
        WHEN 3 THEN 5  -- AwaitingReview -> InProcess
        WHEN 4 THEN 6  -- Verified -> ResultFinalized
        WHEN 5 THEN 7  -- Rejected
        ELSE 0
    END;");

            // Each tenant had exactly one laboratory before facility scoping; children inherit it.
            migrationBuilder.Sql(@"
UPDATE laboratory_dashboard.""QcLots"" t
SET ""LaboratoryId"" = s.""LaboratoryId""
FROM laboratory_dashboard.""LabSettings"" s
WHERE s.""TenantId"" = t.""TenantId"" AND NOT s.""IsDeleted"" AND t.""LaboratoryId"" = '00000000-0000-0000-0000-000000000000';

UPDATE laboratory_dashboard.""QcRuns"" t
SET ""LaboratoryId"" = s.""LaboratoryId""
FROM laboratory_dashboard.""LabSettings"" s
WHERE s.""TenantId"" = t.""TenantId"" AND NOT s.""IsDeleted"" AND t.""LaboratoryId"" = '00000000-0000-0000-0000-000000000000';

UPDATE laboratory_dashboard.""CriticalPanicDispatchLogs"" t
SET ""LaboratoryId"" = s.""LaboratoryId""
FROM laboratory_dashboard.""LabSettings"" s
WHERE s.""TenantId"" = t.""TenantId"" AND NOT s.""IsDeleted"" AND t.""LaboratoryId"" = '00000000-0000-0000-0000-000000000000';");

            // The catalogue had no owner: it belongs to the only laboratory of a single-laboratory database.
            // With several laboratories it cannot be attributed and is left unowned (invisible) for an operator to assign.
            migrationBuilder.Sql(@"
UPDATE laboratory_dashboard.""Products"" p
SET ""TenantId"" = s.""TenantId"", ""LaboratoryId"" = s.""LaboratoryId""
FROM laboratory_dashboard.""LabSettings"" s
WHERE NOT s.""IsDeleted""
  AND (SELECT COUNT(*) FROM laboratory_dashboard.""LabSettings"" WHERE NOT ""IsDeleted"") = 1
  AND p.""LaboratoryId"" = '00000000-0000-0000-0000-000000000000';");

            migrationBuilder.CreateIndex(
                name: "IX_Specimens_LabRequisitionId_Barcode",
                schema: "laboratory_dashboard",
                table: "Specimens",
                columns: new[] { "LabRequisitionId", "Barcode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_InvoiceId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_LaboratoryId_AccessionNumber",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                columns: new[] { "LaboratoryId", "AccessionNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Specimens_LabRequisitionId_Barcode",
                schema: "laboratory_dashboard",
                table: "Specimens");

            migrationBuilder.DropIndex(
                name: "IX_LabRequisitions_InvoiceId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropIndex(
                name: "IX_LabRequisitions_LaboratoryId_AccessionNumber",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "LaboratoryId",
                schema: "laboratory_dashboard",
                table: "QcRuns");

            migrationBuilder.DropColumn(
                name: "LaboratoryId",
                schema: "laboratory_dashboard",
                table: "QcLots");

            migrationBuilder.DropColumn(
                name: "LaboratoryId",
                schema: "laboratory_dashboard",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "TenantId",
                schema: "laboratory_dashboard",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PaymentPolicy",
                schema: "laboratory_dashboard",
                table: "LabSettings");

            migrationBuilder.DropColumn(
                name: "Currency",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "InvoiceId",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "PaidAtUtc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "PaymentPolicy",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "QuoteLinesJson",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "QuotedAmount",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "ReceiptNumber",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "Stage",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "StageChangedAtUtc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "StageReason",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "VisitKey",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "LaboratoryId",
                schema: "laboratory_dashboard",
                table: "CriticalPanicDispatchLogs");

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

            migrationBuilder.CreateIndex(
                name: "IX_LabRequisitions_AccessionNumber",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                column: "AccessionNumber",
                unique: true);
        }
    }
}
