using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <summary>
    /// Every enum column is stored as its member name. The two columns that still held numbers are converted in place
    /// (the generated AlterColumn cannot cast integer to text); an unexpected number leaves NULL and fails the NOT NULL
    /// constraint instead of being converted silently.
    /// </summary>
    public partial class EnumsAsStrings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE main."WebhookDeliveries"
                    ALTER COLUMN "Status" TYPE character varying(16)
                    USING (CASE "Status" WHEN 0 THEN 'Pending' WHEN 1 THEN 'Succeeded' WHEN 2 THEN 'Failed' END);
                """);

            migrationBuilder.Sql("""
                ALTER TABLE main."FacilityLinks"
                    ALTER COLUMN "Scopes" TYPE character varying(64)
                    USING (CASE
                        WHEN "Scopes" = 0 THEN 'None'
                        WHEN "Scopes" = 15 THEN 'All'
                        ELSE concat_ws(', ',
                            CASE WHEN "Scopes" & 1 <> 0 THEN 'LabOrder' END,
                            CASE WHEN "Scopes" & 2 <> 0 THEN 'Prescription' END,
                            CASE WHEN "Scopes" & 4 <> 0 THEN 'Referral' END,
                            CASE WHEN "Scopes" & 8 <> 0 THEN 'Result' END)
                    END);
                """);

            migrationBuilder.AlterColumn<string>(
                name: "Status",
                schema: "main",
                table: "Facilities",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "FacilityType",
                schema: "main",
                table: "Facilities",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE main."WebhookDeliveries"
                    ALTER COLUMN "Status" TYPE integer
                    USING (CASE "Status" WHEN 'Pending' THEN 0 WHEN 'Succeeded' THEN 1 WHEN 'Failed' THEN 2 END);
                """);

            migrationBuilder.Sql("""
                ALTER TABLE main."FacilityLinks"
                    ALTER COLUMN "Scopes" TYPE integer
                    USING (CASE
                        WHEN "Scopes" = 'All' THEN 15
                        ELSE (CASE WHEN position('LabOrder' in "Scopes") > 0 THEN 1 ELSE 0 END)
                           | (CASE WHEN position('Prescription' in "Scopes") > 0 THEN 2 ELSE 0 END)
                           | (CASE WHEN position('Referral' in "Scopes") > 0 THEN 4 ELSE 0 END)
                           | (CASE WHEN position('Result' in "Scopes") > 0 THEN 8 ELSE 0 END)
                    END);
                """);

            migrationBuilder.AlterColumn<string>(
                name: "Status",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64);

            migrationBuilder.AlterColumn<string>(
                name: "FacilityType",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64);
        }
    }
}
