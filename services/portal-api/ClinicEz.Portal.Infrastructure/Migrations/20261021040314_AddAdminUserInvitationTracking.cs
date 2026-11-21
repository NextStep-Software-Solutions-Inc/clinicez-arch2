using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminUserInvitationTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "FullName",
                schema: "public",
                table: "AdminUsers",
                type: "character varying(256)",
                maxLength: 256,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Email",
                schema: "public",
                table: "AdminUsers",
                type: "character varying(254)",
                maxLength: 254,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "ClerkUserId",
                schema: "public",
                table: "AdminUsers",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<DateTime>(
                name: "InvitationExpiresAt",
                schema: "public",
                table: "AdminUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvitationToken",
                schema: "public",
                table: "AdminUsers",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "JoinedAt",
                schema: "public",
                table: "AdminUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "public",
                table: "AdminUsers",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_Email",
                schema: "public",
                table: "AdminUsers",
                column: "Email",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_InvitationToken",
                schema: "public",
                table: "AdminUsers",
                column: "InvitationToken",
                unique: true,
                filter: "\"IsDeleted\" = false AND \"InvitationToken\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AdminUsers_Email",
                schema: "public",
                table: "AdminUsers");

            migrationBuilder.DropIndex(
                name: "IX_AdminUsers_InvitationToken",
                schema: "public",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "InvitationExpiresAt",
                schema: "public",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "InvitationToken",
                schema: "public",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "JoinedAt",
                schema: "public",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "public",
                table: "AdminUsers");

            migrationBuilder.AlterColumn<string>(
                name: "FullName",
                schema: "public",
                table: "AdminUsers",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(256)",
                oldMaxLength: 256);

            migrationBuilder.AlterColumn<string>(
                name: "Email",
                schema: "public",
                table: "AdminUsers",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(254)",
                oldMaxLength: 254);

            migrationBuilder.AlterColumn<string>(
                name: "ClerkUserId",
                schema: "public",
                table: "AdminUsers",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }
    }
}
