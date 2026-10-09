using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLabDoctorReview : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DoctorReviewOutcome",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "DoctorReviewRemarks",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DoctorReviewedAtUtc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DoctorReviewedByName",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DoctorReviewedByPrc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DoctorReviewOutcome",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "DoctorReviewRemarks",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "DoctorReviewedAtUtc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "DoctorReviewedByName",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");

            migrationBuilder.DropColumn(
                name: "DoctorReviewedByPrc",
                schema: "laboratory_dashboard",
                table: "LabRequisitions");
        }
    }
}
