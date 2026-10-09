using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ClinicEz.Interop.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "interop_hub");

            migrationBuilder.CreateTable(
                name: "Cells",
                schema: "interop_hub",
                columns: table => new
                {
                    CellId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cells", x => x.CellId);
                });

            migrationBuilder.CreateTable(
                name: "Claims",
                schema: "interop_hub",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    IssuerTenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IssuerFacilityId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TargetFacilityType = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
                    Envelope = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RedeemedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RedeemedByTenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RedeemedByFacilityId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Claims", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Clients",
                schema: "interop_hub",
                columns: table => new
                {
                    ClientId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CellId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Service = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    SecretHash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Revoked = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SecretRotatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RevokedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Clients", x => x.ClientId);
                });

            migrationBuilder.CreateTable(
                name: "Conversations",
                schema: "interop_hub",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromKey = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ToKey = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Conversations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Facilities",
                schema: "interop_hub",
                columns: table => new
                {
                    Key = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FacilityId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FacilityType = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    CellId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BranchId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    City = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Visibility = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    AcceptsExternalRequests = table.Column<bool>(type: "boolean", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Facilities", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "Links",
                schema: "interop_hub",
                columns: table => new
                {
                    LinkId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceTenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SourceFacilityId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TargetTenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TargetFacilityId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Scopes = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Links", x => x.LinkId);
                });

            migrationBuilder.CreateTable(
                name: "Messages",
                schema: "interop_hub",
                columns: table => new
                {
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Mailbox = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Envelope = table.Column<string>(type: "text", nullable: false),
                    SizeBytes = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VisibleAfterUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeliveryId = table.Column<Guid>(type: "uuid", nullable: true),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    LastError = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    DeadLetteredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AckedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Messages", x => x.Seq);
                });

            migrationBuilder.CreateTable(
                name: "Outbound",
                schema: "interop_hub",
                columns: table => new
                {
                    Seq = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Envelope = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastError = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    DeadLetteredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Outbound", x => x.Seq);
                });

            migrationBuilder.CreateTable(
                name: "State",
                schema: "interop_hub",
                columns: table => new
                {
                    Key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Value = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_State", x => x.Key);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Claims_ExpiresAtUtc",
                schema: "interop_hub",
                table: "Claims",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Claims_TokenHash",
                schema: "interop_hub",
                table: "Claims",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Clients_CellId",
                schema: "interop_hub",
                table: "Clients",
                column: "CellId");

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_CorrelationId_FromKey_ToKey",
                schema: "interop_hub",
                table: "Conversations",
                columns: new[] { "CorrelationId", "FromKey", "ToKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_ExpiresAtUtc",
                schema: "interop_hub",
                table: "Conversations",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_CellId",
                schema: "interop_hub",
                table: "Facilities",
                column: "CellId");

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_TenantId",
                schema: "interop_hub",
                table: "Facilities",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_Links_SourceTenantId_SourceFacilityId",
                schema: "interop_hub",
                table: "Links",
                columns: new[] { "SourceTenantId", "SourceFacilityId" });

            migrationBuilder.CreateIndex(
                name: "IX_Links_TargetTenantId_TargetFacilityId",
                schema: "interop_hub",
                table: "Links",
                columns: new[] { "TargetTenantId", "TargetFacilityId" });

            migrationBuilder.CreateIndex(
                name: "IX_Messages_DeliveryId",
                schema: "interop_hub",
                table: "Messages",
                column: "DeliveryId");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ExpiresAtUtc",
                schema: "interop_hub",
                table: "Messages",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_Mailbox_Seq",
                schema: "interop_hub",
                table: "Messages",
                columns: new[] { "Mailbox", "Seq" });

            migrationBuilder.CreateIndex(
                name: "IX_Messages_MessageId",
                schema: "interop_hub",
                table: "Messages",
                column: "MessageId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Outbound_CorrelationId_Seq",
                schema: "interop_hub",
                table: "Outbound",
                columns: new[] { "CorrelationId", "Seq" });

            migrationBuilder.CreateIndex(
                name: "IX_Outbound_MessageId",
                schema: "interop_hub",
                table: "Outbound",
                column: "MessageId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Outbound_NextAttemptAtUtc",
                schema: "interop_hub",
                table: "Outbound",
                column: "NextAttemptAtUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Cells",
                schema: "interop_hub");

            migrationBuilder.DropTable(
                name: "Claims",
                schema: "interop_hub");

            migrationBuilder.DropTable(
                name: "Clients",
                schema: "interop_hub");

            migrationBuilder.DropTable(
                name: "Conversations",
                schema: "interop_hub");

            migrationBuilder.DropTable(
                name: "Facilities",
                schema: "interop_hub");

            migrationBuilder.DropTable(
                name: "Links",
                schema: "interop_hub");

            migrationBuilder.DropTable(
                name: "Messages",
                schema: "interop_hub");

            migrationBuilder.DropTable(
                name: "Outbound",
                schema: "interop_hub");

            migrationBuilder.DropTable(
                name: "State",
                schema: "interop_hub");
        }
    }
}
