using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.MediaBroker.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialMediaBrokerSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "media");

            migrationBuilder.CreateTable(
                name: "interop_inbox",
                schema: "media",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ProcessedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_interop_inbox", x => x.MessageId);
                });

            migrationBuilder.CreateTable(
                name: "interop_outbox",
                schema: "media",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    EnvelopeJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DispatchedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeadLetteredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_interop_outbox", x => x.MessageId);
                });

            migrationBuilder.CreateTable(
                name: "media_audit_logs",
                schema: "media",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CallId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Details = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    TimestampUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_media_audit_logs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "media_call_sessions",
                schema: "media",
                columns: table => new
                {
                    CallId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FacilityId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RoomName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    IsE2ee = table.Column<bool>(type: "boolean", nullable: false),
                    E2eeKeyHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    IsOverdraft = table.Column<bool>(type: "boolean", nullable: false),
                    RequestedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EndedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    BillableMinutes = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_media_call_sessions", x => x.CallId);
                });

            migrationBuilder.CreateTable(
                name: "tenant_media_entitlements",
                schema: "media",
                columns: table => new
                {
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CallMinutesMonthly = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    AllowOverdraft = table.Column<bool>(type: "boolean", nullable: false),
                    AllowTransportOnlyFallback = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tenant_media_entitlements", x => x.TenantId);
                });

            migrationBuilder.CreateTable(
                name: "tenant_monthly_usages",
                schema: "media",
                columns: table => new
                {
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    YearMonth = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    MinutesUsed = table.Column<int>(type: "integer", nullable: false),
                    MinutesOverdraft = table.Column<int>(type: "integer", nullable: false),
                    TotalCallsCompleted = table.Column<int>(type: "integer", nullable: false),
                    LastRecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tenant_monthly_usages", x => new { x.TenantId, x.YearMonth });
                });

            migrationBuilder.CreateIndex(
                name: "IX_interop_inbox_ProcessedAtUtc",
                schema: "media",
                table: "interop_inbox",
                column: "ProcessedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_interop_outbox_CorrelationId",
                schema: "media",
                table: "interop_outbox",
                column: "CorrelationId");

            migrationBuilder.CreateIndex(
                name: "IX_interop_outbox_DispatchedAtUtc_DeadLetteredAtUtc_NextAttemp~",
                schema: "media",
                table: "interop_outbox",
                columns: new[] { "DispatchedAtUtc", "DeadLetteredAtUtc", "NextAttemptAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_media_audit_logs_TenantId_CallId",
                schema: "media",
                table: "media_audit_logs",
                columns: new[] { "TenantId", "CallId" });

            migrationBuilder.CreateIndex(
                name: "IX_media_call_sessions_RoomName",
                schema: "media",
                table: "media_call_sessions",
                column: "RoomName");

            migrationBuilder.CreateIndex(
                name: "IX_media_call_sessions_TenantId_CallId",
                schema: "media",
                table: "media_call_sessions",
                columns: new[] { "TenantId", "CallId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "interop_inbox",
                schema: "media");

            migrationBuilder.DropTable(
                name: "interop_outbox",
                schema: "media");

            migrationBuilder.DropTable(
                name: "media_audit_logs",
                schema: "media");

            migrationBuilder.DropTable(
                name: "media_call_sessions",
                schema: "media");

            migrationBuilder.DropTable(
                name: "tenant_media_entitlements",
                schema: "media");

            migrationBuilder.DropTable(
                name: "tenant_monthly_usages",
                schema: "media");
        }
    }
}
