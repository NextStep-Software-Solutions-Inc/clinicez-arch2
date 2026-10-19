using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Interop.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientSigningKeyAndStringEnums : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // LinkScopes was stored as its [Flags] integer; every enum is now stored as its name. Converted in place so existing links keep their scopes
            // (the names are what Enum.ToString() produces for each combination of LabOrder=1, Prescription=2, Referral=4, Result=8; 15 is All).
            migrationBuilder.Sql("""
                ALTER TABLE "interop_hub"."Links"
                ALTER COLUMN "Scopes" TYPE character varying(64)
                USING CASE "Scopes"
                    WHEN 0 THEN 'None'
                    WHEN 1 THEN 'LabOrder'
                    WHEN 2 THEN 'Prescription'
                    WHEN 3 THEN 'LabOrder, Prescription'
                    WHEN 4 THEN 'Referral'
                    WHEN 5 THEN 'LabOrder, Referral'
                    WHEN 6 THEN 'Prescription, Referral'
                    WHEN 7 THEN 'LabOrder, Prescription, Referral'
                    WHEN 8 THEN 'Result'
                    WHEN 9 THEN 'LabOrder, Result'
                    WHEN 10 THEN 'Prescription, Result'
                    WHEN 11 THEN 'LabOrder, Prescription, Result'
                    WHEN 12 THEN 'Referral, Result'
                    WHEN 13 THEN 'LabOrder, Referral, Result'
                    WHEN 14 THEN 'Prescription, Referral, Result'
                    WHEN 15 THEN 'All'
                    ELSE 'None'
                END;
                """);

            migrationBuilder.AddColumn<string>(
                name: "PublicKeyPem",
                schema: "interop_hub",
                table: "Clients",
                type: "character varying(1024)",
                maxLength: 1024,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PublicKeyPem",
                schema: "interop_hub",
                table: "Clients");

            migrationBuilder.Sql("""
                ALTER TABLE "interop_hub"."Links"
                ALTER COLUMN "Scopes" TYPE integer
                USING CASE
                    WHEN "Scopes" = 'All' THEN 15
                    ELSE (CASE WHEN "Scopes" LIKE '%LabOrder%' THEN 1 ELSE 0 END)
                       + (CASE WHEN "Scopes" LIKE '%Prescription%' THEN 2 ELSE 0 END)
                       + (CASE WHEN "Scopes" LIKE '%Referral%' THEN 4 ELSE 0 END)
                       + (CASE WHEN "Scopes" LIKE '%Result%' THEN 8 ELSE 0 END)
                END;
                """);
        }
    }
}
