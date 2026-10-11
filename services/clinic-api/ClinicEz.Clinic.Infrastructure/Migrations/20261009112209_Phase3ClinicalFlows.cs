using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Phase3ClinicalFlows : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ExternalReportFileBase64",
                schema: "clinic_dashboard",
                table: "LabOrders",
                newName: "LegacyExternalReportFileBase64");

            migrationBuilder.DropColumn(
                name: "PublicUploadToken",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.AddColumn<string>(
                name: "ClinicEzId",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ShareGrantExpiresAt",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ShareGrantId",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShareGrantScopes",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "character varying(50)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "ClaimExpiresAt",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClaimToken",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LaboratoryFacilityId",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LaboratoryName",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LaboratoryTenantId",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PaymentRequired",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "QuotedAmount",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QuotedCurrency",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Stage",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "character varying(50)",
                nullable: false,
                defaultValue: "Issued");

            migrationBuilder.AddColumn<DateTime>(
                name: "StageChangedAt",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "StageReason",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StageReportedAt",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TargetFacilityId",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TargetTenantId",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RxClaimExpiresAt",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RxClaimToken",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "LabResults",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    LabOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportId = table.Column<Guid>(type: "uuid", nullable: true),
                    Source = table.Column<string>(type: "character varying(50)", nullable: false),
                    Verification = table.Column<string>(type: "character varying(50)", nullable: false),
                    ExternalLabName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    EncryptionIvBase64 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EncryptionTagBase64 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    WrappedKeyJson = table.Column<string>(type: "text", nullable: true),
                    EncryptedHash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UploadedByPatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VerifiedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    VerifiedByName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    VerifiedByPrc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
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
                    table.PrimaryKey("PK_LabResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LabResults_LabOrders_LabOrderId",
                        column: x => x.LabOrderId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "LabOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ShareImports",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    Purpose = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AddToQueue = table.Column<bool>(type: "boolean", nullable: false),
                    ChiefComplaint = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", nullable: false),
                    DenialReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ClinicPatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClinicEzId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    GrantId = table.Column<Guid>(type: "uuid", nullable: true),
                    Scopes = table.Column<string>(type: "character varying(50)", nullable: false),
                    GrantExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ItemsImported = table.Column<int>(type: "integer", nullable: false),
                    ItemsJson = table.Column<string>(type: "text", nullable: true),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    QueueNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_ShareImports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UploadGrants",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    LabOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<byte[]>(type: "bytea", maxLength: 32, nullable: false),
                    Kind = table.Column<string>(type: "character varying(50)", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    MaxUploads = table.Column<int>(type: "integer", nullable: false),
                    Used = table.Column<int>(type: "integer", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_UploadGrants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UploadGrants_LabOrders_LabOrderId",
                        column: x => x.LabOrderId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "LabOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Patients_ClinicId_ClinicEzId",
                schema: "clinic_dashboard",
                table: "Patients",
                columns: new[] { "ClinicId", "ClinicEzId" });

            migrationBuilder.CreateIndex(
                name: "IX_Patients_ClinicId_SyncPatientId",
                schema: "clinic_dashboard",
                table: "Patients",
                columns: new[] { "ClinicId", "SyncPatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_LabResults_ClinicId_LabOrderId",
                schema: "clinic_dashboard",
                table: "LabResults",
                columns: new[] { "ClinicId", "LabOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_LabResults_ClinicId_LabOrderId_ReportId",
                schema: "clinic_dashboard",
                table: "LabResults",
                columns: new[] { "ClinicId", "LabOrderId", "ReportId" },
                unique: true,
                filter: "\"ReportId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_LabResults_ClinicId_Verification_SubmittedAt",
                schema: "clinic_dashboard",
                table: "LabResults",
                columns: new[] { "ClinicId", "Verification", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LabResults_LabOrderId",
                schema: "clinic_dashboard",
                table: "LabResults",
                column: "LabOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_ShareImports_ClinicId_RequestedAt",
                schema: "clinic_dashboard",
                table: "ShareImports",
                columns: new[] { "ClinicId", "RequestedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_UploadGrants_ClinicId_LabOrderId",
                schema: "clinic_dashboard",
                table: "UploadGrants",
                columns: new[] { "ClinicId", "LabOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_UploadGrants_LabOrderId",
                schema: "clinic_dashboard",
                table: "UploadGrants",
                column: "LabOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_UploadGrants_TokenHash",
                schema: "clinic_dashboard",
                table: "UploadGrants",
                column: "TokenHash",
                unique: true);

            // Orders that existed before the lifecycle was tracked: derive the stage from the legacy status.
            migrationBuilder.Sql("UPDATE clinic_dashboard.\"LabOrders\" SET \"Stage\" = 'ResultFinalized' WHERE \"Status\" IN ('ResultsReceived', 'Completed');");
            migrationBuilder.Sql("UPDATE clinic_dashboard.\"LabOrders\" SET \"Stage\" = 'ExternalSubmitted' WHERE \"Status\" = 'CompletedWithExternalReport';");
            migrationBuilder.Sql("UPDATE clinic_dashboard.\"LabOrders\" SET \"Stage\" = 'Cancelled' WHERE \"Status\" = 'Cancelled';");

            // Existing clinics were seeded before result review existed: let their doctors and administrators review results.
            migrationBuilder.Sql("UPDATE clinic_dashboard.\"ClinicRoles\" SET \"Permissions\" = regexp_replace(\"Permissions\", '\\]\\s*$', ',\"labresults:review\"]') WHERE \"IsSystem\" AND \"Name\" IN ('Attending Physician / Doctor', 'Clinic Administrator') AND \"Permissions\" LIKE '[\"%' AND \"Permissions\" NOT LIKE '%labresults:review%';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE clinic_dashboard.\"ClinicRoles\" SET \"Permissions\" = replace(\"Permissions\", ',\"labresults:review\"', '') WHERE \"IsSystem\";");

            migrationBuilder.DropTable(
                name: "LabResults",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "ShareImports",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "UploadGrants",
                schema: "clinic_dashboard");

            migrationBuilder.DropIndex(
                name: "IX_Patients_ClinicId_ClinicEzId",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropIndex(
                name: "IX_Patients_ClinicId_SyncPatientId",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "ClinicEzId",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "ShareGrantExpiresAt",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "ShareGrantId",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "ShareGrantScopes",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "ClaimExpiresAt",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "ClaimToken",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "LaboratoryFacilityId",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "LaboratoryName",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "LaboratoryTenantId",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "PaymentRequired",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "QuotedAmount",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "QuotedCurrency",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "Stage",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "StageChangedAt",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "StageReason",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "StageReportedAt",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "TargetFacilityId",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "TargetTenantId",
                schema: "clinic_dashboard",
                table: "LabOrders");

            migrationBuilder.DropColumn(
                name: "RxClaimExpiresAt",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "RxClaimToken",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.RenameColumn(
                name: "LegacyExternalReportFileBase64",
                schema: "clinic_dashboard",
                table: "LabOrders",
                newName: "ExternalReportFileBase64");

            migrationBuilder.AddColumn<string>(
                name: "PublicUploadToken",
                schema: "clinic_dashboard",
                table: "LabOrders",
                type: "text",
                nullable: true);
        }
    }
}
