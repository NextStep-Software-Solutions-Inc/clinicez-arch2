using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBaseEntityAuditColumnsToProblemsAllergiesImmunizations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                schema: "clinic_dashboard",
                table: "PatientProblems",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                schema: "clinic_dashboard",
                table: "PatientProblems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "clinic_dashboard",
                table: "PatientProblems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                schema: "clinic_dashboard",
                table: "PatientProblems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                schema: "clinic_dashboard",
                table: "PatientImmunizations",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                schema: "clinic_dashboard",
                table: "PatientImmunizations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "clinic_dashboard",
                table: "PatientImmunizations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                schema: "clinic_dashboard",
                table: "PatientImmunizations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                schema: "clinic_dashboard",
                table: "PatientAllergies",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                schema: "clinic_dashboard",
                table: "PatientAllergies",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "clinic_dashboard",
                table: "PatientAllergies",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                schema: "clinic_dashboard",
                table: "PatientAllergies",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedBy",
                schema: "clinic_dashboard",
                table: "PatientProblems");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "clinic_dashboard",
                table: "PatientProblems");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "clinic_dashboard",
                table: "PatientProblems");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                schema: "clinic_dashboard",
                table: "PatientProblems");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                schema: "clinic_dashboard",
                table: "PatientImmunizations");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "clinic_dashboard",
                table: "PatientImmunizations");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "clinic_dashboard",
                table: "PatientImmunizations");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                schema: "clinic_dashboard",
                table: "PatientImmunizations");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                schema: "clinic_dashboard",
                table: "PatientAllergies");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "clinic_dashboard",
                table: "PatientAllergies");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "clinic_dashboard",
                table: "PatientAllergies");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                schema: "clinic_dashboard",
                table: "PatientAllergies");
        }
    }
}
