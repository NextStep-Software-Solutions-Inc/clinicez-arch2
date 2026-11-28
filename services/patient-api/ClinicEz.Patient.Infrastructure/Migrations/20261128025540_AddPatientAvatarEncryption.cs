using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientAvatarEncryption : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "avatar_content_type",
                table: "patients",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "avatar_encrypted_hash",
                table: "patients",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "avatar_encrypted_size_bytes",
                table: "patients",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "avatar_encryption_algorithm",
                table: "patients",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "avatar_encryption_iv_base64",
                table: "patients",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "avatar_encryption_key_id",
                table: "patients",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "avatar_encryption_tag_base64",
                table: "patients",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "avatar_wrapped_key_json",
                table: "patients",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "avatar_content_type",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "avatar_encrypted_hash",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "avatar_encrypted_size_bytes",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "avatar_encryption_algorithm",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "avatar_encryption_iv_base64",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "avatar_encryption_key_id",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "avatar_encryption_tag_base64",
                table: "patients");

            migrationBuilder.DropColumn(
                name: "avatar_wrapped_key_json",
                table: "patients");
        }
    }
}
