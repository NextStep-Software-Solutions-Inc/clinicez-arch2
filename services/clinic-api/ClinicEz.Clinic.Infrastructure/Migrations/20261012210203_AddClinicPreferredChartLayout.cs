using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicPreferredChartLayout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Clean up any stale migration history record from previous manual migration attempt
            migrationBuilder.Sql(@"
DELETE FROM clinic_dashboard.""__EFMigrationsHistory""
WHERE ""MigrationId"" = '20261013050000_AddClinicPreferredChartLayout';
");

            migrationBuilder.Sql(@"
ALTER TABLE clinic_dashboard.""ClinicSettings"" 
ADD COLUMN IF NOT EXISTS ""PreferredChartLayout"" character varying(50) DEFAULT 'modal';
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
ALTER TABLE clinic_dashboard.""ClinicSettings"" 
DROP COLUMN IF EXISTS ""PreferredChartLayout"";
");
        }
    }
}
