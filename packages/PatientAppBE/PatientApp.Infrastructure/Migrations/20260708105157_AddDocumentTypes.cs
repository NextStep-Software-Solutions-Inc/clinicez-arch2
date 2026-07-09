using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace PatientApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "category",
                table: "file_records");

            migrationBuilder.AddColumn<Guid>(
                name: "document_type_id",
                table: "file_records",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "document_types",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    supported_extensions_json = table.Column<string>(type: "text", nullable: false),
                    supported_mime_types_json = table.Column<string>(type: "text", nullable: false),
                    native_preview_kind = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_document_types", x => x.id);
                });

            migrationBuilder.InsertData(
                table: "document_types",
                columns: new[] { "id", "code", "created_at", "created_by", "deleted_at", "deleted_by", "description", "is_active", "is_deleted", "label", "native_preview_kind", "sort_order", "supported_extensions_json", "supported_mime_types_json", "updated_at", "updated_by" },
                values: new object[,]
                {
                    { new Guid("11111111-1111-1111-1111-111111111111"), "xray", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Radiology images and x-ray reports.", true, false, "X-ray", "image", 10, "[\"jpg\",\"jpeg\",\"png\",\"pdf\",\"dcm\"]", "[\"image/*\",\"application/pdf\"]", null, null },
                    { new Guid("22222222-2222-2222-2222-222222222222"), "lab-result", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Laboratory result PDFs or images.", true, false, "Lab result", "pdf", 20, "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", "[\"application/pdf\",\"image/*\"]", null, null },
                    { new Guid("33333333-3333-3333-3333-333333333333"), "medical-certificate", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Medical certificates and fit-to-work documents.", true, false, "Medical certificate", "pdf", 30, "[\"pdf\",\"jpg\",\"jpeg\",\"png\",\"doc\",\"docx\"]", "[\"application/pdf\",\"image/*\",\"application/msword\"]", null, null },
                    { new Guid("44444444-4444-4444-4444-444444444444"), "prescription", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Prescription scans, images, and PDFs.", true, false, "Prescription", "pdf", 40, "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", "[\"application/pdf\",\"image/*\"]", null, null },
                    { new Guid("55555555-5555-5555-5555-555555555555"), "id", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "IDs and identity verification documents.", true, false, "Government ID", "image", 50, "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", "[\"application/pdf\",\"image/*\"]", null, null },
                    { new Guid("66666666-6666-6666-6666-666666666666"), "other", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "system", null, null, "Any other medical documents.", true, false, "Other medical file", "external", 999, "[\"pdf\",\"jpg\",\"jpeg\",\"png\"]", "[\"application/pdf\",\"image/*\"]", null, null }
                });

            migrationBuilder.CreateIndex(
                name: "ix_file_records_document_type_id",
                table: "file_records",
                column: "document_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_document_types_code",
                table: "document_types",
                column: "code",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_file_records_document_types_document_type_id",
                table: "file_records",
                column: "document_type_id",
                principalTable: "document_types",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_file_records_document_types_document_type_id",
                table: "file_records");

            migrationBuilder.DropTable(
                name: "document_types");

            migrationBuilder.DropIndex(
                name: "ix_file_records_document_type_id",
                table: "file_records");

            migrationBuilder.DropColumn(
                name: "document_type_id",
                table: "file_records");

            migrationBuilder.AddColumn<string>(
                name: "category",
                table: "file_records",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "");
        }
    }
}
