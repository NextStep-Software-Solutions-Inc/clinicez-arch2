using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Comms.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCommsSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "comms");

            migrationBuilder.CreateTable(
                name: "comms_conversations",
                schema: "comms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FacilityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    BranchId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Scope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ContextType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ContextId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    TriageDisposition = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    DeclineReasonCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    AssignedStaffId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    AssignedStaffName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Priority = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    IsEmergencyConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    IsLocalOnly = table.Column<bool>(type: "boolean", nullable: false),
                    ReopenCount = table.Column<int>(type: "integer", nullable: false),
                    HomeCellId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    LastMessageAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastMessageSnippet = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    MessageCount = table.Column<int>(type: "integer", nullable: false),
                    LastSeq = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ClosedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClosedBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comms_conversations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "comms_eligibility_grants",
                schema: "comms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FacilityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FacilityType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContextType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ContextId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    WindowStartUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    WindowEndUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    RevokedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RevokeReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comms_eligibility_grants", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "interop_inbox",
                schema: "comms",
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
                schema: "comms",
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
                name: "comms_messages",
                schema: "comms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FacilityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Seq = table.Column<long>(type: "bigint", nullable: false),
                    SenderType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SenderId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SenderDisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ContentText = table.Column<string>(type: "text", nullable: false),
                    Visibility = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    State = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    RequiresAcknowledgement = table.Column<bool>(type: "boolean", nullable: false),
                    IsAcknowledged = table.Column<bool>(type: "boolean", nullable: false),
                    AcknowledgedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AcknowledgedByAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    AcknowledgedByName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClientSentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ServerReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RetentionDeadlineUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClientMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsArchivedToChart = table.Column<bool>(type: "boolean", nullable: false),
                    ChartFilingDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ChartFiledByStaffId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comms_messages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_comms_messages_comms_conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "comms",
                        principalTable: "comms_conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "comms_participants",
                schema: "comms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ParticipantType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ParticipantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Role = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    JoinedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LeftAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastReadMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    LastReadAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsMuted = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comms_participants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_comms_participants_comms_conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "comms",
                        principalTable: "comms_conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "comms_message_attachments",
                schema: "comms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FacilityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    OriginalFileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    SafeFileName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    OriginalSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    SanitizedSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StoragePath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    SHA256Checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    QuarantineReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    StrippedExif = table.Column<bool>(type: "boolean", nullable: false),
                    ConvertedFromOriginal = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EncryptionAlgorithm = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    EncryptionKeyId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    EncryptionIvBase64 = table.Column<string>(type: "text", nullable: false),
                    EncryptionTagBase64 = table.Column<string>(type: "text", nullable: false),
                    WrappedKeyJson = table.Column<string>(type: "text", nullable: false),
                    IsFiledToChart = table.Column<bool>(type: "boolean", nullable: false),
                    FiledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FiledByStaffId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ScannedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comms_message_attachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_comms_message_attachments_comms_messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "comms",
                        principalTable: "comms_messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "comms_message_reactions",
                schema: "comms",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Reaction = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    UserDisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comms_message_reactions", x => new { x.MessageId, x.UserId, x.Reaction });
                    table.ForeignKey(
                        name: "FK_comms_message_reactions_comms_messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "comms",
                        principalTable: "comms_messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_comms_conversations_TenantId_ContextType_ContextId",
                schema: "comms",
                table: "comms_conversations",
                columns: new[] { "TenantId", "ContextType", "ContextId" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_conversations_TenantId_FacilityId_Scope_Status",
                schema: "comms",
                table: "comms_conversations",
                columns: new[] { "TenantId", "FacilityId", "Scope", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_conversations_TenantId_FacilityId_Status_CreatedAtUtc",
                schema: "comms",
                table: "comms_conversations",
                columns: new[] { "TenantId", "FacilityId", "Status", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_conversations_TenantId_LastMessageAtUtc",
                schema: "comms",
                table: "comms_conversations",
                columns: new[] { "TenantId", "LastMessageAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_eligibility_grants_TenantId_ContextType_ContextId",
                schema: "comms",
                table: "comms_eligibility_grants",
                columns: new[] { "TenantId", "ContextType", "ContextId" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_eligibility_grants_TenantId_FacilityId_PatientId_IsAc~",
                schema: "comms",
                table: "comms_eligibility_grants",
                columns: new[] { "TenantId", "FacilityId", "PatientId", "IsActive", "WindowStartUtc", "WindowEndUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_message_attachments_MessageId",
                schema: "comms",
                table: "comms_message_attachments",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_comms_message_attachments_SHA256Checksum",
                schema: "comms",
                table: "comms_message_attachments",
                column: "SHA256Checksum");

            migrationBuilder.CreateIndex(
                name: "IX_comms_message_attachments_TenantId_FacilityId",
                schema: "comms",
                table: "comms_message_attachments",
                columns: new[] { "TenantId", "FacilityId" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_messages_ConversationId_ClientMessageId",
                schema: "comms",
                table: "comms_messages",
                columns: new[] { "ConversationId", "ClientMessageId" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_messages_ConversationId_Seq",
                schema: "comms",
                table: "comms_messages",
                columns: new[] { "ConversationId", "Seq" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_comms_messages_ConversationId_ServerReceivedAtUtc",
                schema: "comms",
                table: "comms_messages",
                columns: new[] { "ConversationId", "ServerReceivedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_messages_TenantId_FacilityId_State_RetentionDeadlineU~",
                schema: "comms",
                table: "comms_messages",
                columns: new[] { "TenantId", "FacilityId", "State", "RetentionDeadlineUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_comms_participants_ConversationId_ParticipantType_Participa~",
                schema: "comms",
                table: "comms_participants",
                columns: new[] { "ConversationId", "ParticipantType", "ParticipantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_comms_participants_TenantId_ParticipantType_ParticipantId",
                schema: "comms",
                table: "comms_participants",
                columns: new[] { "TenantId", "ParticipantType", "ParticipantId" });

            migrationBuilder.CreateIndex(
                name: "IX_interop_inbox_ProcessedAtUtc",
                schema: "comms",
                table: "interop_inbox",
                column: "ProcessedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_interop_outbox_CorrelationId",
                schema: "comms",
                table: "interop_outbox",
                column: "CorrelationId");

            migrationBuilder.CreateIndex(
                name: "IX_interop_outbox_DispatchedAtUtc_DeadLetteredAtUtc_NextAttemp~",
                schema: "comms",
                table: "interop_outbox",
                columns: new[] { "DispatchedAtUtc", "DeadLetteredAtUtc", "NextAttemptAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "comms_eligibility_grants",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "comms_message_attachments",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "comms_message_reactions",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "comms_participants",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "interop_inbox",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "interop_outbox",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "comms_messages",
                schema: "comms");

            migrationBuilder.DropTable(
                name: "comms_conversations",
                schema: "comms");
        }
    }
}
