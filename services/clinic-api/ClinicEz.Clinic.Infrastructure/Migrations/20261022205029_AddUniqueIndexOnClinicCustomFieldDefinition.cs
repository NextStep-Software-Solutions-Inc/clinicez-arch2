using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueIndexOnClinicCustomFieldDefinition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey",
                schema: "public",
                table: "CustomFieldDefinitions");

            migrationBuilder.Sql(@"
                UPDATE ""public"".""CustomFieldDefinitions""
                SET ""FieldKey"" = COALESCE(
                    NULLIF(trim(both '_' from regexp_replace(lower(trim(""FieldKey"")), '[^a-z0-9_]+', '_', 'g')), ''),
                    'field_' || replace(""Id""::text, '-', '_')
                )
                WHERE ""FieldKey"" !~ '^[a-z0-9_]+$';

                WITH ranked AS (
                    SELECT ""Id"",
                           ROW_NUMBER() OVER (
                               PARTITION BY ""TenantId"", ""ClinicId"", ""EntityType"", ""FieldKey""
                               ORDER BY ""CreatedAt"" ASC, ""Id"" ASC
                           ) AS rn
                    FROM ""public"".""CustomFieldDefinitions""
                    WHERE ""IsDeleted"" = false
                )
                UPDATE ""public"".""CustomFieldDefinitions"" c
                SET ""IsDeleted"" = true,
                    ""IsActive"" = false,
                    ""DeletedAt"" = COALESCE(c.""DeletedAt"", NOW()),
                    ""DeletedBy"" = COALESCE(c.""DeletedBy"", 'MigrationDedupe')
                FROM ranked r
                WHERE c.""Id"" = r.""Id"" AND r.rn > 1;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey",
                schema: "public",
                table: "CustomFieldDefinitions",
                columns: new[] { "TenantId", "ClinicId", "EntityType", "FieldKey" },
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey",
                schema: "public",
                table: "CustomFieldDefinitions");

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey",
                schema: "public",
                table: "CustomFieldDefinitions",
                columns: new[] { "TenantId", "ClinicId", "EntityType", "FieldKey" });
        }
    }
}
