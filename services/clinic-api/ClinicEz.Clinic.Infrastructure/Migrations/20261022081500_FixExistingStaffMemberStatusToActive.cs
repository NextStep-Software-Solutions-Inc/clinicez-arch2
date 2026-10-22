using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixExistingStaffMemberStatusToActive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Status",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Active",
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldDefaultValue: "Invited");

            migrationBuilder.Sql(@"
                UPDATE ""public"".""StaffMembers""
                SET ""Status"" = 'Active',
                    ""InviteAcceptedAt"" = COALESCE(""InviteAcceptedAt"", ""CreatedAt"")
                WHERE (""PasswordHash"" IS NOT NULL OR ""InvitationToken"" IS NULL)
                  AND ""Status"" = 'Invited';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Status",
                schema: "public",
                table: "StaffMembers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Invited",
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldDefaultValue: "Active");
        }
    }
}
