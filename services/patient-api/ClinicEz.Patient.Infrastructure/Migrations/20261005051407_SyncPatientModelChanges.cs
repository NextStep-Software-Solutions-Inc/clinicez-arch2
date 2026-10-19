using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SyncPatientModelChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "gamot_coverage_amount",
                table: "prescriptions",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_phil_health_gamot",
                table: "prescriptions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "phil_health_drug_code",
                table: "prescriptions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "unique_prescription_security_code",
                table: "prescriptions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "sponsor_dob",
                table: "patient_government_ids",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sponsor_first_name",
                table: "patient_government_ids",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sponsor_last_name",
                table: "patient_government_ids",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sponsor_middle_name",
                table: "patient_government_ids",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sponsor_pin",
                table: "patient_government_ids",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sponsor_relationship",
                table: "patient_government_ids",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sponsor_suffix",
                table: "patient_government_ids",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "gamot_coverage_amount",
                table: "prescriptions");

            migrationBuilder.DropColumn(
                name: "is_phil_health_gamot",
                table: "prescriptions");

            migrationBuilder.DropColumn(
                name: "phil_health_drug_code",
                table: "prescriptions");

            migrationBuilder.DropColumn(
                name: "unique_prescription_security_code",
                table: "prescriptions");

            migrationBuilder.DropColumn(
                name: "sponsor_dob",
                table: "patient_government_ids");

            migrationBuilder.DropColumn(
                name: "sponsor_first_name",
                table: "patient_government_ids");

            migrationBuilder.DropColumn(
                name: "sponsor_last_name",
                table: "patient_government_ids");

            migrationBuilder.DropColumn(
                name: "sponsor_middle_name",
                table: "patient_government_ids");

            migrationBuilder.DropColumn(
                name: "sponsor_pin",
                table: "patient_government_ids");

            migrationBuilder.DropColumn(
                name: "sponsor_relationship",
                table: "patient_government_ids");

            migrationBuilder.DropColumn(
                name: "sponsor_suffix",
                table: "patient_government_ids");
        }
    }
}
