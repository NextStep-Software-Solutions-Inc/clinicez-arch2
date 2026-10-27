using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EnforceUniqueClinicStaffEmail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_ClinicId_Email",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.Sql(@"
                UPDATE ""public"".""StaffMembers""
                SET ""Email"" = NULLIF(lower(btrim(""Email"")), '')
                WHERE ""Email"" IS NOT NULL
                  AND ""Email"" IS DISTINCT FROM NULLIF(lower(btrim(""Email"")), '');

                WITH ranked AS (
                    SELECT ""Id"",
                           ROW_NUMBER() OVER (
                               PARTITION BY ""ClinicId"", ""Email""
                               ORDER BY
                                   CASE WHEN ""Status"" = 'Active' AND ""IsActive"" = true THEN 0
                                        WHEN ""PasswordHash"" IS NOT NULL THEN 1
                                        WHEN ""Status"" = 'Suspended' THEN 2
                                        WHEN ""Status"" = 'Invited' THEN 3
                                        ELSE 4
                                   END ASC,
                                   ""CreatedAt"" ASC,
                                   ""Id"" ASC
                           ) AS rn
                    FROM ""public"".""StaffMembers""
                    WHERE ""IsDeleted"" = false
                      AND ""Email"" IS NOT NULL
                )
                UPDATE ""public"".""StaffMembers"" s
                SET ""IsDeleted"" = true,
                    ""IsActive"" = false,
                    ""Status"" = 'Revoked',
                    ""InvitationToken"" = NULL,
                    ""InvitationExpiresAt"" = NULL,
                    ""DeletedAt"" = COALESCE(s.""DeletedAt"", NOW()),
                    ""DeletedBy"" = COALESCE(s.""DeletedBy"", 'MigrationDedupe')
                FROM ranked r
                WHERE s.""Id"" = r.""Id"" AND r.rn > 1;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_ClinicId_Email",
                schema: "public",
                table: "StaffMembers",
                columns: new[] { "ClinicId", "Email" },
                unique: true,
                filter: "\"IsDeleted\" = false AND \"Email\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_ClinicId_Email",
                schema: "public",
                table: "StaffMembers");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_ClinicId_Email",
                schema: "public",
                table: "StaffMembers",
                columns: new[] { "ClinicId", "Email" });
        }
    }
}
