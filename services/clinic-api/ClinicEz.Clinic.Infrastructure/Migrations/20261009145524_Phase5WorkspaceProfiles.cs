using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Phase5WorkspaceProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "workspace_profiles",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TenantSlug = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    ProfileJson = table.Column<string>(type: "text", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_profiles", x => x.TenantId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_workspace_profiles_TenantSlug",
                schema: "clinic_dashboard",
                table: "workspace_profiles",
                column: "TenantSlug");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "workspace_profiles",
                schema: "clinic_dashboard");
        }
    }
}
