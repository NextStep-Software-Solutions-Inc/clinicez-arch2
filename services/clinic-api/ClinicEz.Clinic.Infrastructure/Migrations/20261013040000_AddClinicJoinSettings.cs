using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicJoinSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Defensive cleanup of any stale migration history record
            migrationBuilder.Sql(@"
DELETE FROM clinic_dashboard.""__EFMigrationsHistory""
WHERE ""MigrationId"" = '20261013040000_AddClinicJoinSettings';
");

            migrationBuilder.Sql(@"
ALTER TABLE clinic_dashboard.""ClinicSettings"" 
ADD COLUMN IF NOT EXISTS ""IsJoinEnabled"" boolean NOT NULL DEFAULT true;

ALTER TABLE clinic_dashboard.""ClinicSettings"" 
ADD COLUMN IF NOT EXISTS ""JoinCode"" character varying(50);

ALTER TABLE clinic_dashboard.""ClinicSettings"" 
ADD COLUMN IF NOT EXISTS ""JoinCodeExpiresAt"" timestamp with time zone;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
ALTER TABLE clinic_dashboard.""ClinicSettings"" 
DROP COLUMN IF EXISTS ""IsJoinEnabled"";

ALTER TABLE clinic_dashboard.""ClinicSettings"" 
DROP COLUMN IF EXISTS ""JoinCode"";

ALTER TABLE clinic_dashboard.""ClinicSettings"" 
DROP COLUMN IF EXISTS ""JoinCodeExpiresAt"";
");
        }
    }
}
