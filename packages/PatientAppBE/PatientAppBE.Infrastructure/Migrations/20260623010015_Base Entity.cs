using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PatientAppBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class BaseEntity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "attached_file_ids_json",
                table: "booking_drafts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "attached_file_ids_json",
                table: "appointments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "chief_complaint",
                table: "appointments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "subject",
                table: "appointments",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "provider_availabilities",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clinic_healthcare_provider_id = table.Column<Guid>(type: "uuid", nullable: false),
                    day_of_week = table.Column<int>(type: "integer", nullable: false),
                    start_time = table.Column<TimeSpan>(type: "interval", nullable: false),
                    end_time = table.Column<TimeSpan>(type: "interval", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("pk_provider_availabilities", x => x.id);
                    table.ForeignKey(
                        name: "fk_provider_availabilities_clinic_healthcare_providers_clinic_",
                        column: x => x.clinic_healthcare_provider_id,
                        principalTable: "clinic_healthcare_providers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_provider_availabilities_clinic_healthcare_provider_id",
                table: "provider_availabilities",
                column: "clinic_healthcare_provider_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "provider_availabilities");

            migrationBuilder.DropColumn(
                name: "attached_file_ids_json",
                table: "booking_drafts");

            migrationBuilder.DropColumn(
                name: "attached_file_ids_json",
                table: "appointments");

            migrationBuilder.DropColumn(
                name: "chief_complaint",
                table: "appointments");

            migrationBuilder.DropColumn(
                name: "subject",
                table: "appointments");
        }
    }
}
