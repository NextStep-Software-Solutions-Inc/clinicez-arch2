using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Patient.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EnumsStoredAsStringsAndMultiDeviceSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_device_sessions_patient_id",
                table: "device_sessions");

            migrationBuilder.DropColumn(
                name: "redis_key",
                table: "device_sessions");

            // Enums are stored by name. Existing integer values are translated, never cast to their digits.
            migrationBuilder.Sql("""
                ALTER TABLE provider_availabilities
                ALTER COLUMN day_of_week TYPE character varying(64)
                USING (CASE day_of_week
                    WHEN 0 THEN 'Sunday'
                    WHEN 1 THEN 'Monday'
                    WHEN 2 THEN 'Tuesday'
                    WHEN 3 THEN 'Wednesday'
                    WHEN 4 THEN 'Thursday'
                    WHEN 5 THEN 'Friday'
                    WHEN 6 THEN 'Saturday'
                END)::character varying(64);
                """);

            migrationBuilder.AddColumn<string>(
                name: "scopes",
                table: "patient_access_grants",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "None");

            // AccessScopes is a [Flags] enum: EF stores it as "Name, Name" in ascending bit order, "All" for every bit.
            migrationBuilder.Sql("""
                UPDATE patient_access_grants
                SET scopes = CASE
                    WHEN scopes_mask = 0 THEN 'None'
                    WHEN scopes_mask = 255 THEN 'All'
                    ELSE concat_ws(', ',
                        CASE WHEN (scopes_mask & 1) <> 0 THEN 'Demographics' END,
                        CASE WHEN (scopes_mask & 2) <> 0 THEN 'Allergies' END,
                        CASE WHEN (scopes_mask & 4) <> 0 THEN 'Medications' END,
                        CASE WHEN (scopes_mask & 8) <> 0 THEN 'Conditions' END,
                        CASE WHEN (scopes_mask & 16) <> 0 THEN 'Immunizations' END,
                        CASE WHEN (scopes_mask & 32) <> 0 THEN 'LabResults' END,
                        CASE WHEN (scopes_mask & 64) <> 0 THEN 'Prescriptions' END,
                        CASE WHEN (scopes_mask & 128) <> 0 THEN 'Vitals' END)
                END;
                """);

            migrationBuilder.Sql("ALTER TABLE patient_access_grants ALTER COLUMN scopes DROP DEFAULT;");

            migrationBuilder.DropColumn(
                name: "scopes_mask",
                table: "patient_access_grants");

            migrationBuilder.CreateIndex(
                name: "ix_device_sessions_patient_id_device_id",
                table: "device_sessions",
                columns: new[] { "patient_id", "device_id" },
                unique: true,
                filter: "is_revoked = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_device_sessions_patient_id_device_id",
                table: "device_sessions");

            migrationBuilder.AddColumn<int>(
                name: "scopes_mask",
                table: "patient_access_grants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""
                UPDATE patient_access_grants
                SET scopes_mask =
                    CASE WHEN scopes ~ '(^|, )Demographics(,|$)' THEN 1 ELSE 0 END
                    + CASE WHEN scopes ~ '(^|, )Allergies(,|$)' THEN 2 ELSE 0 END
                    + CASE WHEN scopes ~ '(^|, )Medications(,|$)' THEN 4 ELSE 0 END
                    + CASE WHEN scopes ~ '(^|, )Conditions(,|$)' THEN 8 ELSE 0 END
                    + CASE WHEN scopes ~ '(^|, )Immunizations(,|$)' THEN 16 ELSE 0 END
                    + CASE WHEN scopes ~ '(^|, )LabResults(,|$)' THEN 32 ELSE 0 END
                    + CASE WHEN scopes ~ '(^|, )Prescriptions(,|$)' THEN 64 ELSE 0 END
                    + CASE WHEN scopes ~ '(^|, )Vitals(,|$)' THEN 128 ELSE 0 END;
                UPDATE patient_access_grants SET scopes_mask = 255 WHERE scopes = 'All';
                """);

            migrationBuilder.Sql("ALTER TABLE patient_access_grants ALTER COLUMN scopes_mask DROP DEFAULT;");

            migrationBuilder.DropColumn(
                name: "scopes",
                table: "patient_access_grants");

            migrationBuilder.Sql("""
                ALTER TABLE provider_availabilities
                ALTER COLUMN day_of_week TYPE integer
                USING (CASE day_of_week
                    WHEN 'Sunday' THEN 0
                    WHEN 'Monday' THEN 1
                    WHEN 'Tuesday' THEN 2
                    WHEN 'Wednesday' THEN 3
                    WHEN 'Thursday' THEN 4
                    WHEN 'Friday' THEN 5
                    WHEN 'Saturday' THEN 6
                END);
                """);

            migrationBuilder.AddColumn<string>(
                name: "redis_key",
                table: "device_sessions",
                type: "character varying(256)",
                maxLength: 256,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("ALTER TABLE device_sessions ALTER COLUMN redis_key DROP DEFAULT;");

            migrationBuilder.CreateIndex(
                name: "ix_device_sessions_patient_id",
                table: "device_sessions",
                column: "patient_id",
                unique: true,
                filter: "is_revoked = false");
        }
    }
}
