using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientAvatar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AvatarContentType",
                schema: "public",
                table: "Patients",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AvatarEncryptedHash",
                schema: "public",
                table: "Patients",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "AvatarEncryptedSizeBytes",
                schema: "public",
                table: "Patients",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AvatarEncryptionAlgorithm",
                schema: "public",
                table: "Patients",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AvatarEncryptionIvBase64",
                schema: "public",
                table: "Patients",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AvatarEncryptionKeyId",
                schema: "public",
                table: "Patients",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AvatarEncryptionTagBase64",
                schema: "public",
                table: "Patients",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AvatarUrl",
                schema: "public",
                table: "Patients",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AvatarWrappedKeyJson",
                schema: "public",
                table: "Patients",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarContentType",
                schema: "public",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "AvatarEncryptedHash",
                schema: "public",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "AvatarEncryptedSizeBytes",
                schema: "public",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "AvatarEncryptionAlgorithm",
                schema: "public",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "AvatarEncryptionIvBase64",
                schema: "public",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "AvatarEncryptionKeyId",
                schema: "public",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "AvatarEncryptionTagBase64",
                schema: "public",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "AvatarUrl",
                schema: "public",
                table: "Patients");

            migrationBuilder.DropColumn(
                name: "AvatarWrappedKeyJson",
                schema: "public",
                table: "Patients");
        }
    }
}
