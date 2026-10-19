using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkspaceSettingsAndRemoveFacilityLetterhead : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The portal copy of facility letterhead/logo/stamp was never consumed by any facility
            // service; clinic ClinicSettings is the single source of truth. Before dropping the
            // duplicate columns, preserve any manually-entered portal values the clinic does not
            // have yet. Values equal to the old auto-seed (name / address / contact) are skipped so
            // generated text never overrides what a clinic prints. Best effort: a missing clinic
            // schema (other deployment topology) or any error only raises a warning.
            migrationBuilder.Sql(@"
DO $$
BEGIN
    IF to_regclass('clinic_dashboard.""ClinicSettings""') IS NOT NULL THEN
        UPDATE clinic_dashboard.""ClinicSettings"" cs SET
            ""LetterheadHeader"" = CASE
                WHEN COALESCE(cs.""LetterheadHeader"", '') = ''
                     AND COALESCE(f.""LetterheadHeader"", '') <> ''
                     AND f.""LetterheadHeader"" <> UPPER(f.""Name"")
                THEN f.""LetterheadHeader"" ELSE cs.""LetterheadHeader"" END,
            ""LetterheadSubHeader"" = CASE
                WHEN COALESCE(cs.""LetterheadSubHeader"", '') = ''
                     AND COALESCE(f.""LetterheadSubHeader"", '') <> ''
                THEN f.""LetterheadSubHeader"" ELSE cs.""LetterheadSubHeader"" END,
            ""LetterheadAddress"" = CASE
                WHEN COALESCE(cs.""LetterheadAddress"", '') = ''
                     AND COALESCE(f.""LetterheadAddress"", '') <> ''
                     AND f.""LetterheadAddress"" <> concat_ws(', ',
                         NULLIF(f.""StreetAddress"", ''), NULLIF(f.""Barangay"", ''),
                         NULLIF(f.""City"", ''), NULLIF(f.""Province"", ''))
                THEN f.""LetterheadAddress"" ELSE cs.""LetterheadAddress"" END,
            ""LetterheadContact"" = CASE
                WHEN COALESCE(cs.""LetterheadContact"", '') = ''
                     AND COALESCE(f.""LetterheadContact"", '') <> ''
                     AND f.""LetterheadContact"" <> COALESCE(f.""ContactNumber"", '')
                THEN f.""LetterheadContact"" ELSE cs.""LetterheadContact"" END,
            ""LetterheadFooter"" = CASE
                WHEN COALESCE(cs.""LetterheadFooter"", '') = ''
                     AND COALESCE(f.""LetterheadFooter"", '') <> ''
                THEN f.""LetterheadFooter"" ELSE cs.""LetterheadFooter"" END,
            ""PrimaryLogoUrl"" = CASE
                WHEN COALESCE(cs.""PrimaryLogoUrl"", '') = ''
                     AND COALESCE(f.""LogoUrl"", '') <> ''
                THEN f.""LogoUrl"" ELSE cs.""PrimaryLogoUrl"" END
        FROM main.""Facilities"" f
        WHERE cs.""ClinicId"" = f.""Id"";
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Workspace settings migration: letterhead backfill skipped: %', SQLERRM;
END
$$;");

            migrationBuilder.DropColumn(
                name: "LetterheadAddress",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadContact",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadFooter",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadHeader",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LetterheadSubHeader",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LogoUrl",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StampPhysicianName",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StampPrcLicense",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StampPtrNumber",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "StampS2License",
                schema: "main",
                table: "Facilities");

            migrationBuilder.CreateTable(
                name: "WorkspaceAuditEntries",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ActorName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Section = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Action = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ChangesJson = table.Column<string>(type: "jsonb", nullable: false),
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
                    table.PrimaryKey("PK_WorkspaceAuditEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkspaceAuditEntries_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkspaceSettings",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TimeZoneId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Locale = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DateFormat = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CurrencyCode = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
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
                    table.PrimaryKey("PK_WorkspaceSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkspaceSettings_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceAuditEntries_TenantId_CreatedAt",
                schema: "main",
                table: "WorkspaceAuditEntries",
                columns: new[] { "TenantId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceSettings_TenantId",
                schema: "main",
                table: "WorkspaceSettings",
                column: "TenantId",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WorkspaceAuditEntries",
                schema: "main");

            migrationBuilder.DropTable(
                name: "WorkspaceSettings",
                schema: "main");

            migrationBuilder.AddColumn<string>(
                name: "LetterheadAddress",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadContact",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadFooter",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadHeader",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LetterheadSubHeader",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoUrl",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StampPhysicianName",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StampPrcLicense",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StampPtrNumber",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StampS2License",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);
        }
    }
}
