using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTeleconsultRecordingAndPaymentGate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "TeleconsultAutoExemptYakap",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "TeleconsultDefaultFee",
                schema: "public",
                table: "ClinicSettings",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "TeleconsultPaymentPolicy",
                schema: "public",
                table: "ClinicSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "TeleconsultRecordingConsentRequired",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "TeleconsultRecordingPolicy",
                schema: "public",
                table: "ClinicSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "TeleconsultRecordingRetentionDays",
                schema: "public",
                table: "ClinicSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "AdmittedAtUtc",
                schema: "public",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AdmittedByDoctorId",
                schema: "public",
                table: "Appointments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AppointmentType",
                schema: "public",
                table: "Appointments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "CallId",
                schema: "public",
                table: "Appointments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EmergencyOverrideAtUtc",
                schema: "public",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "EmergencyOverrideDoctorId",
                schema: "public",
                table: "Appointments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmergencyOverrideDoctorName",
                schema: "public",
                table: "Appointments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmergencyOverrideReasonCode",
                schema: "public",
                table: "Appointments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmergencyOverrideReasonNote",
                schema: "public",
                table: "Appointments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InvoiceId",
                schema: "public",
                table: "Appointments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InvoiceRequestId",
                schema: "public",
                table: "Appointments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsEmergencyOverride",
                schema: "public",
                table: "Appointments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "PaidAmount",
                schema: "public",
                table: "Appointments",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PaidAt",
                schema: "public",
                table: "Appointments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentMethod",
                schema: "public",
                table: "Appointments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentPolicy",
                schema: "public",
                table: "Appointments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PaymentReceiptNumber",
                schema: "public",
                table: "Appointments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentStatus",
                schema: "public",
                table: "Appointments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "teleconsult_recording_sessions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    CallId = table.Column<Guid>(type: "uuid", nullable: false),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ConsentStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ClinicianConsentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PatientConsentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PatientConsentIpAddress = table.Column<string>(type: "text", nullable: true),
                    PatientConsentUserAgent = table.Column<string>(type: "text", nullable: true),
                    RejectionReason = table.Column<string>(type: "text", nullable: true),
                    RecordingState = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StoragePolicy = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StoppedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TotalDurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    SegmentCount = table.Column<int>(type: "integer", nullable: false),
                    TotalSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    ContainerFormat = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ManifestStorageKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    EncryptionAlgorithm = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    EncryptionKeyId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    HasGaps = table.Column<bool>(type: "boolean", nullable: false),
                    RetentionPolicyDays = table.Column<int>(type: "integer", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsLegalHold = table.Column<bool>(type: "boolean", nullable: false),
                    LegalHoldReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    LegalHoldPlacedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LegalHoldPlacedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    LegalHoldPlacedByStaffName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    IsPurged = table.Column<bool>(type: "boolean", nullable: false),
                    PurgedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PurgedBy = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
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
                    table.PrimaryKey("PK_teleconsult_recording_sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_teleconsult_recording_sessions_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalSchema: "public",
                        principalTable: "Appointments",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_teleconsult_recording_sessions_Consultations_ConsultationId",
                        column: x => x.ConsultationId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "teleconsult_recording_segments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SegmentIndex = table.Column<int>(type: "integer", nullable: false),
                    DurationMs = table.Column<int>(type: "integer", nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Sha256Checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IvBase64 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TagBase64 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
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
                    table.PrimaryKey("PK_teleconsult_recording_segments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_teleconsult_recording_segments_teleconsult_recording_sessio~",
                        column: x => x.SessionId,
                        principalSchema: "public",
                        principalTable: "teleconsult_recording_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_teleconsult_recording_segments_SessionId_SegmentIndex",
                schema: "public",
                table: "teleconsult_recording_segments",
                columns: new[] { "SessionId", "SegmentIndex" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_teleconsult_recording_sessions_AppointmentId",
                schema: "public",
                table: "teleconsult_recording_sessions",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_teleconsult_recording_sessions_ClinicId_CallId",
                schema: "public",
                table: "teleconsult_recording_sessions",
                columns: new[] { "ClinicId", "CallId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_teleconsult_recording_sessions_ClinicId_ConsultationId",
                schema: "public",
                table: "teleconsult_recording_sessions",
                columns: new[] { "ClinicId", "ConsultationId" });

            migrationBuilder.CreateIndex(
                name: "IX_teleconsult_recording_sessions_ClinicId_PatientId",
                schema: "public",
                table: "teleconsult_recording_sessions",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_teleconsult_recording_sessions_ConsultationId",
                schema: "public",
                table: "teleconsult_recording_sessions",
                column: "ConsultationId");

            migrationBuilder.CreateIndex(
                name: "IX_teleconsult_recording_sessions_ExpiresAtUtc",
                schema: "public",
                table: "teleconsult_recording_sessions",
                column: "ExpiresAtUtc",
                filter: "\"IsPurged\" = false AND \"IsLegalHold\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "teleconsult_recording_segments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "teleconsult_recording_sessions",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "TeleconsultAutoExemptYakap",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "TeleconsultDefaultFee",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "TeleconsultPaymentPolicy",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "TeleconsultRecordingConsentRequired",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "TeleconsultRecordingPolicy",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "TeleconsultRecordingRetentionDays",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "AdmittedAtUtc",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "AdmittedByDoctorId",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "AppointmentType",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "CallId",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "EmergencyOverrideAtUtc",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "EmergencyOverrideDoctorId",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "EmergencyOverrideDoctorName",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "EmergencyOverrideReasonCode",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "EmergencyOverrideReasonNote",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "InvoiceId",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "InvoiceRequestId",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "IsEmergencyOverride",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PaidAmount",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PaidAt",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PaymentMethod",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PaymentPolicy",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PaymentReceiptNumber",
                schema: "public",
                table: "Appointments");

            migrationBuilder.DropColumn(
                name: "PaymentStatus",
                schema: "public",
                table: "Appointments");
        }
    }
}
