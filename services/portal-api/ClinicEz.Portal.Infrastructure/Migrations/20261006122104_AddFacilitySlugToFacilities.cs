using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFacilitySlugToFacilities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Slug",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(@"
                UPDATE main.""Facilities""
                SET ""Slug"" = lower(trim(both '-' from regexp_replace(regexp_replace(""Name"", '[^a-zA-Z0-9]+', '-', 'g'), '-+', '-', 'g')));

                UPDATE main.""Facilities""
                SET ""Slug"" = 'facility-' || substr(""Id""::text, 1, 8)
                WHERE ""Slug"" IS NULL OR ""Slug"" = '';

                UPDATE main.""Facilities"" f1
                SET ""Slug"" = f1.""Slug"" || '-' || substr(f1.""Id""::text, 1, 4)
                WHERE f1.""Id"" IN (
                    SELECT f2.""Id"" FROM main.""Facilities"" f2
                    JOIN main.""Facilities"" f3 ON f2.""Slug"" = f3.""Slug"" AND f2.""Id"" != f3.""Id""
                );
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_Slug",
                schema: "main",
                table: "Facilities",
                column: "Slug",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Facilities_Slug",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "Slug",
                schema: "main",
                table: "Facilities");
        }
    }
}
