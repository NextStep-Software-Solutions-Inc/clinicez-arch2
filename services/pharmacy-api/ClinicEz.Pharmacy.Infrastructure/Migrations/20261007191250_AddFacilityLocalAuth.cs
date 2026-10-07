using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Pharmacy.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFacilityLocalAuth : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FailedLoginCount",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastLoginAt",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockoutEnd",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "MustChangePassword",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TokenVersion",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "RefreshTokens",
                schema: "pharmacy_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StaffMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PharmacyId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    FamilyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReplacedByTokenId = table.Column<Guid>(type: "uuid", nullable: true),
                    DeviceLabel = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
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
                    table.PrimaryKey("PK_RefreshTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RefreshTokens_PharmacyStaffMembers_StaffMemberId",
                        column: x => x.StaffMemberId,
                        principalSchema: "pharmacy_dashboard",
                        principalTable: "PharmacyStaffMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PharmacyStaffMembers_PharmacyId_Email",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers",
                columns: new[] { "PharmacyId", "Email" });

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_FamilyId",
                schema: "pharmacy_dashboard",
                table: "RefreshTokens",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_StaffMemberId",
                schema: "pharmacy_dashboard",
                table: "RefreshTokens",
                column: "StaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_TokenHash",
                schema: "pharmacy_dashboard",
                table: "RefreshTokens",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RefreshTokens",
                schema: "pharmacy_dashboard");

            migrationBuilder.DropIndex(
                name: "IX_PharmacyStaffMembers_PharmacyId_Email",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers");

            migrationBuilder.DropColumn(
                name: "FailedLoginCount",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers");

            migrationBuilder.DropColumn(
                name: "LastLoginAt",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers");

            migrationBuilder.DropColumn(
                name: "LockoutEnd",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers");

            migrationBuilder.DropColumn(
                name: "MustChangePassword",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers");

            migrationBuilder.DropColumn(
                name: "TokenVersion",
                schema: "pharmacy_dashboard",
                table: "PharmacyStaffMembers");
        }
    }
}
