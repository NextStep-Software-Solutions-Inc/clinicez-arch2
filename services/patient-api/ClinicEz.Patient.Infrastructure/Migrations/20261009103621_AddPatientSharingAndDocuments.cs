using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientSharingAndDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "consultation_id",
                table: "prescriptions",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "brand_name",
                table: "prescriptions",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "form",
                table: "prescriptions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "prescription_document_id",
                table: "prescriptions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "prescriptions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "clinic_ez_id",
                table: "patients",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            // Existing patients get a random, unique ClinicEzId before the unique index is created.
            migrationBuilder.Sql(@"
DO $$
DECLARE
    patient RECORD;
    candidate text;
    hash text;
BEGIN
    FOR patient IN SELECT id FROM patients WHERE clinic_ez_id = '' LOOP
        LOOP
            hash := md5(random()::text || clock_timestamp()::text || patient.id::text);
            candidate := 'CE-' || upper(substr(hash, 1, 4)) || '-' || upper(substr(hash, 5, 4));
            EXIT WHEN NOT EXISTS (SELECT 1 FROM patients WHERE clinic_ez_id = candidate);
        END LOOP;
        UPDATE patients SET clinic_ez_id = candidate WHERE id = patient.id;
    END LOOP;
END $$;");
            migrationBuilder.AddColumn<string>(
                name: "flag",
                table: "lab_results",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "lab_result_report_id",
                table: "lab_results",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "panel",
                table: "lab_results",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "lab_request_slips",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requisition_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ordering_tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ordering_facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ordering_facility_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    accession_number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    urgency = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    items_json = table.Column<string>(type: "text", nullable: false),
                    stage = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    stage_changed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    quoted_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    payment_required = table.Column<bool>(type: "boolean", nullable: false),
                    laboratory_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    claim_token = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    has_details = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_lab_request_slips", x => x.id);
                    table.ForeignKey(
                        name: "fk_lab_request_slips_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "lab_result_reports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    report_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requisition_id = table.Column<Guid>(type: "uuid", nullable: true),
                    laboratory_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    impression = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    is_critical = table.Column<bool>(type: "boolean", nullable: false),
                    resulted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    source = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    verification = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    reviewed_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    reviewed_by_prc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    review_remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    file_storage_key = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    file_name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: true),
                    file_content_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_lab_result_reports", x => x.id);
                    table.ForeignKey(
                        name: "fk_lab_result_reports_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "medical_certificates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    certificate_id = table.Column<Guid>(type: "uuid", nullable: false),
                    certificate_number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    issuer_tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    issuer_facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    issuer_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    doctor_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    doctor_prc_license = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    doctor_ptr_number = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    purpose = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    diagnosis = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    rest_days = table.Column<int>(type: "integer", nullable: true),
                    valid_from = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    valid_to = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    verification_token = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    verification_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_medical_certificates", x => x.id);
                    table.ForeignKey(
                        name: "fk_medical_certificates_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_access_grants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    facility_id = table.Column<Guid>(type: "uuid", nullable: false),
                    scopes_mask = table.Column<int>(type: "integer", nullable: false),
                    purpose = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    draft_id = table.Column<Guid>(type: "uuid", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_access_grants", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_access_grants_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "prescription_documents",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    prescription_id = table.Column<Guid>(type: "uuid", nullable: false),
                    prescription_number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    ordering_tenant_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ordering_facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ordering_facility_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    prescriber_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    prescriber_prc_license = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    diagnosis = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    instructions = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    stage = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    stage_changed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    quoted_amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    pharmacy_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    claim_token = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    verification_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    receipt_number = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    dispensed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    external_pharmacy_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    has_details = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_prescription_documents", x => x.id);
                    table.ForeignKey(
                        name: "fk_prescription_documents_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "share_token_uses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    grant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_share_token_uses", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "patient_access_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    grant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    action = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    detail = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_access_logs", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_access_logs_patient_access_grants_grant_id",
                        column: x => x.grant_id,
                        principalTable: "patient_access_grants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_patient_access_logs_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_prescriptions_prescription_document_id",
                table: "prescriptions",
                column: "prescription_document_id");

            migrationBuilder.CreateIndex(
                name: "ix_patients_clinic_ez_id",
                table: "patients",
                column: "clinic_ez_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_lab_results_lab_result_report_id",
                table: "lab_results",
                column: "lab_result_report_id");

            migrationBuilder.CreateIndex(
                name: "ix_lab_request_slips_patient_id_requisition_id",
                table: "lab_request_slips",
                columns: new[] { "patient_id", "requisition_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_lab_result_reports_patient_id_report_id",
                table: "lab_result_reports",
                columns: new[] { "patient_id", "report_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_lab_result_reports_patient_id_requisition_id",
                table: "lab_result_reports",
                columns: new[] { "patient_id", "requisition_id" });

            migrationBuilder.CreateIndex(
                name: "ix_medical_certificates_patient_id_certificate_id",
                table: "medical_certificates",
                columns: new[] { "patient_id", "certificate_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_access_grants_patient_id_created_at",
                table: "patient_access_grants",
                columns: new[] { "patient_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_access_grants_patient_id_tenant_id_facility_id",
                table: "patient_access_grants",
                columns: new[] { "patient_id", "tenant_id", "facility_id" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_access_logs_grant_id",
                table: "patient_access_logs",
                column: "grant_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_access_logs_patient_id_created_at",
                table: "patient_access_logs",
                columns: new[] { "patient_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_prescription_documents_patient_id_prescription_id",
                table: "prescription_documents",
                columns: new[] { "patient_id", "prescription_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_share_token_uses_token_id",
                table: "share_token_uses",
                column: "token_id",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_lab_results_lab_result_reports_lab_result_report_id",
                table: "lab_results",
                column: "lab_result_report_id",
                principalTable: "lab_result_reports",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_prescriptions_prescription_documents_prescription_document_",
                table: "prescriptions",
                column: "prescription_document_id",
                principalTable: "prescription_documents",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_lab_results_lab_result_reports_lab_result_report_id",
                table: "lab_results");

            migrationBuilder.DropForeignKey(
                name: "fk_prescriptions_prescription_documents_prescription_document_",
                table: "prescriptions");

            migrationBuilder.DropTable(
                name: "lab_request_slips");

            migrationBuilder.DropTable(
                name: "lab_result_reports");

            migrationBuilder.DropTable(
                name: "medical_certificates");

            migrationBuilder.DropTable(
                name: "patient_access_logs");

            migrationBuilder.DropTable(
                name: "prescription_documents");

            migrationBuilder.DropTable(
                name: "share_token_uses");

            migrationBuilder.DropTable(
                name: "patient_access_grants");

            migrationBuilder.DropIndex(
                name: "ix_prescriptions_prescription_document_id",
                table: "prescriptions");

            migrationBuilder.DropIndex(
                name: "ix_patients_clinic_ez_id",
                table: "patients");

            migrationBuilder.DropIndex(
                name: "ix_lab_results_lab_result_report_id",
                table: "lab_results");

            migrationBuilder.DropColumn(
                name: "brand_name",
                table: "prescriptions");

            migrationBuilder.DropColumn(
                name: "form",
                table: "prescriptions");

            migrationBuilder.DropColumn(
                name: "prescription_document_id",
                table: "prescriptions");

            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "prescriptions");

            migrationBuilder.DropColumn(
                name: "clinic_ez_id",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "flag",
                table: "lab_results");

            migrationBuilder.DropColumn(
                name: "lab_result_report_id",
                table: "lab_results");

            migrationBuilder.DropColumn(
                name: "panel",
                table: "lab_results");

            migrationBuilder.AlterColumn<Guid>(
                name: "consultation_id",
                table: "prescriptions",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
