using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBranchAndPhilHealthAccreditation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "main",
                table: "Facilities",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Branches",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    StreetAddress = table.Column<string>(type: "text", nullable: true),
                    Barangay = table.Column<string>(type: "text", nullable: true),
                    City = table.Column<string>(type: "text", nullable: true),
                    Province = table.Column<string>(type: "text", nullable: true),
                    Region = table.Column<string>(type: "text", nullable: true),
                    ZipCode = table.Column<string>(type: "text", nullable: true),
                    ContactNumber = table.Column<string>(type: "text", nullable: true),
                    ContactEmail = table.Column<string>(type: "text", nullable: true),
                    PhilHealthAccreditationNumber = table.Column<string>(type: "text", nullable: true),
                    PhilHealthPmccNumber = table.Column<string>(type: "text", nullable: true),
                    PhilHealthSoftwareCertificateId = table.Column<string>(type: "text", nullable: true),
                    PhilHealthEncryptedUsername = table.Column<string>(type: "text", nullable: true),
                    PhilHealthEncryptedPassword = table.Column<string>(type: "text", nullable: true),
                    PhilHealthEncryptedCipherKey = table.Column<string>(type: "text", nullable: true),
                    PhilHealthKonsultaEndpoint = table.Column<string>(type: "text", nullable: true),
                    IsPhilHealthAccredited = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_Branches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Branches_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_BranchId",
                schema: "main",
                table: "Facilities",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_Branches_TenantId_Code",
                schema: "main",
                table: "Branches",
                columns: new[] { "TenantId", "Code" },
                unique: true,
                filter: "\"IsDeleted\" = false AND \"Code\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Facilities_Branches_BranchId",
                schema: "main",
                table: "Facilities",
                column: "BranchId",
                principalSchema: "main",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Facilities_Branches_BranchId",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropTable(
                name: "Branches",
                schema: "main");

            migrationBuilder.DropIndex(
                name: "IX_Facilities_BranchId",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "main",
                table: "Facilities");
        }
    }
}
