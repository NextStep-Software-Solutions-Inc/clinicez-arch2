using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MultiRedeemShareCodesAndBookingSections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_share_token_uses_token_id",
                table: "share_token_uses");

            migrationBuilder.AddColumn<Guid>(
                name: "facility_id",
                table: "share_token_uses",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<int>(
                name: "sequence",
                table: "share_token_uses",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "share_sections",
                table: "booking_drafts",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "None");

            // Every pre-existing use was the one and only redemption of its token, by the facility its grant names.
            migrationBuilder.Sql(
                "UPDATE share_token_uses u SET sequence = 1, facility_id = g.facility_id " +
                "FROM patient_access_grants g WHERE g.id = u.grant_id;");

            migrationBuilder.CreateTable(
                name: "share_code_failures",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_share_code_failures", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "share_codes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    code_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    scopes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    purpose = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_share_codes", x => x.id);
                    table.ForeignKey(
                        name: "fk_share_codes_patients_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_share_token_uses_token_id_message_id",
                table: "share_token_uses",
                columns: new[] { "token_id", "message_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_share_token_uses_token_id_sequence",
                table: "share_token_uses",
                columns: new[] { "token_id", "sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_share_code_failures_actor_created_at",
                table: "share_code_failures",
                columns: new[] { "actor", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_share_code_failures_patient_id_created_at",
                table: "share_code_failures",
                columns: new[] { "patient_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_share_codes_patient_id_code_hash",
                table: "share_codes",
                columns: new[] { "patient_id", "code_hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_share_codes_token_id",
                table: "share_codes",
                column: "token_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // A token could only be redeemed once before this migration, so later redemptions have no place in the old shape.
            migrationBuilder.Sql("DELETE FROM share_token_uses WHERE sequence > 1;");

            migrationBuilder.DropTable(
                name: "share_code_failures");

            migrationBuilder.DropTable(
                name: "share_codes");

            migrationBuilder.DropIndex(
                name: "ix_share_token_uses_token_id_message_id",
                table: "share_token_uses");

            migrationBuilder.DropIndex(
                name: "ix_share_token_uses_token_id_sequence",
                table: "share_token_uses");

            migrationBuilder.DropColumn(
                name: "facility_id",
                table: "share_token_uses");

            migrationBuilder.DropColumn(
                name: "sequence",
                table: "share_token_uses");

            migrationBuilder.DropColumn(
                name: "share_sections",
                table: "booking_drafts");

            migrationBuilder.CreateIndex(
                name: "ix_share_token_uses_token_id",
                table: "share_token_uses",
                column: "token_id",
                unique: true);
        }
    }
}
