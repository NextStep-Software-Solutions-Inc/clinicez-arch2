using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCashierModeAndDefaultSignatureMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultSignatureMode",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SignatureSpecimen",
                schema: "public",
                table: "StaffMembers",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityDigest",
                schema: "public",
                table: "ReferralLetters",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityDigest",
                schema: "public",
                table: "MedicalCertificates",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CashierMode",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "ClinicDesk");

            migrationBuilder.AddColumn<string>(
                name: "LetterheadDohLto",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReferralLetters_TenantId_ClinicId_SecurityDigest",
                schema: "public",
                table: "ReferralLetters",
                columns: new[] { "TenantId", "ClinicId", "SecurityDigest" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalCertificates_TenantId_ClinicId_SecurityDigest",
                schema: "public",
                table: "MedicalCertificates",
                columns: new[] { "TenantId", "ClinicId", "SecurityDigest" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ReferralLetters_TenantId_ClinicId_SecurityDigest",
                schema: "public",
                table: "ReferralLetters");

            migrationBuilder.DropIndex(
                name: "IX_MedicalCertificates_TenantId_ClinicId_SecurityDigest",
                schema: "public",
                table: "MedicalCertificates");

            migrationBuilder.DropColumn(
                name: "DefaultSignatureMode",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "SignatureSpecimen",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "SecurityDigest",
                schema: "public",
                table: "ReferralLetters");

            migrationBuilder.DropColumn(
                name: "SecurityDigest",
                schema: "public",
                table: "MedicalCertificates");

            migrationBuilder.DropColumn(
                name: "CashierMode",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "LetterheadDohLto",
                schema: "public",
                table: "ClinicSettings");
        }
    }
}
