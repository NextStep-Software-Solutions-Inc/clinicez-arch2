using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AbolishYakapV1AndAddScreeningLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PhilHealthSequenceTrackers",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "BranchKonsultaEndpoint",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "KonsultaEndpoint",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "EnlistmentTransDate",
                schema: "public",
                table: "PatientYakapEnlistments");

            migrationBuilder.DropColumn(
                name: "EnlistmentTransNo",
                schema: "public",
                table: "PatientYakapEnlistments");

            migrationBuilder.AddColumn<Guid>(
                name: "PatientIdentityVerificationId",
                schema: "public",
                table: "HealthScreenings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "YakapSubmissionId",
                schema: "public",
                table: "HealthScreenings",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_PatientIdentityVerificationId",
                schema: "public",
                table: "HealthScreenings",
                column: "PatientIdentityVerificationId");

            migrationBuilder.CreateIndex(
                name: "IX_HealthScreenings_YakapSubmissionId",
                schema: "public",
                table: "HealthScreenings",
                column: "YakapSubmissionId");

            migrationBuilder.AddForeignKey(
                name: "FK_HealthScreenings_PatientIdentityVerifications_PatientIdenti~",
                schema: "public",
                table: "HealthScreenings",
                column: "PatientIdentityVerificationId",
                principalSchema: "public",
                principalTable: "PatientIdentityVerifications",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_HealthScreenings_YakapSubmissions_YakapSubmissionId",
                schema: "public",
                table: "HealthScreenings",
                column: "YakapSubmissionId",
                principalSchema: "public",
                principalTable: "YakapSubmissions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.Sql("""
                UPDATE public."PatientYakapEnlistments"
                SET "Source" = 'AssistedIntake'
                WHERE "Source" IN ('ClinicEnlistment', 'SelfReported');

                UPDATE public."PatientYakapEnlistments"
                SET "PackageType" = 'YakapPrimaryCare'
                WHERE "PackageType" = 'Konsulta';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_HealthScreenings_PatientIdentityVerifications_PatientIdenti~",
                schema: "public",
                table: "HealthScreenings");

            migrationBuilder.DropForeignKey(
                name: "FK_HealthScreenings_YakapSubmissions_YakapSubmissionId",
                schema: "public",
                table: "HealthScreenings");

            migrationBuilder.DropIndex(
                name: "IX_HealthScreenings_PatientIdentityVerificationId",
                schema: "public",
                table: "HealthScreenings");

            migrationBuilder.DropIndex(
                name: "IX_HealthScreenings_YakapSubmissionId",
                schema: "public",
                table: "HealthScreenings");

            migrationBuilder.DropColumn(
                name: "PatientIdentityVerificationId",
                schema: "public",
                table: "HealthScreenings");

            migrationBuilder.DropColumn(
                name: "YakapSubmissionId",
                schema: "public",
                table: "HealthScreenings");

            migrationBuilder.AddColumn<string>(
                name: "BranchKonsultaEndpoint",
                schema: "public",
                table: "Settings",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "KonsultaEndpoint",
                schema: "public",
                table: "Settings",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "EnlistmentTransDate",
                schema: "public",
                table: "PatientYakapEnlistments",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnlistmentTransNo",
                schema: "public",
                table: "PatientYakapEnlistments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PhilHealthSequenceTrackers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    CurrentSequence = table.Column<int>(type: "integer", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    EffectiveYear = table.Column<string>(type: "text", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    LastAssignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SequenceType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhilHealthSequenceTrackers", x => x.Id);
                });
        }
    }
}
