using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddYakapTransmittals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "YakapTransmittals",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    TransmittalNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ReportTagging = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    EffectiveYear = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    PackageType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", nullable: false),
                    PhilHealthTransactionNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    RawXmlPayload = table.Column<string>(type: "text", nullable: true),
                    EncryptedPayloadHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ValidationErrors = table.Column<string>(type: "text", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SubmittedBy = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
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
                    table.PrimaryKey("PK_YakapTransmittals", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "YakapTransmittalItems",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    YakapTransmittalId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    PhilHealthIdentificationNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    EncounterDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ItemType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReportStatus = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "U"),
                    DeficiencyRemarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
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
                    table.PrimaryKey("PK_YakapTransmittalItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_YakapTransmittalItems_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "Consultations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_YakapTransmittalItems_YakapTransmittals_YakapTransmittalId",
                        column: x => x.YakapTransmittalId,
                        principalSchema: "clinic_dashboard",
                        principalTable: "YakapTransmittals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittalItems_ConsultationEncounterId",
                schema: "clinic_dashboard",
                table: "YakapTransmittalItems",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittalItems_TenantId_ClinicId_YakapTransmittalId",
                schema: "clinic_dashboard",
                table: "YakapTransmittalItems",
                columns: new[] { "TenantId", "ClinicId", "YakapTransmittalId" });

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittalItems_YakapTransmittalId",
                schema: "clinic_dashboard",
                table: "YakapTransmittalItems",
                column: "YakapTransmittalId");

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittals_TenantId_ClinicId_TransmittalNumber",
                schema: "clinic_dashboard",
                table: "YakapTransmittals",
                columns: new[] { "TenantId", "ClinicId", "TransmittalNumber" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "YakapTransmittalItems",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "YakapTransmittals",
                schema: "clinic_dashboard");
        }
    }
}
