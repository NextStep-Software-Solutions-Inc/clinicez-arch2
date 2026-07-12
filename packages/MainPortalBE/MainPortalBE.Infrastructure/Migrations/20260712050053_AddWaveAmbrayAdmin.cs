using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWaveAmbrayAdmin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                schema: "main",
                table: "AdminUsers",
                columns: new[] { "Id", "ClerkUserId", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "Email", "FullName", "IsActive", "IsDeleted", "RoleId", "UpdatedAt", "UpdatedBy" },
                values: new object[] { new Guid("99999999-9999-9999-9999-999999999999"), "", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "wave.ambray@nextstep-software.com", "Wave Ambray", true, false, new Guid("44444444-4444-4444-4444-444444444444"), null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                schema: "main",
                table: "AdminUsers",
                keyColumn: "Id",
                keyValue: new Guid("99999999-9999-9999-9999-999999999999"));

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
