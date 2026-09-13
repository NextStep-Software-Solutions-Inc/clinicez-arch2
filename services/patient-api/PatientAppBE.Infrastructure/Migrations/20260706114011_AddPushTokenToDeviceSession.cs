using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PatientAppBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPushTokenToDeviceSession : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "push_token",
                table: "device_sessions",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "push_token",
                table: "device_sessions");
        }
    }
}
