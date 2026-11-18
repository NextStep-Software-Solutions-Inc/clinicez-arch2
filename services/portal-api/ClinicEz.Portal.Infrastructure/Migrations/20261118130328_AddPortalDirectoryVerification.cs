using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPortalDirectoryVerification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_WorkspaceMemberId",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.AddColumn<Guid>(
                name: "LatestVerificationRequestId",
                schema: "public",
                table: "Facilities",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LtoEvidenceObjectKey",
                schema: "public",
                table: "Facilities",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlatformVerificationStatus",
                schema: "public",
                table: "Facilities",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unverified");

            migrationBuilder.AddColumn<string>(
                name: "RejectionReason",
                schema: "public",
                table: "Facilities",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "VerifiedAtUtc",
                schema: "public",
                table: "Facilities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerifiedByAdminUserId",
                schema: "public",
                table: "Facilities",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FacilityVerificationRequests",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmissionNumber = table.Column<int>(type: "integer", nullable: false),
                    CorrelationId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RequestKind = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SubmittedByClinicUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    SubmittedByDisplayName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    SubmittedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SubmittedSnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                    LtoEvidenceObjectKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false, defaultValue: "PendingReview"),
                    WithdrawnAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    WithdrawnByActor = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    WithdrawalReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SupersededByRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedByAdminUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ReviewedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewerNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
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
                    table.PrimaryKey("PK_FacilityVerificationRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FacilityVerificationRequests_Facilities_FacilityId",
                        column: x => x.FacilityId,
                        principalSchema: "public",
                        principalTable: "Facilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FacilityVerificationRequests_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "public",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Practitioners",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    MergedIntoPractitionerId = table.Column<Guid>(type: "uuid", nullable: true),
                    ProfessionKind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    NormalizedPrcLicenseNo = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    DisplayPrcLicenseNo = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PrcExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    FirstName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    LastName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Title = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    PrimarySpecialty = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    PublicBio = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    AvatarUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    CredentialsJson = table.Column<string>(type: "jsonb", nullable: true),
                    VerificationContact = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    VerificationStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false, defaultValue: "Unverified"),
                    LatestVerificationRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    VerifiedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    VerifiedByAdminUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
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
                    table.PrimaryKey("PK_Practitioners", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PractitionerAffiliations",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    PractitionerId = table.Column<Guid>(type: "uuid", nullable: false),
                    FacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicStaffMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    LocalDisplayName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    LocalSpecialty = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    AvailabilitiesJson = table.Column<string>(type: "jsonb", nullable: true),
                    AffiliationStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false, defaultValue: "Active"),
                    OptedInAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ConfirmedViaOtpAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    WithdrawnAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_PractitionerAffiliations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PractitionerAffiliations_Facilities_FacilityId",
                        column: x => x.FacilityId,
                        principalSchema: "public",
                        principalTable: "Facilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PractitionerAffiliations_Practitioners_PractitionerId",
                        column: x => x.PractitionerId,
                        principalSchema: "public",
                        principalTable: "Practitioners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PractitionerAffiliations_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "public",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PractitionerVerificationRequests",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    FacilityVerificationRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicStaffMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    PractitionerId = table.Column<Guid>(type: "uuid", nullable: true),
                    AffiliationId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubmissionNumber = table.Column<int>(type: "integer", nullable: false),
                    CorrelationId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RequestKind = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ProfessionKind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SubmittedPrcLicenseNo = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    NormalizedPrcLicenseNo = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PrcExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    SubmittedSnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                    PrcEvidenceObjectKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    VerificationContact = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    SubmittedByClinicUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    SubmittedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OtpTokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    OtpExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false, defaultValue: "PendingReview"),
                    WithdrawnAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    WithdrawnByActor = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    WithdrawalReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ReviewedByAdminUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ReviewedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewerNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
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
                    table.PrimaryKey("PK_PractitionerVerificationRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PractitionerVerificationRequests_Facilities_FacilityId",
                        column: x => x.FacilityId,
                        principalSchema: "public",
                        principalTable: "Facilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PractitionerVerificationRequests_FacilityVerificationReques~",
                        column: x => x.FacilityVerificationRequestId,
                        principalSchema: "public",
                        principalTable: "FacilityVerificationRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PractitionerVerificationRequests_PractitionerAffiliations_A~",
                        column: x => x.AffiliationId,
                        principalSchema: "public",
                        principalTable: "PractitionerAffiliations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PractitionerVerificationRequests_Practitioners_Practitioner~",
                        column: x => x.PractitionerId,
                        principalSchema: "public",
                        principalTable: "Practitioners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PractitionerVerificationRequests_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "public",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_WorkspaceMemberId_FacilityId",
                schema: "public",
                table: "StaffMembers",
                columns: new[] { "WorkspaceMemberId", "FacilityId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_PlatformVerificationStatus",
                schema: "public",
                table: "Facilities",
                column: "PlatformVerificationStatus");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityVerificationRequests_CorrelationId",
                schema: "public",
                table: "FacilityVerificationRequests",
                column: "CorrelationId");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityVerificationRequests_FacilityId_Status",
                schema: "public",
                table: "FacilityVerificationRequests",
                columns: new[] { "FacilityId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_FacilityVerificationRequests_TenantId_SubmittedAtUtc",
                schema: "public",
                table: "FacilityVerificationRequests",
                columns: new[] { "TenantId", "SubmittedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerAffiliations_AffiliationStatus",
                schema: "public",
                table: "PractitionerAffiliations",
                column: "AffiliationStatus");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerAffiliations_FacilityId_ClinicStaffMemberId",
                schema: "public",
                table: "PractitionerAffiliations",
                columns: new[] { "FacilityId", "ClinicStaffMemberId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerAffiliations_PractitionerId",
                schema: "public",
                table: "PractitionerAffiliations",
                column: "PractitionerId");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerAffiliations_TenantId",
                schema: "public",
                table: "PractitionerAffiliations",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_Practitioners_MergedIntoPractitionerId",
                schema: "public",
                table: "Practitioners",
                column: "MergedIntoPractitionerId");

            migrationBuilder.CreateIndex(
                name: "IX_Practitioners_ProfessionKind_NormalizedPrcLicenseNo",
                schema: "public",
                table: "Practitioners",
                columns: new[] { "ProfessionKind", "NormalizedPrcLicenseNo" },
                unique: true,
                filter: "\"MergedIntoPractitionerId\" IS NULL AND \"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Practitioners_VerificationStatus",
                schema: "public",
                table: "Practitioners",
                column: "VerificationStatus");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerVerificationRequests_AffiliationId",
                schema: "public",
                table: "PractitionerVerificationRequests",
                column: "AffiliationId");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerVerificationRequests_FacilityId_ClinicStaffMemb~",
                schema: "public",
                table: "PractitionerVerificationRequests",
                columns: new[] { "FacilityId", "ClinicStaffMemberId" });

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerVerificationRequests_FacilityVerificationReques~",
                schema: "public",
                table: "PractitionerVerificationRequests",
                column: "FacilityVerificationRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerVerificationRequests_OtpTokenHash",
                schema: "public",
                table: "PractitionerVerificationRequests",
                column: "OtpTokenHash");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerVerificationRequests_PractitionerId",
                schema: "public",
                table: "PractitionerVerificationRequests",
                column: "PractitionerId");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerVerificationRequests_ProfessionKind_NormalizedP~",
                schema: "public",
                table: "PractitionerVerificationRequests",
                columns: new[] { "ProfessionKind", "NormalizedPrcLicenseNo" });

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerVerificationRequests_Status",
                schema: "public",
                table: "PractitionerVerificationRequests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_PractitionerVerificationRequests_TenantId",
                schema: "public",
                table: "PractitionerVerificationRequests",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PractitionerVerificationRequests",
                schema: "public");

            migrationBuilder.DropTable(
                name: "FacilityVerificationRequests",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PractitionerAffiliations",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Practitioners",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_WorkspaceMemberId_FacilityId",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropIndex(
                name: "IX_Facilities_PlatformVerificationStatus",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LatestVerificationRequestId",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LtoEvidenceObjectKey",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "PlatformVerificationStatus",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "RejectionReason",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "VerifiedAtUtc",
                schema: "public",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "VerifiedByAdminUserId",
                schema: "public",
                table: "Facilities");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_WorkspaceMemberId",
                schema: "public",
                table: "StaffMembers",
                column: "WorkspaceMemberId",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }
    }
}
