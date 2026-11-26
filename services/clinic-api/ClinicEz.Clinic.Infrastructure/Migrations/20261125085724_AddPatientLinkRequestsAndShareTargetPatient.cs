using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientLinkRequestsAndShareTargetPatient : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TargetPatientId",
                schema: "public",
                table: "ShareImports",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PatientLinkRequests",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CloudPatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicEzId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    MiddleName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Suffix = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: true),
                    VerifiedEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ContactNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IdentifierClaims = table.Column<string>(type: "jsonb", nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CandidateMatches = table.Column<string>(type: "jsonb", nullable: true),
                    MatchedPatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ReviewedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RejectionReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    RequestedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientLinkRequests", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientLinkRequests_ClinicId_CloudPatientId",
                schema: "public",
                table: "PatientLinkRequests",
                columns: new[] { "ClinicId", "CloudPatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientLinkRequests_ClinicId_Status",
                schema: "public",
                table: "PatientLinkRequests",
                columns: new[] { "ClinicId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PatientLinkRequests",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "TargetPatientId",
                schema: "public",
                table: "ShareImports");
        }
    }
}
