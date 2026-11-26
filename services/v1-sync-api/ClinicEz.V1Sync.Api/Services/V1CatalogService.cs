using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using Npgsql;

namespace ClinicEz.V1Sync.Api.Services;

public sealed class V1CatalogService
{
    private readonly SyncConnectionFactory _connections;

    public V1CatalogService(SyncConnectionFactory connections)
    {
        _connections = connections;
    }

    public async Task<V1CatalogResponse> GetCatalogAsync(CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenV1SourceAsync(ct);

        var hasTenantSchema = false;
        await using (var schemaCmd = new NpgsqlCommand("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'Tenant'
            )
            AND EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'Clinic' AND column_name = 'tenantId'
            )
            AND EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'Organization' AND column_name = 'tenantId'
            )
            """, conn))
        {
            hasTenantSchema = Convert.ToBoolean(await schemaCmd.ExecuteScalarAsync(ct));
        }

        var tenants = new List<V1TenantCatalogItem>();
        if (hasTenantSchema)
        {
            await using var cmd = new NpgsqlCommand("""
                SELECT t.id,
                       t."tenantUid",
                       t.name,
                       (SELECT COUNT(*) FROM public."Clinic" c WHERE c."tenantId" = t.id AND c."deletedAt" IS NULL) AS clinic_cnt,
                       (SELECT COUNT(*) FROM public."Organization" o WHERE o."tenantId" = t.id AND o."deletedAt" IS NULL) AS org_cnt
                FROM public."Tenant" t
                WHERE t."deletedAt" IS NULL
                ORDER BY clinic_cnt DESC, org_cnt DESC, t.id ASC
                """, conn);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                tenants.Add(new V1TenantCatalogItem(
                    r.GetInt32(0),
                    r.IsDBNull(1) ? null : r.GetString(1),
                    r.GetString(2),
                    Convert.ToInt32(r.GetInt64(3)),
                    Convert.ToInt32(r.GetInt64(4))
                ));
            }
        }

        var clinics = new List<V1ClinicCatalogItem>();
        var clinicSql = hasTenantSchema
            ? """
                SELECT c.id,
                       c."clinicUid",
                       c.name,
                       (SELECT COUNT(*) FROM public."ClinicPatient" cp WHERE cp."clinicId" = c.id AND cp."deletedAt" IS NULL) AS patient_cnt,
                       (SELECT COUNT(*) FROM public."Appointment" a WHERE a."clinicId" = c.id AND a."deletedAt" IS NULL) AS appt_cnt,
                       (SELECT COUNT(*) FROM public."ConsultationTicket" ct WHERE ct."clinicId" = c.id AND ct."isActive" = true) AS consult_cnt,
                       c."tenantId"
                FROM public."Clinic" c
                WHERE c."deletedAt" IS NULL
                ORDER BY patient_cnt DESC, c.id ASC
                """
            : """
                SELECT c.id,
                       c."clinicUid",
                       c.name,
                       (SELECT COUNT(*) FROM public."ClinicPatient" cp WHERE cp."clinicId" = c.id AND cp."deletedAt" IS NULL) AS patient_cnt,
                       (SELECT COUNT(*) FROM public."Appointment" a WHERE a."clinicId" = c.id AND a."deletedAt" IS NULL) AS appt_cnt,
                       (SELECT COUNT(*) FROM public."ConsultationTicket" ct WHERE ct."clinicId" = c.id AND ct."isActive" = true) AS consult_cnt,
                       NULL::int AS "tenantId"
                FROM public."Clinic" c
                WHERE c."deletedAt" IS NULL
                ORDER BY patient_cnt DESC, c.id ASC
                """;
        await using (var cmd = new NpgsqlCommand(clinicSql, conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                clinics.Add(new V1ClinicCatalogItem(
                    r.GetInt32(0),
                    r.IsDBNull(1) ? null : r.GetString(1),
                    r.GetString(2),
                    Convert.ToInt32(r.GetInt64(3)),
                    Convert.ToInt32(r.GetInt64(4)),
                    Convert.ToInt32(r.GetInt64(5)),
                    r.IsDBNull(6) ? null : r.GetInt32(6)
                ));
            }
        }

        var orgs = new List<V1OrgCatalogItem>();
        var orgSql = hasTenantSchema
            ? """
                SELECT o.id,
                       o."orgUid",
                       o.name,
                       (SELECT COUNT(DISTINCT om."userId") FROM public."OrganizationMember" om WHERE om."organizationId" = o.id) AS member_cnt,
                       (SELECT COUNT(DISTINCT sr."userId") FROM public."UserStudentRecord" sr WHERE sr."organizationId" = o.id AND sr."deletedAt" IS NULL) AS student_cnt,
                       (SELECT COUNT(DISTINCT er."userId") FROM public."UserEmploymentRecord" er WHERE er."organizationId" = o.id AND er."deletedAt" IS NULL) AS emp_cnt,
                       o."tenantId"
                FROM public."Organization" o
                WHERE o."deletedAt" IS NULL
                ORDER BY member_cnt DESC, o.id ASC
                """
            : """
                SELECT o.id,
                       o."orgUid",
                       o.name,
                       (SELECT COUNT(DISTINCT om."userId") FROM public."OrganizationMember" om WHERE om."organizationId" = o.id) AS member_cnt,
                       (SELECT COUNT(DISTINCT sr."userId") FROM public."UserStudentRecord" sr WHERE sr."organizationId" = o.id AND sr."deletedAt" IS NULL) AS student_cnt,
                       (SELECT COUNT(DISTINCT er."userId") FROM public."UserEmploymentRecord" er WHERE er."organizationId" = o.id AND er."deletedAt" IS NULL) AS emp_cnt,
                       NULL::int AS "tenantId"
                FROM public."Organization" o
                WHERE o."deletedAt" IS NULL
                ORDER BY member_cnt DESC, o.id ASC
                """;
        await using (var cmd = new NpgsqlCommand(orgSql, conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                orgs.Add(new V1OrgCatalogItem(
                    r.GetInt32(0),
                    r.IsDBNull(1) ? null : r.GetString(1),
                    r.GetString(2),
                    Convert.ToInt32(r.GetInt64(3)),
                    Convert.ToInt32(r.GetInt64(4)),
                    Convert.ToInt32(r.GetInt64(5)),
                    r.IsDBNull(6) ? null : r.GetInt32(6)
                ));
            }
        }

        int totalActiveUsers = 0, clerkUsers = 0, legacyAuth0Users = 0, totalFiles = 0, privateFiles = 0;
        await using (var cmd = new NpgsqlCommand("""
            SELECT
                (SELECT COUNT(*) FROM public."User" WHERE "isActive" = true AND "deletedAt" IS NULL),
                (SELECT COUNT(*) FROM public."User" WHERE "isActive" = true AND "deletedAt" IS NULL AND "userId" LIKE 'user_%'),
                (SELECT COUNT(*) FROM public."User" WHERE "isActive" = true AND "deletedAt" IS NULL AND "userId" LIKE 'auth0|%'),
                (SELECT COUNT(*) FROM public."File" WHERE "isActive" = true AND "deletedAt" IS NULL),
                (SELECT COUNT(*) FROM public."File" f JOIN public."FileSetting" fs ON fs."fileId" = f.id
                 WHERE f."isActive" = true AND f."deletedAt" IS NULL AND fs.privacy::text = 'PRIVATE')
            """, conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            if (await r.ReadAsync(ct))
            {
                totalActiveUsers = Convert.ToInt32(r.GetInt64(0));
                clerkUsers = Convert.ToInt32(r.GetInt64(1));
                legacyAuth0Users = Convert.ToInt32(r.GetInt64(2));
                totalFiles = Convert.ToInt32(r.GetInt64(3));
                privateFiles = Convert.ToInt32(r.GetInt64(4));
            }
        }

        var preview = new List<CustomFieldExpansionPreviewItem>();
        await using (var cmd = new NpgsqlCommand("""
            SELECT
                (SELECT COUNT(*) FROM public."UserStudentRecord" WHERE "deletedAt" IS NULL AND lrn IS NOT NULL AND trim(lrn) <> ''),
                (SELECT COUNT(*) FROM public."UserStudentRecord" WHERE "deletedAt" IS NULL AND level IS NOT NULL AND trim(level::text) <> ''),
                (SELECT COUNT(*) FROM public."UserEmploymentRecord" WHERE "deletedAt" IS NULL AND "officeId" IS NOT NULL),
                (SELECT COUNT(*) FROM public."UserEmploymentRecord" WHERE "deletedAt" IS NULL AND position IS NOT NULL AND trim(position) <> ''),
                (SELECT COUNT(*) FROM public."UserEmploymentRecord" WHERE "deletedAt" IS NULL AND designation IS NOT NULL AND trim(designation) <> ''),
                (SELECT COUNT(*) FROM public."User" WHERE "deletedAt" IS NULL AND "placeOfBirth" IS NOT NULL AND trim("placeOfBirth") <> ''),
                (SELECT COUNT(*) FROM public."User" WHERE "deletedAt" IS NULL AND "caseNumber" IS NOT NULL AND trim("caseNumber") <> ''),
                (SELECT COUNT(*) FROM public."PhilHealthRecord" WHERE "deletedAt" IS NULL AND tin IS NOT NULL AND trim(tin) <> ''),
                (SELECT COUNT(*) FROM public."PhilHealthRecord" WHERE "deletedAt" IS NULL AND "philSysId" IS NOT NULL AND trim("philSysId") <> '')
            """, conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            if (await r.ReadAsync(ct))
            {
                preview.Add(new("lrn", "Learner Reference Number (LRN)", "Text", "Student", "UserStudentRecord.lrn", Convert.ToInt32(r.GetInt64(0))));
                preview.Add(new("student_level", "Academic Level", "Select", "Student", "UserStudentRecord.level", Convert.ToInt32(r.GetInt64(1))));
                preview.Add(new("office", "Assigned Office / Unit", "Text", "Employee", "UserEmploymentRecord.officeId", Convert.ToInt32(r.GetInt64(2))));
                preview.Add(new("position", "Job Position", "Text", "Employee", "UserEmploymentRecord.position", Convert.ToInt32(r.GetInt64(3))));
                preview.Add(new("designation", "Official Designation", "Text", "Employee", "UserEmploymentRecord.designation", Convert.ToInt32(r.GetInt64(4))));
                preview.Add(new("place_of_birth", "Place of Birth", "Text", "Demographics", "User.placeOfBirth", Convert.ToInt32(r.GetInt64(5))));
                preview.Add(new("legacy_case_number", "Legacy Case Number", "Text", "Institutional", "User.caseNumber", Convert.ToInt32(r.GetInt64(6))));
                preview.Add(new("tin", "Tax Identification Number (TIN)", "Text", "Statutory IDs", "PhilHealthRecord.tin", Convert.ToInt32(r.GetInt64(7))));
                preview.Add(new("philsys_id", "PhilSys National ID (PSN)", "Text", "Statutory IDs", "PhilHealthRecord.philSysId", Convert.ToInt32(r.GetInt64(8))));
            }
        }

        return new V1CatalogResponse(
            clinics,
            orgs,
            totalActiveUsers,
            clerkUsers,
            legacyAuth0Users,
            totalFiles,
            privateFiles,
            preview,
            tenants
        );
    }
}
