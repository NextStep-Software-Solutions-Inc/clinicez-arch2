using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261013050000_AddClinicPreferredChartLayout")]
    public partial class AddClinicPreferredChartLayout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
