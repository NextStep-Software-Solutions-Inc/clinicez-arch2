using System;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261014103000_ReplaceAssignedRoomIdWithAssignedRoomIdsJson")]
    /// <inheritdoc />
    public partial class ReplaceAssignedRoomIdWithAssignedRoomIdsJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StaffMembers_ClinicRooms_AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers");

            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers");

            migrationBuilder.AddColumn<string>(
                name: "AssignedRoomIdsJson",
                schema: "clinic_dashboard",
                table: "StaffMembers",
                type: "text",
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE clinic_dashboard.\"StaffMembers\" " +
                "SET \"AssignedRoomIdsJson\" = '[\"' || \"AssignedRoomId\"::text || '\"]' " +
                "WHERE \"AssignedRoomId\" IS NOT NULL;");

            migrationBuilder.DropColumn(
                name: "AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers",
                column: "AssignedRoomId");

            migrationBuilder.AddForeignKey(
                name: "FK_StaffMembers_ClinicRooms_AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers",
                column: "AssignedRoomId",
                principalSchema: "clinic_dashboard",
                principalTable: "ClinicRooms",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.DropColumn(
                name: "AssignedRoomIdsJson",
                schema: "clinic_dashboard",
                table: "StaffMembers");
        }
    }
}
