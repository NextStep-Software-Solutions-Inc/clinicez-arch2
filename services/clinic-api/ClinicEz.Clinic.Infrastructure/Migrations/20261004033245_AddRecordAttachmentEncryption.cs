using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRecordAttachmentEncryption : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EncryptedHash",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "EncryptedSizeBytes",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EncryptionAlgorithm",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "AES-256-GCM");

            migrationBuilder.AddColumn<string>(
                name: "EncryptionIvBase64",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EncryptionKeyId",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EncryptionTagBase64",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WrappedKeyJson",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthDrugCode",
                schema: "clinic_dashboard",
                table: "Prescriptions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthCaseNo",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthEnlistmentNo",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthProfilingTransNo",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthServiceCode",
                schema: "clinic_dashboard",
                table: "LabOrderItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsYakapEligible",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthCaseNo",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthOtherComplaint",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthPainSite",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthSignSympCode",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthSoapTransNo",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "AccreditationNumber",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPhilHealthConfigured",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "KonsultaEndpoint",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaperSize",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PmccNumber",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrimaryColorHex",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PrimaryLogoUrl",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SoftwareCertificateId",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PhilHealthSequenceTrackers",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    SequenceType = table.Column<string>(type: "character varying(50)", nullable: false),
                    EffectiveYear = table.Column<string>(type: "text", nullable: false),
                    CurrentSequence = table.Column<int>(type: "integer", nullable: false),
                    LastAssignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
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
                    table.PrimaryKey("PK_PhilHealthSequenceTrackers", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PhilHealthSequenceTrackers",
                schema: "clinic_dashboard");

            migrationBuilder.DropColumn(
                name: "EncryptedHash",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "EncryptedSizeBytes",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "EncryptionAlgorithm",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "EncryptionIvBase64",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "EncryptionKeyId",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "EncryptionTagBase64",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "WrappedKeyJson",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "PhilHealthDrugCode",
                schema: "clinic_dashboard",
                table: "Prescriptions");

            migrationBuilder.DropColumn(
                name: "PhilHealthCaseNo",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "PhilHealthEnlistmentNo",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "PhilHealthProfilingTransNo",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "PhilHealthServiceCode",
                schema: "clinic_dashboard",
                table: "LabOrderItems");

            migrationBuilder.DropColumn(
                name: "IsYakapEligible",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "PhilHealthCaseNo",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "PhilHealthOtherComplaint",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "PhilHealthPainSite",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "PhilHealthSignSympCode",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "PhilHealthSoapTransNo",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "IsPhilHealthConfigured",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "KonsultaEndpoint",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "PaperSize",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "PmccNumber",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "PrimaryColorHex",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "PrimaryLogoUrl",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "SoftwareCertificateId",
                schema: "clinic_dashboard",
                table: "ClinicSettings");

            migrationBuilder.AlterColumn<string>(
                name: "AccreditationNumber",
                schema: "clinic_dashboard",
                table: "ClinicSettings",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100,
                oldNullable: true);
        }
    }
}
