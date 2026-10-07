using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPhilHealthCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PhilHealthCatalogImportLogs",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Library = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    KitVersion = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Added = table.Column<int>(type: "integer", nullable: false),
                    Updated = table.Column<int>(type: "integer", nullable: false),
                    Unchanged = table.Column<int>(type: "integer", nullable: false),
                    Deactivated = table.Column<int>(type: "integer", nullable: false),
                    DuplicatesIgnored = table.Column<int>(type: "integer", nullable: false),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhilHealthCatalogImportLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PhilHealthCatalogItems",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Library = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ItemKey = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Code = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    AttributesJson = table.Column<string>(type: "text", nullable: true),
                    KitVersion = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhilHealthCatalogItems", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PhilHealthCatalogImportLogs_Library_CreatedAt",
                schema: "clinic_dashboard",
                table: "PhilHealthCatalogImportLogs",
                columns: new[] { "Library", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PhilHealthCatalogItems_Library_Code",
                schema: "clinic_dashboard",
                table: "PhilHealthCatalogItems",
                columns: new[] { "Library", "Code" });

            migrationBuilder.CreateIndex(
                name: "IX_PhilHealthCatalogItems_Library_ItemKey",
                schema: "clinic_dashboard",
                table: "PhilHealthCatalogItems",
                columns: new[] { "Library", "ItemKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PhilHealthCatalogImportLogs",
                schema: "clinic_dashboard");

            migrationBuilder.DropTable(
                name: "PhilHealthCatalogItems",
                schema: "clinic_dashboard");
        }
    }
}
