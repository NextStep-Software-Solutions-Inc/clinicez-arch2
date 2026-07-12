using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRBACAndBlogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AdminRoles",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Permissions = table.Column<List<string>>(type: "text[]", nullable: false),
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
                    table.PrimaryKey("PK_AdminRoles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BlogArticles",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Slug = table.Column<string>(type: "text", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Summary = table.Column<string>(type: "text", nullable: false),
                    Author = table.Column<string>(type: "text", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_BlogArticles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AdminUsers",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ClerkUserId = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    FullName = table.Column<string>(type: "text", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_AdminUsers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AdminUsers_AdminRoles_RoleId",
                        column: x => x.RoleId,
                        principalSchema: "main",
                        principalTable: "AdminRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                schema: "main",
                table: "AdminRoles",
                columns: new[] { "Id", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "Description", "IsDeleted", "Name", "Permissions", "UpdatedAt", "UpdatedBy" },
                values: new object[,]
                {
                    { new Guid("44444444-4444-4444-4444-444444444444"), new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "Full platform administrative control, including tenant and permissions management.", false, "Super Admin", new List<string> { "view:analytics", "view:tenants", "manage:tenants", "toggle:subscription", "manage:blogs", "manage:roles", "manage:admins" }, null, null },
                    { new Guid("55555555-5555-5555-5555-555555555555"), new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "Provides support, views tenants and leads, writes blogs.", false, "Support Staff", new List<string> { "view:analytics", "view:tenants", "manage:blogs" }, null, null },
                    { new Guid("66666666-6666-6666-6666-666666666666"), new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "Maintains marketing resources, writes blog articles.", false, "Content Writer", new List<string> { "manage:blogs" }, null, null }
                });

            migrationBuilder.InsertData(
                schema: "main",
                table: "AdminUsers",
                columns: new[] { "Id", "ClerkUserId", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "Email", "FullName", "IsActive", "IsDeleted", "RoleId", "UpdatedAt", "UpdatedBy" },
                values: new object[,]
                {
                    { new Guid("77777777-7777-7777-7777-777777777777"), "", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "admin@clinicez.net", "System Super Admin", true, false, new Guid("44444444-4444-4444-4444-444444444444"), null, null },
                    { new Guid("88888888-8888-8888-8888-888888888888"), "", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "staff@clinicez.net", "Support Operator", true, false, new Guid("55555555-5555-5555-5555-555555555555"), null, null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_RoleId",
                schema: "main",
                table: "AdminUsers",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_BlogArticles_Slug",
                schema: "main",
                table: "BlogArticles",
                column: "Slug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdminUsers",
                schema: "main");

            migrationBuilder.DropTable(
                name: "BlogArticles",
                schema: "main");

            migrationBuilder.DropTable(
                name: "AdminRoles",
                schema: "main");
        }
    }
}
