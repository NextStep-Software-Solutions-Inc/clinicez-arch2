using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDirectoryVerificationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AffiliatedVerifiedClinicCount",
                schema: "public",
                table: "StaffMembers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "AvatarUrl",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CanonicalProviderId",
                schema: "public",
                table: "StaffMembers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDirectoryOptIn",
                schema: "public",
                table: "StaffMembers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PrcEvidenceObjectKey",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "PrcExpiryDate",
                schema: "public",
                table: "StaffMembers",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicBio",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicVerificationReason",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicVerificationStatus",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Unverified");

            migrationBuilder.AddColumn<string>(
                name: "VerificationContact",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastVerificationSubmittedAtUtc",
                schema: "public",
                table: "Settings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LtoEvidenceObjectKey",
                schema: "public",
                table: "Settings",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlatformVerificationStatus",
                schema: "public",
                table: "Settings",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Unverified");

            migrationBuilder.AddColumn<string>(
                name: "VerificationRejectionReason",
                schema: "public",
                table: "Settings",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AffiliatedVerifiedClinicCount",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "AvatarUrl",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "CanonicalProviderId",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "IsDirectoryOptIn",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "PrcEvidenceObjectKey",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "PrcExpiryDate",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "PublicBio",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "PublicVerificationReason",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "PublicVerificationStatus",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "VerificationContact",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "LastVerificationSubmittedAtUtc",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "LtoEvidenceObjectKey",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "PlatformVerificationStatus",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "VerificationRejectionReason",
                schema: "public",
                table: "Settings");
        }
    }
}
