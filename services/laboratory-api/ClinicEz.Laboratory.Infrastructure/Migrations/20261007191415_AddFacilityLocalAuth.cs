using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Laboratory.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFacilityLocalAuth : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FailedLoginCount",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastLoginAt",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockoutEnd",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "MustChangePassword",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TokenVersion",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "LabRefreshTokens",
                schema: "laboratory_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StaffMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LaboratoryId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_LabRefreshTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LabRefreshTokens_LabStaffMembers_StaffMemberId",
                        column: x => x.StaffMemberId,
                        principalSchema: "laboratory_dashboard",
                        principalTable: "LabStaffMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LabStaffMembers_LaboratoryId_Email",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers",
                columns: new[] { "LaboratoryId", "Email" });

            migrationBuilder.CreateIndex(
                name: "IX_LabRefreshTokens_FamilyId",
                schema: "laboratory_dashboard",
                table: "LabRefreshTokens",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_LabRefreshTokens_StaffMemberId",
                schema: "laboratory_dashboard",
                table: "LabRefreshTokens",
                column: "StaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_LabRefreshTokens_TokenHash",
                schema: "laboratory_dashboard",
                table: "LabRefreshTokens",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LabRefreshTokens",
                schema: "laboratory_dashboard");

            migrationBuilder.DropIndex(
                name: "IX_LabStaffMembers_LaboratoryId_Email",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers");

            migrationBuilder.DropColumn(
                name: "FailedLoginCount",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers");

            migrationBuilder.DropColumn(
                name: "LastLoginAt",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers");

            migrationBuilder.DropColumn(
                name: "LockoutEnd",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers");

            migrationBuilder.DropColumn(
                name: "MustChangePassword",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers");

            migrationBuilder.DropColumn(
                name: "TokenVersion",
                schema: "laboratory_dashboard",
                table: "LabStaffMembers");
        }
    }
}
