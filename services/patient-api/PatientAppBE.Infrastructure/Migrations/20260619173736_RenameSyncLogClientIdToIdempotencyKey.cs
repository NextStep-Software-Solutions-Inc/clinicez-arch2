using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PatientAppBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenameSyncLogClientIdToIdempotencyKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "client_id",
                table: "sync_logs",
                newName: "idempotency_key");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "idempotency_key",
                table: "sync_logs",
                newName: "client_id");
        }
    }
}
