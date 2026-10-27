using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Comms.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGuestInvites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "comms_guest_invites",
                schema: "comms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FacilityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CallId = table.Column<Guid>(type: "uuid", nullable: false),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    InviteTokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ExpectedDobHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    OtpHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    IsLockedOut = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VerifiedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConsumedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedByStaffId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    MaskedRecipientPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comms_guest_invites", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_comms_guest_invites_InviteTokenHash",
                schema: "comms",
                table: "comms_guest_invites",
                column: "InviteTokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_comms_guest_invites_Status_ExpiresAtUtc",
                schema: "comms",
                table: "comms_guest_invites",
                columns: new[] { "Status", "ExpiresAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_guest_invites_TenantId_FacilityId_CallId",
                schema: "comms",
                table: "comms_guest_invites",
                columns: new[] { "TenantId", "FacilityId", "CallId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "comms_guest_invites",
                schema: "comms");
        }
    }
}
