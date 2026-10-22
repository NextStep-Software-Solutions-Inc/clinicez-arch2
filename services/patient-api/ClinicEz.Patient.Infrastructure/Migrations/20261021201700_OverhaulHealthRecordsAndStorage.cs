using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class OverhaulHealthRecordsAndStorage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_file_records_file_folders_folder_id",
                table: "file_records");

            migrationBuilder.DropTable(
                name: "file_folders");

            migrationBuilder.DropTable(
                name: "patient_storage_profiles");

            migrationBuilder.DropIndex(
                name: "ix_file_records_folder_id",
                table: "file_records");

            migrationBuilder.DropIndex(
                name: "ix_file_records_patient_id",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "folder_id",
                table: "file_records");

            migrationBuilder.AddColumn<string>(
                name: "encrypted_hash",
                table: "lab_result_reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "encrypted_size_bytes",
                table: "lab_result_reports",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "encryption_algorithm",
                table: "lab_result_reports",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "encryption_iv_base64",
                table: "lab_result_reports",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "encryption_tag_base64",
                table: "lab_result_reports",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "wrapped_key_json",
                table: "lab_result_reports",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "document_date",
                table: "file_records",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "facility_name",
                table: "file_records",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "notes",
                table: "file_records",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "title",
                table: "file_records",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "ix_file_records_patient_id_document_date",
                table: "file_records",
                columns: new[] { "patient_id", "document_date" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_file_records_patient_id_document_date",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "encrypted_hash",
                table: "lab_result_reports");

            migrationBuilder.DropColumn(
                name: "encrypted_size_bytes",
                table: "lab_result_reports");

            migrationBuilder.DropColumn(
                name: "encryption_algorithm",
                table: "lab_result_reports");

            migrationBuilder.DropColumn(
                name: "encryption_iv_base64",
                table: "lab_result_reports");

            migrationBuilder.DropColumn(
                name: "encryption_tag_base64",
                table: "lab_result_reports");

            migrationBuilder.DropColumn(
                name: "wrapped_key_json",
                table: "lab_result_reports");

            migrationBuilder.DropColumn(
                name: "document_date",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "facility_name",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "notes",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "title",
                table: "file_records");

            migrationBuilder.AddColumn<Guid>(
                name: "folder_id",
                table: "file_records",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "file_folders",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_id = table.Column<Guid>(type: "uuid", nullable: true),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    sync_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    sync_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_file_folders", x => x.id);
                    table.ForeignKey(
                        name: "fk_file_folders_file_folders_parent_id",
                        column: x => x.parent_id,
                        principalTable: "file_folders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_file_folders_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_storage_profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true),
                    encrypted_mak = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    quota_bytes = table.Column<long>(type: "bigint", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    used_bytes = table.Column<long>(type: "bigint", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_storage_profiles", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_storage_profiles_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_file_records_folder_id",
                table: "file_records",
                column: "folder_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_records_patient_id",
                table: "file_records",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_folders_parent_id",
                table: "file_folders",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_folders_patient_id",
                table: "file_folders",
                column: "patient_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_storage_profiles_patient_id",
                table: "patient_storage_profiles",
                column: "patient_id",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_file_records_file_folders_folder_id",
                table: "file_records",
                column: "folder_id",
                principalTable: "file_folders",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
