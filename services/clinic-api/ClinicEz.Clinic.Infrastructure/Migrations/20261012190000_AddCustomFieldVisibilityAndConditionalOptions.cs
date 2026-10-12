using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261012190000_AddCustomFieldVisibilityAndConditionalOptions")]
    public partial class AddCustomFieldVisibilityAndConditionalOptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE clinic_dashboard.""CustomFieldDefinitions"" 
                ADD COLUMN IF NOT EXISTS ""VisibilityRuleJson"" text;

                ALTER TABLE clinic_dashboard.""CustomFieldDefinitions"" 
                ADD COLUMN IF NOT EXISTS ""ConditionalOptionsJson"" text;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE clinic_dashboard.""CustomFieldDefinitions"" 
                DROP COLUMN IF EXISTS ""VisibilityRuleJson"";

                ALTER TABLE clinic_dashboard.""CustomFieldDefinitions"" 
                DROP COLUMN IF EXISTS ""ConditionalOptionsJson"";
            ");
        }
    }
}
