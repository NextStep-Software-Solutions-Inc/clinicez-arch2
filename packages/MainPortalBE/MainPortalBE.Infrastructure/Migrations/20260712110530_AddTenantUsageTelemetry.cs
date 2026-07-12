using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantUsageTelemetry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ActivePatientRecordsCount",
                schema: "main",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ClinicalBranchesCount",
                schema: "main",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MonthlyApiQuotaLimit",
                schema: "main",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MonthlyApiQuotaUsed",
                schema: "main",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "StaffAccountsCount",
                schema: "main",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActivePatientRecordsCount",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ClinicalBranchesCount",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "MonthlyApiQuotaLimit",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "MonthlyApiQuotaUsed",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "StaffAccountsCount",
                schema: "main",
                table: "Tenants");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("44444444-4444-4444-4444-444444444444"),
                column: "Permissions",
                value: new List<string> { "view:analytics", "view:tenants", "manage:tenants", "toggle:subscription", "manage:blogs", "manage:roles", "manage:admins" });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("55555555-5555-5555-5555-555555555555"),
                column: "Permissions",
                value: new List<string> { "view:analytics", "view:tenants", "manage:blogs" });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("66666666-6666-6666-6666-666666666666"),
                column: "Permissions",
                value: new List<string> { "manage:blogs" });
        }
    }
}
