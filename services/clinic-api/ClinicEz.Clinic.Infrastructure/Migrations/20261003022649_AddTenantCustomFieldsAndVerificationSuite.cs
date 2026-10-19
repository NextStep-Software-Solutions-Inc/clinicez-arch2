using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantCustomFieldsAndVerificationSuite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RejectionReason",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerificationStatus",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Verified");

            migrationBuilder.AddColumn<DateTime>(
                name: "VerifiedAt",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "VerifiedByStaffId",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerifiedByStaffName",
                schema: "clinic_dashboard",
                table: "RecordAttachments",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomFields",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "VerificationStatus",
                schema: "clinic_dashboard",
                table: "Patients",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Verified");

            migrationBuilder.CreateTable(
                name: "CustomFieldDefinitions",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    EntityType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FieldKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Label = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DataType = table.Column<string>(type: "character varying(50)", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsRequired = table.Column<bool>(type: "boolean", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    OptionsJson = table.Column<string>(type: "text", nullable: true),
                    Placeholder = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_CustomFieldDefinitions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey",
                schema: "clinic_dashboard",
                table: "CustomFieldDefinitions",
                columns: new[] { "TenantId", "ClinicId", "EntityType", "FieldKey" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomFieldDefinitions",
                schema: "clinic_dashboard");

            migrationBuilder.DropColumn(
                name: "RejectionReason",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "VerificationStatus",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "VerifiedAt",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "VerifiedByStaffId",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "VerifiedByStaffName",
                schema: "clinic_dashboard",
                table: "RecordAttachments");

            migrationBuilder.DropColumn(
                name: "CustomFields",
                schema: "clinic_dashboard",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "VerificationStatus",
                schema: "clinic_dashboard",
                table: "Patients");
        }
    }
}
