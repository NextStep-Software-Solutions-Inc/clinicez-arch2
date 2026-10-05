using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBranchIdToEncounterAndTransmittal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "clinic_dashboard",
                table: "Consultations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "clinic_dashboard",
                table: "YakapTransmittals",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_TenantId_BranchId",
                schema: "clinic_dashboard",
                table: "Consultations",
                columns: new[] { "TenantId", "BranchId" });

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittals_TenantId_BranchId",
                schema: "clinic_dashboard",
                table: "YakapTransmittals",
                columns: new[] { "TenantId", "BranchId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Consultations_TenantId_BranchId",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropIndex(
                name: "IX_YakapTransmittals_TenantId_BranchId",
                schema: "clinic_dashboard",
                table: "YakapTransmittals");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "clinic_dashboard",
                table: "Consultations");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "clinic_dashboard",
                table: "YakapTransmittals");
        }
    }
}
