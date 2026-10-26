using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientCommsUnifiedInbox : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "patient_conversations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    home_tenant_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    home_facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    home_facility_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    facility_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    scope = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    kind = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    subject = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    category = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    is_hidden_by_patient = table.Column<bool>(type: "boolean", nullable: false),
                    hidden_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    last_message_preview = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    last_message_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    unread_count = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    context_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    context_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    triage_disposition = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    decline_reason_code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    assigned_staff_display_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    opened_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    closed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    grant_window_end_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    idle_deadline_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    reopen_count = table.Column<int>(type: "integer", nullable: false),
                    submitting_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    submitting_account_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    relationship_to_patient = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    version = table.Column<int>(type: "integer", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_conversations", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_conversations_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "patient_eligibility_grants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    grant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    facility_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    facility_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    context_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    context_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    expires_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    window_start_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    window_end_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    synced_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_eligibility_grants", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_eligibility_grants_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_call_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    call_id = table.Column<Guid>(type: "uuid", nullable: false),
                    conversation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    facility_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    facility_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    facility_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    call_kind = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    room_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    live_kit_token = table.Column<string>(type: "text", nullable: true),
                    scheduled_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    joined_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ended_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    state_version = table.Column<int>(type: "integer", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_call_sessions", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_call_sessions_patient_conversations_conversation_id",
                        column: x => x.conversation_id,
                        principalTable: "patient_conversations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_patient_call_sessions_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "patient_messages",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    conversation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    seq = table.Column<long>(type: "bigint", nullable: false),
                    client_message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sender_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    sender_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    sender_id = table.Column<Guid>(type: "uuid", nullable: true),
                    content_text = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    requires_acknowledgement = table.Column<bool>(type: "boolean", nullable: false),
                    is_acknowledged = table.Column<bool>(type: "boolean", nullable: false),
                    acknowledged_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    acknowledged_by_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    acknowledged_by_name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    delivery_state = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    retention_deadline_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    received_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    has_expired_banner_shown = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_messages", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_messages_patient_conversations_conversation_id",
                        column: x => x.conversation_id,
                        principalTable: "patient_conversations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patient_message_attachments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    content_type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    file_size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    storage_key = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    is_clean = table.Column<bool>(type: "boolean", nullable: false),
                    scan_status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    hash_sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "text", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_patient_message_attachments", x => x.id);
                    table.ForeignKey(
                        name: "fk_patient_message_attachments_patient_messages_message_id",
                        column: x => x.message_id,
                        principalTable: "patient_messages",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_patient_call_sessions_call_id",
                table: "patient_call_sessions",
                column: "call_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_call_sessions_conversation_id",
                table: "patient_call_sessions",
                column: "conversation_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_call_sessions_patient_id_status",
                table: "patient_call_sessions",
                columns: new[] { "patient_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_conversations_home_tenant_id_home_facility_id",
                table: "patient_conversations",
                columns: new[] { "home_tenant_id", "home_facility_id" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_conversations_patient_id_is_hidden_by_patient_last_",
                table: "patient_conversations",
                columns: new[] { "patient_id", "is_hidden_by_patient", "last_message_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_conversations_submitting_account_id",
                table: "patient_conversations",
                column: "submitting_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_eligibility_grants_grant_id",
                table: "patient_eligibility_grants",
                column: "grant_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_eligibility_grants_patient_id_is_active_expires_at_",
                table: "patient_eligibility_grants",
                columns: new[] { "patient_id", "is_active", "expires_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_eligibility_grants_tenant_id_facility_id_context_ty",
                table: "patient_eligibility_grants",
                columns: new[] { "tenant_id", "facility_id", "context_type", "context_id" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_message_attachments_message_id",
                table: "patient_message_attachments",
                column: "message_id");

            migrationBuilder.CreateIndex(
                name: "ix_patient_messages_client_message_id",
                table: "patient_messages",
                column: "client_message_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_messages_conversation_id_seq",
                table: "patient_messages",
                columns: new[] { "conversation_id", "seq" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_messages_delivery_state_retention_deadline_utc",
                table: "patient_messages",
                columns: new[] { "delivery_state", "retention_deadline_utc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "patient_call_sessions");

            migrationBuilder.DropTable(
                name: "patient_eligibility_grants");

            migrationBuilder.DropTable(
                name: "patient_message_attachments");

            migrationBuilder.DropTable(
                name: "patient_messages");

            migrationBuilder.DropTable(
                name: "patient_conversations");
        }
    }
}
