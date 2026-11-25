using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientCommsAttachmentCrypto : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "message_id",
                table: "patient_message_attachments",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "encryption_algorithm",
                table: "patient_message_attachments",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "encryption_iv_base64",
                table: "patient_message_attachments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "encryption_tag_base64",
                table: "patient_message_attachments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "patient_id",
                table: "patient_message_attachments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "wrapped_key_json",
                table: "patient_message_attachments",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_patient_message_attachments_patient_id_storage_key",
                table: "patient_message_attachments",
                columns: new[] { "patient_id", "storage_key" });

            migrationBuilder.CreateIndex(
                name: "ix_patient_message_attachments_storage_key",
                table: "patient_message_attachments",
                column: "storage_key");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_patient_message_attachments_patient_id_storage_key",
                table: "patient_message_attachments");

            migrationBuilder.DropIndex(
                name: "ix_patient_message_attachments_storage_key",
                table: "patient_message_attachments");

            migrationBuilder.DropColumn(
                name: "encryption_algorithm",
                table: "patient_message_attachments");

            migrationBuilder.DropColumn(
                name: "encryption_iv_base64",
                table: "patient_message_attachments");

            migrationBuilder.DropColumn(
                name: "encryption_tag_base64",
                table: "patient_message_attachments");

            migrationBuilder.DropColumn(
                name: "patient_id",
                table: "patient_message_attachments");

            migrationBuilder.DropColumn(
                name: "wrapped_key_json",
                table: "patient_message_attachments");

            migrationBuilder.AlterColumn<Guid>(
                name: "message_id",
                table: "patient_message_attachments",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
