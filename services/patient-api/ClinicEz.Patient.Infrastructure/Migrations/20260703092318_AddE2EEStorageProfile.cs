using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddE2EEStorageProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "encrypted_hash",
                table: "file_records",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "encrypted_size_bytes",
                table: "file_records",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "encryption_algorithm",
                table: "file_records",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "wrapped_key_json",
                table: "file_records",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "patient_storage_profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    encrypted_mak = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    quota_bytes = table.Column<long>(type: "bigint", nullable: false),
                    used_bytes = table.Column<long>(type: "bigint", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
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
                name: "ix_patient_storage_profiles_patient_id",
                table: "patient_storage_profiles",
                column: "patient_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "patient_storage_profiles");

            migrationBuilder.DropColumn(
                name: "encrypted_hash",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "encrypted_size_bytes",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "encryption_algorithm",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "wrapped_key_json",
                table: "file_records");
        }
    }
}
