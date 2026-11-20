using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkstationLockAndSessionPolicy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FailedPinAttempts",
                schema: "public",
                table: "StaffMembers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "QuickUnlockPinHash",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "QuickUnlockPinSetAtUtc",
                schema: "public",
                table: "StaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowStaffPinUnlock",
                schema: "public",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "IdleLockMinutes",
                schema: "public",
                table: "Settings",
                type: "integer",
                nullable: false,
                defaultValue: 15);

            migrationBuilder.AddColumn<int>(
                name: "MaxLockedSessionHours",
                schema: "public",
                table: "Settings",
                type: "integer",
                nullable: false,
                defaultValue: 8);

            migrationBuilder.AddColumn<DateTime>(
                name: "LockedAtUtc",
                schema: "public",
                table: "RefreshTokens",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FailedPinAttempts",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "QuickUnlockPinHash",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "QuickUnlockPinSetAtUtc",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "AllowStaffPinUnlock",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "IdleLockMinutes",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "MaxLockedSessionHours",
                schema: "public",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "LockedAtUtc",
                schema: "public",
                table: "RefreshTokens");
        }
    }
}
