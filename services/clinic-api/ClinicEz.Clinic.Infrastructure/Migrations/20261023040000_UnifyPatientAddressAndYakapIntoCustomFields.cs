using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UnifyPatientAddressAndYakapIntoCustomFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Backfill non-null address, emergency contact, and PhilHealth YAKAP sequence columns into CustomFields JSONB
            migrationBuilder.Sql(@"
                UPDATE ""public"".""Patients""
                SET ""CustomFields"" = (
                    COALESCE(NULLIF(trim(""CustomFields""), ''), '{}')::jsonb ||
                    jsonb_strip_nulls(jsonb_build_object(
                        'primary_address_line', NULLIF(trim(""AddressLine""), ''),
                        'primary_barangay', NULLIF(trim(""Barangay""), ''),
                        'primary_city', NULLIF(trim(""City""), ''),
                        'primary_province', NULLIF(trim(""Province""), ''),
                        'emergency_contact_name', NULLIF(trim(""EmergencyContactName""), ''),
                        'emergency_contact_phone', NULLIF(trim(""EmergencyContactPhone""), ''),
                        'emergency_contact_relationship', NULLIF(trim(""EmergencyContactRelationship""), ''),
                        'yakap_enlistments', CASE
                            WHEN NULLIF(trim(""PhilHealthCaseNo""), '') IS NOT NULL
                              OR NULLIF(trim(""PhilHealthEnlistmentNo""), '') IS NOT NULL
                              OR NULLIF(trim(""PhilHealthProfilingTransNo""), '') IS NOT NULL
                            THEN
                                CASE
                                    WHEN jsonb_typeof(COALESCE(NULLIF(trim(""CustomFields""), ''), '{}')::jsonb -> 'yakap_enlistments') = 'array'
                                         AND jsonb_array_length(COALESCE(NULLIF(trim(""CustomFields""), ''), '{}')::jsonb -> 'yakap_enlistments') > 0
                                    THEN COALESCE(NULLIF(trim(""CustomFields""), ''), '{}')::jsonb -> 'yakap_enlistments'
                                    ELSE jsonb_build_array(
                                        jsonb_build_object(
                                            'enlisted_at', to_char(""CreatedAt"", 'YYYY-MM-DD'),
                                            'valid_until', COALESCE(
                                                substring(COALESCE(NULLIF(trim(""PhilHealthCaseNo""), ''), NULLIF(trim(""PhilHealthEnlistmentNo""), ''), NULLIF(trim(""PhilHealthProfilingTransNo""), '')) from '(20[2-9][0-9])'),
                                                to_char(""CreatedAt"", 'YYYY')
                                            ) || '-12-31',
                                            'effective_year', COALESCE(
                                                (substring(COALESCE(NULLIF(trim(""PhilHealthCaseNo""), ''), NULLIF(trim(""PhilHealthEnlistmentNo""), ''), NULLIF(trim(""PhilHealthProfilingTransNo""), '')) from '(20[2-9][0-9])'))::int,
                                                EXTRACT(YEAR FROM ""CreatedAt"")::int
                                            ),
                                            'status', 'Active',
                                            'source', 'ClinicEnlistment',
                                            'case_no', NULLIF(trim(""PhilHealthCaseNo""), ''),
                                            'enlistment_no', NULLIF(trim(""PhilHealthEnlistmentNo""), ''),
                                            'profiling_trans_no', NULLIF(trim(""PhilHealthProfilingTransNo""), '')
                                        )
                                    )
                                END
                            ELSE
                                COALESCE(NULLIF(trim(""CustomFields""), ''), '{}')::jsonb -> 'yakap_enlistments'
                        END
                    ))
                )::text
                WHERE ""AddressLine"" IS NOT NULL
                   OR ""Barangay"" IS NOT NULL
                   OR ""City"" IS NOT NULL
                   OR ""Province"" IS NOT NULL
                   OR ""EmergencyContactName"" IS NOT NULL
                   OR ""EmergencyContactPhone"" IS NOT NULL
                   OR ""EmergencyContactRelationship"" IS NOT NULL
                   OR ""PhilHealthCaseNo"" IS NOT NULL
                   OR ""PhilHealthEnlistmentNo"" IS NOT NULL
                   OR ""PhilHealthProfilingTransNo"" IS NOT NULL;
            ");

            // 2. Drop the 10 static columns from public.Patients
            migrationBuilder.DropColumn(name: "AddressLine", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "Barangay", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "City", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "Province", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "EmergencyContactName", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "EmergencyContactPhone", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "EmergencyContactRelationship", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "PhilHealthCaseNo", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "PhilHealthEnlistmentNo", schema: "public", table: "Patients");
            migrationBuilder.DropColumn(name: "PhilHealthProfilingTransNo", schema: "public", table: "Patients");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // 1. Recreate the 10 static columns as nullable text on public.Patients
            migrationBuilder.AddColumn<string>(name: "AddressLine", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "Barangay", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "City", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "Province", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "EmergencyContactName", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "EmergencyContactPhone", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "EmergencyContactRelationship", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "PhilHealthCaseNo", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "PhilHealthEnlistmentNo", schema: "public", table: "Patients", type: "text", nullable: true);
            migrationBuilder.AddColumn<string>(name: "PhilHealthProfilingTransNo", schema: "public", table: "Patients", type: "text", nullable: true);

            // 2. Reverse SQL: restore column values from CustomFields JSONB
            migrationBuilder.Sql(@"
                UPDATE ""public"".""Patients""
                SET ""AddressLine"" = NULLIF(""CustomFields""::jsonb ->> 'primary_address_line', ''),
                    ""Barangay"" = NULLIF(""CustomFields""::jsonb ->> 'primary_barangay', ''),
                    ""City"" = NULLIF(""CustomFields""::jsonb ->> 'primary_city', ''),
                    ""Province"" = NULLIF(""CustomFields""::jsonb ->> 'primary_province', ''),
                    ""EmergencyContactName"" = NULLIF(""CustomFields""::jsonb ->> 'emergency_contact_name', ''),
                    ""EmergencyContactPhone"" = NULLIF(""CustomFields""::jsonb ->> 'emergency_contact_phone', ''),
                    ""EmergencyContactRelationship"" = NULLIF(""CustomFields""::jsonb ->> 'emergency_contact_relationship', ''),
                    ""PhilHealthCaseNo"" = NULLIF(""CustomFields""::jsonb -> 'yakap_enlistments' -> 0 ->> 'case_no', ''),
                    ""PhilHealthEnlistmentNo"" = NULLIF(""CustomFields""::jsonb -> 'yakap_enlistments' -> 0 ->> 'enlistment_no', ''),
                    ""PhilHealthProfilingTransNo"" = NULLIF(""CustomFields""::jsonb -> 'yakap_enlistments' -> 0 ->> 'profiling_trans_no', '')
                WHERE ""CustomFields"" IS NOT NULL 
                  AND trim(""CustomFields"") != '' 
                  AND trim(""CustomFields"") != '{}';
            ");
        }
    }
}
