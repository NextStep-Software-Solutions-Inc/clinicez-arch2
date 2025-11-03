using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ERP_EZ.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TenantMigrationFromEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Products",
                schema: "catalog");

            migrationBuilder.CreateTable(
                name: "Modules",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeletedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Modules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tenants",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "text", nullable: false),
                    OnPremise = table.Column<bool>(type: "boolean", nullable: false),
                    BillingContactEmail = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeletedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tenants", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TenantModule",
                schema: "catalog",
                columns: table => new
                {
                    ModulesId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantsId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantModule", x => new { x.ModulesId, x.TenantsId });
                    table.ForeignKey(
                        name: "FK_TenantModule_Modules_ModulesId",
                        column: x => x.ModulesId,
                        principalSchema: "catalog",
                        principalTable: "Modules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TenantModule_Tenants_TenantsId",
                        column: x => x.TenantsId,
                        principalSchema: "catalog",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TenantSettings",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    BaseURL = table.Column<string>(type: "text", nullable: false),
                    DbConnectionString = table.Column<string>(type: "text", nullable: false),
                    BillingContactEmail = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeletedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TenantSettings_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "catalog",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TenantSubscriptions",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<int>(type: "integer", nullable: false),
                    Plan = table.Column<string>(type: "text", nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    BillingCycle = table.Column<string>(type: "text", nullable: true),
                    AutoRenew = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeletedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantSubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TenantSubscriptions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "catalog",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Modules_Name",
                schema: "catalog",
                table: "Modules",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantModule_TenantsId",
                schema: "catalog",
                table: "TenantModule",
                column: "TenantsId");

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_BillingContactEmail_Name",
                schema: "catalog",
                table: "Tenants",
                columns: new[] { "BillingContactEmail", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantSettings_Name_TenantId",
                schema: "catalog",
                table: "TenantSettings",
                columns: new[] { "Name", "TenantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantSettings_TenantId",
                schema: "catalog",
                table: "TenantSettings",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_TenantSubscriptions_TenantId_StartDate_EndDate",
                schema: "catalog",
                table: "TenantSubscriptions",
                columns: new[] { "TenantId", "StartDate", "EndDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TenantModule",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "TenantSettings",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "TenantSubscriptions",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "Modules",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "Tenants",
                schema: "catalog");

            migrationBuilder.CreateTable(
                name: "Products",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Price = table.Column<decimal>(type: "numeric", nullable: false),
                    Sku = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Products", x => x.Id);
                });
        }
    }
}
