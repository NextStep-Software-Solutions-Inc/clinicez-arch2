using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDoctorPanAndConsultationYakapFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Add PhilHealthPan to StaffMembers
            migrationBuilder.AddColumn<string>(
                name: "PhilHealthPan",
                schema: "clinic_dashboard",
                table: "StaffMembers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            // 2. Add PhilHealth and PE fields to Consultations
            migrationBuilder.AddColumn<string>(
                name: "DoctorPhilHealthPan",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhilHealthAtc",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HciCaseNo",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HciTransNo",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SoapTransNo",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GeneralSurveyId",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GeneralSurveyRemarks",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhysicalExamFindingsJson",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PhilHealthPan",
                schema: "clinic_dashboard",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "DoctorPhilHealthPan",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "PhilHealthAtc",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "HciCaseNo",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "HciTransNo",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "SoapTransNo",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "GeneralSurveyId",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "GeneralSurveyRemarks",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "PhysicalExamFindingsJson",
                schema: "clinic_dashboard",
                table: "Consultations");
        }
    }
}
