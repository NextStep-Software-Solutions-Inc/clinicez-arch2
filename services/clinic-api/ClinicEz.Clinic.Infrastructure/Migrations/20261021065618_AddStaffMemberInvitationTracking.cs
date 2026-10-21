using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStaffMemberInvitationTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "InvitationExpiresAt",
                schema: "public",
                table: "StaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvitationToken",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "InviteAcceptedAt",
                schema: "public",
                table: "StaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Invited");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_InvitationToken",
                schema: "public",
                table: "StaffMembers",
                column: "InvitationToken",
                filter: "\"IsDeleted\" = false AND \"InvitationToken\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_InvitationToken",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "InvitationExpiresAt",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "InvitationToken",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "InviteAcceptedAt",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "public",
                table: "StaffMembers");
        }
    }
}
