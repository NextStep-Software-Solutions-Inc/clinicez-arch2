using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicRoomsAndStaffRoomAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RoomId",
                schema: "clinic_dashboard",
                table: "QueueItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TargetRoomId",
                schema: "clinic_dashboard",
                table: "Procedures",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TargetRoomName",
                schema: "clinic_dashboard",
                table: "Procedures",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ClinicRooms",
                schema: "clinic_dashboard",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Code = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
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
                    table.PrimaryKey("PK_ClinicRooms", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers",
                column: "AssignedRoomId");

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_RoomId",
                schema: "clinic_dashboard",
                table: "QueueItems",
                column: "RoomId");

            migrationBuilder.CreateIndex(
                name: "IX_Procedures_TargetRoomId",
                schema: "clinic_dashboard",
                table: "Procedures",
                column: "TargetRoomId");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicRooms_ClinicId_Name",
                schema: "clinic_dashboard",
                table: "ClinicRooms",
                columns: new[] { "ClinicId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicRooms_TenantId_ClinicId_DisplayOrder",
                schema: "clinic_dashboard",
                table: "ClinicRooms",
                columns: new[] { "TenantId", "ClinicId", "DisplayOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_Procedures_ClinicRooms_TargetRoomId",
                schema: "clinic_dashboard",
                table: "Procedures",
                column: "TargetRoomId",
                principalSchema: "clinic_dashboard",
                principalTable: "ClinicRooms",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_QueueItems_ClinicRooms_RoomId",
                schema: "clinic_dashboard",
                table: "QueueItems",
                column: "RoomId",
                principalSchema: "clinic_dashboard",
                principalTable: "ClinicRooms",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_StaffMembers_ClinicRooms_AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers",
                column: "AssignedRoomId",
                principalSchema: "clinic_dashboard",
                principalTable: "ClinicRooms",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Procedures_ClinicRooms_TargetRoomId",
                schema: "clinic_dashboard",
                table: "Procedures");

            migrationBuilder.DropForeignKey(
                name: "FK_QueueItems_ClinicRooms_RoomId",
                schema: "clinic_dashboard",
                table: "QueueItems");

            migrationBuilder.DropForeignKey(
                name: "FK_StaffMembers_ClinicRooms_AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers");

            migrationBuilder.DropTable(
                name: "ClinicRooms",
                schema: "clinic_dashboard");

            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers");

            migrationBuilder.DropIndex(
                name: "IX_QueueItems_RoomId",
                schema: "clinic_dashboard",
                table: "QueueItems");

            migrationBuilder.DropIndex(
                name: "IX_Procedures_TargetRoomId",
                schema: "clinic_dashboard",
                table: "Procedures");

            migrationBuilder.DropColumn(
                name: "AssignedRoomId",
                schema: "clinic_dashboard",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "RoomId",
                schema: "clinic_dashboard",
                table: "QueueItems");

            migrationBuilder.DropColumn(
                name: "TargetRoomId",
                schema: "clinic_dashboard",
                table: "Procedures");

            migrationBuilder.DropColumn(
                name: "TargetRoomName",
                schema: "clinic_dashboard",
                table: "Procedures");
        }
    }
}
