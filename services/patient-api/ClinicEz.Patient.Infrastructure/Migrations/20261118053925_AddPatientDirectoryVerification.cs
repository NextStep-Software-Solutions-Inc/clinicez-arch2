using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientDirectoryVerification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_platform_verified",
                table: "clinics",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "affiliation_status",
                table: "clinic_healthcare_providers",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Active");

            migrationBuilder.AddColumn<bool>(
                name: "has_identity_conflict",
                table: "clinic_healthcare_providers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_directory_opt_in",
                table: "clinic_healthcare_providers",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "normalized_license_no",
                table: "clinic_healthcare_providers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "practitioner_id",
                table: "clinic_healthcare_providers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "role",
                table: "clinic_healthcare_providers",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Doctor");

            migrationBuilder.AddColumn<Guid>(
                name: "provider_id",
                table: "booking_drafts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "provider_name",
                table: "booking_drafts",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "practitioners",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    merged_into_practitioner_id = table.Column<Guid>(type: "uuid", nullable: true),
                    profession_kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    normalized_prc_license_no = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    display_prc_license_no = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    prc_expiry_date = table.Column<DateOnly>(type: "date", nullable: true),
                    verification_level = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    first_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    last_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    primary_specialty = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    bio = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    avatar_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    verified_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_practitioners", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_clinic_healthcare_providers_clinic_id_normalized_license_no",
                table: "clinic_healthcare_providers",
                columns: new[] { "clinic_id", "normalized_license_no" });

            migrationBuilder.CreateIndex(
                name: "ix_clinic_healthcare_providers_practitioner_id",
                table: "clinic_healthcare_providers",
                column: "practitioner_id");

            migrationBuilder.CreateIndex(
                name: "ix_booking_drafts_provider_id",
                table: "booking_drafts",
                column: "provider_id");

            migrationBuilder.CreateIndex(
                name: "ix_practitioners_merged_into_practitioner_id",
                table: "practitioners",
                column: "merged_into_practitioner_id");

            migrationBuilder.CreateIndex(
                name: "ix_practitioners_profession_kind_normalized_prc_license_no",
                table: "practitioners",
                columns: new[] { "profession_kind", "normalized_prc_license_no" },
                unique: true,
                filter: "merged_into_practitioner_id IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_practitioners_verification_level",
                table: "practitioners",
                column: "verification_level");

            migrationBuilder.AddForeignKey(
                name: "fk_clinic_healthcare_providers_practitioners_practitioner_id",
                table: "clinic_healthcare_providers",
                column: "practitioner_id",
                principalTable: "practitioners",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_clinic_healthcare_providers_practitioners_practitioner_id",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropTable(
                name: "practitioners");

            migrationBuilder.DropIndex(
                name: "ix_clinic_healthcare_providers_clinic_id_normalized_license_no",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropIndex(
                name: "ix_clinic_healthcare_providers_practitioner_id",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropIndex(
                name: "ix_booking_drafts_provider_id",
                table: "booking_drafts");

            migrationBuilder.DropColumn(
                name: "is_platform_verified",
                table: "clinics");

            migrationBuilder.DropColumn(
                name: "affiliation_status",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropColumn(
                name: "has_identity_conflict",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropColumn(
                name: "is_directory_opt_in",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropColumn(
                name: "normalized_license_no",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropColumn(
                name: "practitioner_id",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropColumn(
                name: "role",
                table: "clinic_healthcare_providers");

            migrationBuilder.DropColumn(
                name: "provider_id",
                table: "booking_drafts");

            migrationBuilder.DropColumn(
                name: "provider_name",
                table: "booking_drafts");
        }
    }
}
