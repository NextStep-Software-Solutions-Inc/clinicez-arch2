using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPortalDecouplingProjections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsJoinEnabled",
                schema: "public",
                table: "Facilities",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "JoinCode",
                schema: "public",
                table: "Facilities",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "JoinCodeExpiresAtUtc",
                schema: "public",
                table: "Facilities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "JoinSettingsUpdatedAtUtc",
                schema: "public",
                table: "Facilities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DocumentAttestations",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentKind = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DocumentNumber = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    SourceDocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    VerificationTokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    SecurityDigest = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ClinicName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ClinicAddress = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    ClinicContact = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    DoctorName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    DoctorPrcLicense = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    DoctorPtr = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    DoctorS2License = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    IssuedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false, defaultValue: "VALID"),
                    IsAlreadyDispensed = table.Column<bool>(type: "boolean", nullable: false),
                    DispenseStatus = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    DispensedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DispensedPharmacyName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    DispensedReceiptFileName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    HasDangerousDrug = table.Column<bool>(type: "boolean", nullable: false),
                    ItemCount = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_DocumentAttestations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentAttestations_Facilities_FacilityId",
                        column: x => x.FacilityId,
                        principalSchema: "public",
                        principalTable: "Facilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DocumentAttestations_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "public",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FacilityQueueBoards",
                schema: "public",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    QueueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    IsAcceptingWalkIns = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    PatientsWaitingCount = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    NowServingJson = table.Column<string>(type: "jsonb", nullable: false),
                    UpNextJson = table.Column<string>(type: "jsonb", nullable: false),
                    EmergencyJson = table.Column<string>(type: "jsonb", nullable: true),
                    GeneratedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FacilityQueueBoards", x => new { x.TenantId, x.FacilityId });
                    table.ForeignKey(
                        name: "FK_FacilityQueueBoards_Facilities_FacilityId",
                        column: x => x.FacilityId,
                        principalSchema: "public",
                        principalTable: "Facilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FacilityQueueBoards_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "public",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_JoinCode",
                schema: "public",
                table: "Facilities",
                column: "JoinCode",
                filter: "\"IsDeleted\" = false AND \"JoinCode\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentAttestations_DocumentKind_DocumentNumber",
                schema: "public",
                table: "DocumentAttestations",
                columns: new[] { "DocumentKind", "DocumentNumber" },
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentAttestations_DocumentKind_SecurityDigest",
                schema: "public",
                table: "DocumentAttestations",
                columns: new[] { "DocumentKind", "SecurityDigest" },
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentAttestations_DocumentKind_VerificationTokenHash",
                schema: "public",
                table: "DocumentAttestations",
                columns: new[] { "DocumentKind", "VerificationTokenHash" },
                filter: "\"IsDeleted\" = false AND \"VerificationTokenHash\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentAttestations_FacilityId",
                schema: "public",
                table: "DocumentAttestations",
                column: "FacilityId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentAttestations_TenantId_FacilityId_DocumentKind_Sourc~",
                schema: "public",
                table: "DocumentAttestations",
                columns: new[] { "TenantId", "FacilityId", "DocumentKind", "SourceDocumentId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityQueueBoards_FacilityId_QueueDate",
                schema: "public",
                table: "FacilityQueueBoards",
                columns: new[] { "FacilityId", "QueueDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DocumentAttestations",
                schema: "public");

            migrationBuilder.DropTable(
                name: "FacilityQueueBoards",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_Facilities_JoinCode",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "IsJoinEnabled",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "JoinCode",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "JoinCodeExpiresAtUtc",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "JoinSettingsUpdatedAtUtc",
                schema: "public",
                table: "Facilities");
        }
    }
}
