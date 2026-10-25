using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBranchInheritanceAndPhilHealthOverrideToClinicSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "public",
                table: "ClinicSettings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BranchKonsultaEndpoint",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BranchName",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BranchPhilHealthAccreditationNumber",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BranchPmccNumber",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BranchSoftwareCertificateId",
                schema: "public",
                table: "ClinicSettings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsBranchPhilHealthAccredited",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPhilHealthOverridden",
                schema: "public",
                table: "ClinicSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "BranchKonsultaEndpoint",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "BranchName",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "BranchPhilHealthAccreditationNumber",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "BranchPmccNumber",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "BranchSoftwareCertificateId",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "IsBranchPhilHealthAccredited",
                schema: "public",
                table: "ClinicSettings");

            migrationBuilder.DropColumn(
                name: "IsPhilHealthOverridden",
                schema: "public",
                table: "ClinicSettings");
        }
    }
}
