using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Models;
using Npgsql;
using NpgsqlTypes;

namespace ClinicEz.V1Sync.Api.Services.ConflictDiff;

public sealed record ConflictLiveSnapshot(
    string V1RecordStatus,
    string V2RecordStatus,
    DateTimeOffset? V1UpdatedAtUtc,
    DateTimeOffset? V2UpdatedAtUtc,
    IReadOnlyDictionary<string, string?>? V1CanonicalFields,
    IReadOnlyDictionary<string, string?>? V2CanonicalFields,
    IReadOnlyList<ConflictFieldSpec> FieldSpecs,
    string? Note = null
);

public interface IConflictDiffInspector
{
    string Track { get; }
    string EntityType { get; }

    Task<ConflictLiveSnapshot> LoadSnapshotAsync(
        SyncBinding binding,
        SyncConflictRecord conflict,
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        CancellationToken ct);
}

internal static class InspectorDbHelpers
{
    public static string? GetStr(NpgsqlDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);

    public static DateTimeOffset? GetUtc(NpgsqlDataReader r, int i)
    {
        if (r.IsDBNull(i)) return null;
        var val = r.GetValue(i);
        return val switch
        {
            DateTimeOffset dto => dto.ToUniversalTime(),
            DateTime dt => new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc)),
            _ => null
        };
    }

    public static decimal? GetDecNullable(NpgsqlDataReader r, int i)
    {
        if (r.IsDBNull(i)) return null;
        var val = r.GetValue(i);
        return val switch
        {
            decimal dec => dec,
            double dbl when !double.IsNaN(dbl) && !double.IsInfinity(dbl) => Convert.ToDecimal(Math.Round(dbl, 4)),
            float flt when !float.IsNaN(flt) && !float.IsInfinity(flt) => Convert.ToDecimal(Math.Round(flt, 4)),
            int iv => (decimal)iv,
            long lv => (decimal)lv,
            _ => null
        };
    }

    public static async Task<bool> ColumnExistsAsync(NpgsqlConnection conn, string tableName, string columnName, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = @tbl AND column_name = @col
            )
            """, conn);
        cmd.Parameters.AddWithValue("tbl", tableName);
        cmd.Parameters.AddWithValue("col", columnName);
        return await cmd.ExecuteScalarAsync(ct) is true;
    }

    public static async Task<bool> TableExistsAsync(NpgsqlConnection conn, string tableName, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = @tbl
            )
            """, conn);
        cmd.Parameters.AddWithValue("tbl", tableName);
        return await cmd.ExecuteScalarAsync(ct) is true;
    }
}

public sealed class Track2PatientAccountConflictInspector : IConflictDiffInspector
{
    public string Track => SyncTrack.Track2Patient;
    public string EntityType => "PatientAccount";

    private static readonly IReadOnlyList<ConflictFieldSpec> Specs =
    [
        new("first_name", "First Name", FieldSensitivity.PiiMasked),
        new("middle_name", "Middle Name", FieldSensitivity.PiiMasked),
        new("last_name", "Last Name", FieldSensitivity.PiiMasked),
        new("suffix", "Suffix", FieldSensitivity.PiiMasked),
        new("sex", "Sex", FieldSensitivity.SafeEnumOrBool),
        new("date_of_birth", "Date of Birth", FieldSensitivity.PiiMasked),
        new("place_of_birth", "Place of Birth", FieldSensitivity.PiiMasked),
        new("civil_status", "Civil Status", FieldSensitivity.SafeEnumOrBool),
        new("blood_type", "Blood Type", FieldSensitivity.SafeEnumOrBool),
        new("nationality", "Nationality", FieldSensitivity.PiiMasked),
        new("religion", "Religion", FieldSensitivity.PiiMasked),
        new("mobile", "Mobile Number", FieldSensitivity.PiiMasked),
        new("alt_phone", "Alternate Phone", FieldSensitivity.PiiMasked),
        new("email", "Email Address", FieldSensitivity.PiiMasked),
    ];

    public async Task<ConflictLiveSnapshot> LoadSnapshotAsync(
        SyncBinding binding,
        SyncConflictRecord conflict,
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        CancellationToken ct)
    {
        var v1Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v1UpdatedAt = null;
        Dictionary<string, string?>? v1Fields = null;

        if (int.TryParse(conflict.V1Id, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v1UserId))
        {
            var isGlobal = string.Equals(binding.PatientCohortMode, SyncCohortMode.Global, StringComparison.OrdinalIgnoreCase);
            const string v1Sql = """
                SELECT u.id, u.email, u."firstName", u."middleName", u."lastName", u.suffix,
                       u.gender::text, u.dob, u."placeOfBirth", u."bloodType"::text, u."civilStatus"::text,
                       u.nationality, u.religion, u.mobile, u.telephone,
                       u."createdAt", u."updatedAt", u."deletedAt", u."isActive",
                       (
                           @isGlobal
                           OR (@cid IS NOT NULL AND EXISTS (
                               SELECT 1 FROM public."ClinicPatient" cp
                               WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL
                           ))
                           OR (@oid IS NOT NULL AND EXISTS (
                               SELECT 1 FROM public."OrganizationMember" om
                               WHERE om."userId" = u.id AND om."organizationId" = @oid
                           ))
                       ) AS in_scope
                FROM public."User" u
                WHERE u.id = @uid
                """;
            await using var cmd = new NpgsqlCommand(v1Sql, v1);
            cmd.Parameters.AddWithValue("uid", v1UserId);
            cmd.Parameters.AddWithValue("isGlobal", isGlobal);
            cmd.Parameters.Add(new NpgsqlParameter("cid", NpgsqlDbType.Integer) { Value = (object?)binding.V1ClinicId ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)binding.V1OrgId ?? DBNull.Value });

            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                DateOnly? dob = r.IsDBNull(7) ? null : r.GetFieldValue<DateOnly>(7);
                if (dob.HasValue && (dob.Value.Year < 1900 || dob.Value > DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1))))
                {
                    dob = null;
                }

                var createdAt = InspectorDbHelpers.GetUtc(r, 15);
                var updatedAt = InspectorDbHelpers.GetUtc(r, 16) ?? createdAt;
                var deletedAt = InspectorDbHelpers.GetUtc(r, 17);
                var isActive = r.IsDBNull(18) || r.GetBoolean(18);
                var inScope = !r.IsDBNull(19) && r.GetBoolean(19);

                v1UpdatedAt = updatedAt;
                if (deletedAt.HasValue || !isActive)
                {
                    v1Status = ConflictRecordStatus.SoftDeleted;
                }
                else if (!inScope)
                {
                    v1Status = ConflictRecordStatus.MissingOrOutOfScope;
                }
                else
                {
                    v1Status = ConflictRecordStatus.Active;
                }

                v1Fields = Track2PatientSyncEngine.BuildPatientCanonicalMap(
                    fn: SyncTransforms.CleanRequired(InspectorDbHelpers.GetStr(r, 2), "Unknown", 100),
                    mn: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 3), 100),
                    ln: SyncTransforms.CleanRequired(InspectorDbHelpers.GetStr(r, 4), "Patient", 100),
                    suf: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 5), 20),
                    sex: SyncTransforms.MapPatientSex(InspectorDbHelpers.GetStr(r, 6)),
                    dob: dob,
                    pob: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 8), 250),
                    civil: SyncTransforms.MapPatientCivilStatus(InspectorDbHelpers.GetStr(r, 10)),
                    blood: SyncTransforms.MapBloodType(InspectorDbHelpers.GetStr(r, 9)),
                    nat: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 11), 80),
                    rel: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 12), 80),
                    mob: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 13), 20),
                    alt: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 14), 20),
                    email: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 1), 254));
            }
        }

        var v2Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v2UpdatedAt = null;
        Dictionary<string, string?>? v2Fields = null;

        const string v2Sql = """
            SELECT first_name, middle_name, last_name, suffix,
                   sex, date_of_birth, place_of_birth, civil_status, blood_type,
                   nationality, religion, mobile, alt_phone, email,
                   created_at, updated_at, is_deleted
            FROM public.patients
            WHERE id = @id
            """;
        await using (var cmd = new NpgsqlCommand(v2Sql, v2))
        {
            cmd.Parameters.AddWithValue("id", conflict.V2Id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var dob = r.IsDBNull(5) ? (DateOnly?)null : r.GetFieldValue<DateOnly>(5);
                var createdAt = InspectorDbHelpers.GetUtc(r, 14);
                v2UpdatedAt = InspectorDbHelpers.GetUtc(r, 15) ?? createdAt;
                var isDeleted = !r.IsDBNull(16) && r.GetBoolean(16);
                v2Status = isDeleted ? ConflictRecordStatus.SoftDeleted : ConflictRecordStatus.Active;

                v2Fields = Track2PatientSyncEngine.BuildPatientCanonicalMap(
                    fn: SyncTransforms.CleanRequired(InspectorDbHelpers.GetStr(r, 0), "Unknown", 100),
                    mn: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 1), 100),
                    ln: SyncTransforms.CleanRequired(InspectorDbHelpers.GetStr(r, 2), "Patient", 100),
                    suf: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 3), 20),
                    sex: InspectorDbHelpers.GetStr(r, 4),
                    dob: dob,
                    pob: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 6), 250),
                    civil: InspectorDbHelpers.GetStr(r, 7),
                    blood: InspectorDbHelpers.GetStr(r, 8),
                    nat: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 9), 80),
                    rel: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 10), 80),
                    mob: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 11), 20),
                    alt: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 12), 20),
                    email: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 13), 254));
            }
        }

        return new ConflictLiveSnapshot(v1Status, v2Status, v1UpdatedAt, v2UpdatedAt, v1Fields, v2Fields, Specs);
    }
}

public sealed class Track2PatientSocialHistoryConflictInspector : IConflictDiffInspector
{
    public string Track => SyncTrack.Track2Patient;
    public string EntityType => "PatientSocialHistory";

    private static readonly IReadOnlyList<ConflictFieldSpec> Specs =
    [
        new("smoking_status", "Smoking Status", FieldSensitivity.SafeEnumOrBool),
        new("pack_years", "Pack Years", FieldSensitivity.ClinicalMeasurement),
        new("alcohol_use", "Alcohol Use", FieldSensitivity.SafeEnumOrBool),
        new("uses_substances", "Uses Substances", FieldSensitivity.SafeEnumOrBool),
        new("is_sexually_active", "Sexually Active", FieldSensitivity.SafeEnumOrBool),
    ];

    public async Task<ConflictLiveSnapshot> LoadSnapshotAsync(
        SyncBinding binding,
        SyncConflictRecord conflict,
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        CancellationToken ct)
    {
        var v1Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v1UpdatedAt = null;
        Dictionary<string, string?>? v1Fields = null;

        if (int.TryParse(conflict.V1Id, NumberStyles.Integer, CultureInfo.InvariantCulture, out var phId) &&
            await InspectorDbHelpers.TableExistsAsync(v1, "PersonalHistory", ct))
        {
            const string v1Sql = """
                SELECT ph."smokingStatus", ph."numberOfPacksPerYear", ph."alcoholStatus",
                       ph."illicitDrugUse", ph."sexuallyActive", ph."createdAt", ph."updatedAt", ph."deletedAt"
                FROM public."PersonalHistory" ph
                WHERE ph.id = @id
                """;
            await using var cmd = new NpgsqlCommand(v1Sql, v1);
            cmd.Parameters.AddWithValue("id", phId);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var createdAt = InspectorDbHelpers.GetUtc(r, 5);
                v1UpdatedAt = InspectorDbHelpers.GetUtc(r, 6) ?? createdAt;
                var deletedAt = InspectorDbHelpers.GetUtc(r, 7);
                v1Status = deletedAt.HasValue ? ConflictRecordStatus.SoftDeleted : ConflictRecordStatus.Active;

                v1Fields = Track2PatientSyncEngine.BuildPatientSocialHistoryCanonicalMap(
                    smokingStatus: SyncTransforms.MapPatientSmokingStatus(InspectorDbHelpers.GetStr(r, 0)),
                    packYears: SyncTransforms.SanitizePatientPackYears(InspectorDbHelpers.GetDecNullable(r, 1)),
                    alcoholUse: SyncTransforms.MapPatientAlcoholUse(InspectorDbHelpers.GetStr(r, 2)),
                    usesSubstances: SyncTransforms.IsYesStatus(InspectorDbHelpers.GetStr(r, 3)),
                    isSexuallyActive: SyncTransforms.IsYesStatus(InspectorDbHelpers.GetStr(r, 4)));
            }
        }

        var v2Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v2UpdatedAt = null;
        Dictionary<string, string?>? v2Fields = null;

        if (await InspectorDbHelpers.TableExistsAsync(v2, "patient_social_histories", ct))
        {
            const string v2Sql = """
                SELECT smoking_status, pack_years, alcohol_use, uses_substances, is_sexually_active,
                       created_at, updated_at, is_deleted
                FROM public.patient_social_histories
                WHERE id = @id
                """;
            await using var cmd = new NpgsqlCommand(v2Sql, v2);
            cmd.Parameters.AddWithValue("id", conflict.V2Id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var createdAt = InspectorDbHelpers.GetUtc(r, 5);
                v2UpdatedAt = InspectorDbHelpers.GetUtc(r, 6) ?? createdAt;
                var isDeleted = !r.IsDBNull(7) && r.GetBoolean(7);
                v2Status = isDeleted ? ConflictRecordStatus.SoftDeleted : ConflictRecordStatus.Active;

                v2Fields = Track2PatientSyncEngine.BuildPatientSocialHistoryCanonicalMap(
                    smokingStatus: InspectorDbHelpers.GetStr(r, 0),
                    packYears: InspectorDbHelpers.GetDecNullable(r, 1),
                    alcoholUse: InspectorDbHelpers.GetStr(r, 2),
                    usesSubstances: !r.IsDBNull(3) && r.GetBoolean(3),
                    isSexuallyActive: r.IsDBNull(4) ? null : r.GetBoolean(4));
            }
        }

        return new ConflictLiveSnapshot(v1Status, v2Status, v1UpdatedAt, v2UpdatedAt, v1Fields, v2Fields, Specs);
    }
}

public sealed class Track1PatientConflictInspector : IConflictDiffInspector
{
    public string Track => SyncTrack.Track1Clinic;
    public string EntityType => "Patient";

    private static readonly IReadOnlyList<ConflictFieldSpec> Specs =
    [
        new("firstName", "First Name", FieldSensitivity.PiiMasked),
        new("lastName", "Last Name", FieldSensitivity.PiiMasked),
        new("middleName", "Middle Name", FieldSensitivity.PiiMasked),
        new("suffix", "Suffix", FieldSensitivity.PiiMasked),
        new("dateOfBirth", "Date of Birth", FieldSensitivity.PiiMasked),
        new("sex", "Sex", FieldSensitivity.SafeEnumOrBool),
        new("civilStatus", "Civil Status", FieldSensitivity.SafeEnumOrBool),
        new("bloodType", "Blood Type", FieldSensitivity.SafeEnumOrBool),
        new("contactNumber", "Contact Number", FieldSensitivity.PiiMasked),
        new("landlineNumber", "Landline Number", FieldSensitivity.PiiMasked),
        new("email", "Email Address", FieldSensitivity.PiiMasked),
        new("occupation", "Occupation", FieldSensitivity.PiiMasked),
        new("nationality", "Nationality", FieldSensitivity.PiiMasked),
        new("religion", "Religion", FieldSensitivity.PiiMasked),
        new("preferredName", "Preferred Name", FieldSensitivity.PiiMasked),
        new("philHealthNumber", "PhilHealth PIN", FieldSensitivity.PiiMasked),
        new("emergencyContactName", "Emergency Contact Name", FieldSensitivity.PiiMasked),
        new("emergencyContactNumber", "Emergency Contact Number", FieldSensitivity.PiiMasked),
        new("emergencyContactRelationship", "Emergency Contact Relationship", FieldSensitivity.PiiMasked),
        new("verificationStatus", "Verification Status", FieldSensitivity.SafeEnumOrBool),
        new("customFields", "Custom Profile Fields", FieldSensitivity.StructuredJson),
    ];

    public async Task<ConflictLiveSnapshot> LoadSnapshotAsync(
        SyncBinding binding,
        SyncConflictRecord conflict,
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        CancellationToken ct)
    {
        var v1Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v1UpdatedAt = null;
        Dictionary<string, string?>? v1Fields = null;

        if (int.TryParse(conflict.V1Id, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v1UserId) &&
            binding.V1ClinicId.HasValue)
        {
            var hasAddrZip = await InspectorDbHelpers.ColumnExistsAsync(v1, "UserAddress", "zipCode", ct);
            var hasEcAddr = await InspectorDbHelpers.ColumnExistsAsync(v1, "UserEmergencyContact", "address", ct);
            var hasPhDepCols = await InspectorDbHelpers.ColumnExistsAsync(v1, "PhilHealthDependent", "firstName", ct);

            var secZipExpr = hasAddrZip ? """a."zipCode" """ : "NULL::text";
            var ecAddrExpr = hasEcAddr ? "c.address" : "NULL::text";

            List<IReadOnlyDictionary<string, object?>>? phDeps = null;
            if (hasPhDepCols)
            {
                const string depSql = """
                    SELECT pd."firstName", pd."lastName", pd.relationship, pd.gender, pd."isPermanentlyDisabled", pd.citizenship
                    FROM public."PhilHealthDependent" pd
                    JOIN public."PhilHealthRecord" pr ON pr.id = pd."philHealthRecordId"
                    WHERE pr."userId" = @uid
                      AND pr."deletedAt" IS NULL AND pr."isActive" = true
                      AND pd."deletedAt" IS NULL
                    ORDER BY pd.id ASC
                    """;
                await using var depCmd = new NpgsqlCommand(depSql, v1);
                depCmd.Parameters.AddWithValue("uid", v1UserId);
                await using var dr = await depCmd.ExecuteReaderAsync(ct);
                while (await dr.ReadAsync(ct))
                {
                    phDeps ??= new List<IReadOnlyDictionary<string, object?>>();
                    var depObj = new SortedDictionary<string, object?>(StringComparer.Ordinal);
                    void PutDep(string k, string? v)
                    {
                        var c = SyncTransforms.Clean(v);
                        if (c is not null) depObj[k] = c;
                    }
                    PutDep("firstName", InspectorDbHelpers.GetStr(dr, 0));
                    PutDep("lastName", InspectorDbHelpers.GetStr(dr, 1));
                    PutDep("relationship", InspectorDbHelpers.GetStr(dr, 2));
                    PutDep("gender", InspectorDbHelpers.GetStr(dr, 3));
                    depObj["isPermanentlyDisabled"] = !dr.IsDBNull(4) && dr.GetBoolean(4);
                    PutDep("citizenship", InspectorDbHelpers.GetStr(dr, 5));
                    phDeps.Add(depObj);
                }
            }

            var v1Sql = $"""
                SELECT u.id, u."firstName", u."lastName", u."middleName", u.suffix, u.dob,
                       u.gender::text, u."civilStatus"::text, u."bloodType"::text,
                       u.mobile, u.telephone, u.email, u.nationality, u.religion,
                       u.nickname, u."placeOfBirth", u."caseNumber",
                       u."accountType"::text, u."onboardingStatus"::text, u."verificationStatus"::text,
                       u."createdAt", u."updatedAt", u."deletedAt", u."isActive",
                       sr."studentId", sr.lrn, sl.name AS student_level, oc.name AS student_college,
                       op.name AS student_program, yl.name AS year_level,
                       er."employeeId", ed.name AS emp_dept, eo.name AS emp_office,
                       er.position AS emp_pos, er.designation AS emp_desig, ec.name AS emp_college,
                       pr.pin AS philhealth_pin, pr.tin, pr."philSysId",
                       addr.address_line, addr.barangay, addr.city, addr.province,
                       emc.ec_name, emc.ec_phone, emc.ec_rel, emc.ec_addr,
                       sec_addr.address_line, sec_addr.barangay, sec_addr.city, sec_addr.province, sec_addr.zip_code,
                       (
                           EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid AND cp."deletedAt" IS NULL)
                           OR (
                               @oid IS NOT NULL
                               AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid)
                               AND NOT EXISTS (SELECT 1 FROM public."ClinicPatient" cp_del WHERE cp_del."patientId" = u.id AND cp_del."clinicId" = @cid AND cp_del."deletedAt" IS NOT NULL)
                           )
                       ) AS in_active_scope
                FROM public."User" u
                LEFT JOIN LATERAL (
                    SELECT s."studentId", s.lrn, s.level, s."collegeId", s."programId", s."yearLevel"
                    FROM public."UserStudentRecord" s
                    WHERE s."userId" = u.id AND s."deletedAt" IS NULL
                      AND (@oid IS NULL OR s."organizationId" = @oid)
                    ORDER BY s."isActive" DESC, s."updatedAt" DESC NULLS LAST, s.id DESC LIMIT 1
                ) sr ON true
                LEFT JOIN public."StudentLevel" sl ON sl.id = sr.level
                LEFT JOIN public."OrganizationCollege" oc ON oc.id = sr."collegeId"
                LEFT JOIN public."OrganizationProgram" op ON op.id = sr."programId"
                LEFT JOIN public."OrganizationYearLevel" yl ON yl.id = sr."yearLevel"
                LEFT JOIN LATERAL (
                    SELECT e."employeeId", e."departmentId", e."officeId", e."collegeId", e.position, e.designation
                    FROM public."UserEmploymentRecord" e
                    WHERE e."userId" = u.id AND e."deletedAt" IS NULL
                      AND (@oid IS NULL OR e."organizationId" = @oid)
                    ORDER BY e."isActive" DESC, e."updatedAt" DESC NULLS LAST, e.id DESC LIMIT 1
                ) er ON true
                LEFT JOIN public."OrganizationDepartment" ed ON ed.id = er."departmentId"
                LEFT JOIN public."OrganizationOffice" eo ON eo.id = er."officeId"
                LEFT JOIN public."OrganizationCollege" ec ON ec.id = er."collegeId"
                LEFT JOIN LATERAL (
                    SELECT p.pin, p.tin, p."philSysId"
                    FROM public."PhilHealthRecord" p
                    WHERE p."userId" = u.id AND p."deletedAt" IS NULL
                    ORDER BY p."isActive" DESC, p."updatedAt" DESC NULLS LAST, p.id DESC LIMIT 1
                ) pr ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(NULLIF(trim(a."addressLine"), ''), NULLIF(trim(a.street), ''), NULLIF(trim(a.address), '')) AS address_line,
                           a.barangay, a.city, COALESCE(NULLIF(trim(a.state), ''), a.region) AS province
                    FROM public."UserAddress" a
                    WHERE a."userId" = u.id AND a."deletedAt" IS NULL AND a."isActive" = true
                    ORDER BY a."isPrimary" DESC, a.id DESC LIMIT 1
                ) addr ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(NULLIF(trim(a."addressLine"), ''), NULLIF(trim(a.street), ''), NULLIF(trim(a.address), '')) AS address_line,
                           a.barangay, a.city, COALESCE(NULLIF(trim(a.state), ''), a.region) AS province,
                           {secZipExpr} AS zip_code
                    FROM public."UserAddress" a
                    WHERE a."userId" = u.id AND a."deletedAt" IS NULL AND a."isActive" = true AND a."isPrimary" = false
                    ORDER BY a.id DESC LIMIT 1
                ) sec_addr ON true
                LEFT JOIN LATERAL (
                    SELECT COALESCE(NULLIF(trim(c.name), ''), trim(concat_ws(' ', c."firstName", c."middleName", c."lastName", c.suffix))) AS ec_name,
                           c.phone AS ec_phone, c.relationship AS ec_rel, {ecAddrExpr} AS ec_addr
                    FROM public."UserEmergencyContact" c
                    WHERE c."userId" = u.id AND c."deletedAt" IS NULL AND c."isActive" = true
                    ORDER BY c."isPrimary" DESC, c.id DESC LIMIT 1
                ) emc ON true
                WHERE u.id = @uid
                """;

            await using var cmd = new NpgsqlCommand(v1Sql, v1);
            cmd.Parameters.AddWithValue("uid", v1UserId);
            cmd.Parameters.AddWithValue("cid", binding.V1ClinicId.Value);
            cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)binding.V1OrgId ?? DBNull.Value });
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var firstName = SyncTransforms.CleanRequired(InspectorDbHelpers.GetStr(r, 1), "Unknown", 100);
                var lastName = SyncTransforms.CleanRequired(InspectorDbHelpers.GetStr(r, 2), "Patient", 100);
                var middleName = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 3), 100);
                var suffix = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 4), 20);
                DateOnly? dob = r.IsDBNull(5) ? null : r.GetFieldValue<DateOnly>(5);
                if (dob.HasValue && (dob.Value.Year < 1900 || dob.Value > DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1))))
                    dob = null;

                var sex = SyncTransforms.MapClinicSex(InspectorDbHelpers.GetStr(r, 6));
                var civilStatus = SyncTransforms.MapClinicCivilStatus(InspectorDbHelpers.GetStr(r, 7));
                var bloodType = SyncTransforms.MapBloodType(InspectorDbHelpers.GetStr(r, 8));
                var mobile = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 9), 50);
                var landline = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 10), 50);
                var contactNumber = mobile ?? landline ?? "N/A";
                var email = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 11), 255);
                var nationality = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 12), 100);
                var religion = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 13), 100);
                var nickname = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 14), 100);
                var placeOfBirth = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 15), 200);
                var legacyCaseNo = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 16), 100);
                var v1AccountType = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 17));
                var v1OnboardingStatus = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 18));
                var verificationStatus = SyncTransforms.MapClinicVerificationStatus(InspectorDbHelpers.GetStr(r, 19));
                var createdAt = InspectorDbHelpers.GetUtc(r, 20);
                var updatedAt = InspectorDbHelpers.GetUtc(r, 21) ?? createdAt;
                var deletedAt = InspectorDbHelpers.GetUtc(r, 22);
                var isActive = r.IsDBNull(23) || r.GetBoolean(23);
                var inActiveScope = !r.IsDBNull(52) && r.GetBoolean(52);

                v1UpdatedAt = updatedAt;
                if (deletedAt.HasValue || !isActive)
                {
                    v1Status = ConflictRecordStatus.SoftDeleted;
                }
                else if (!inActiveScope)
                {
                    v1Status = ConflictRecordStatus.MissingOrOutOfScope;
                }
                else
                {
                    v1Status = ConflictRecordStatus.Active;
                }

                var studentId = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 24));
                var lrn = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 25));
                var studentLevel = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 26));
                var studentCollege = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 27));
                var studentProgram = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 28));
                var yearLevel = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 29));
                var employeeId = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 30));
                var empDept = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 31));
                var empOffice = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 32));
                var empPosRaw = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 33));
                var empPos = SyncTransforms.Clean(empPosRaw, 100);
                var empDesig = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 34));
                var empCollege = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 35));
                var philHealthPin = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 36), 30);
                var tin = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 37), 50);
                var philSysId = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 38), 50);

                var addrLine = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 39));
                var barangay = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 40));
                var city = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 41));
                var province = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 42));
                var ecName = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 43));
                var ecPhone = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 44));
                var ecRel = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 45));
                var ecAddr = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 46));
                var secAddrLine = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 47));
                var secBarangay = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 48));
                var secCity = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 49));
                var secProvince = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 50));
                var secZip = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 51), 10);

                var affiliation = studentId is not null || studentProgram is not null
                    ? "Student"
                    : (employeeId is not null || empOffice is not null || empPosRaw is not null ? "Employee/Faculty" : null);

                var customFields = SyncTransforms.BuildClinicPatientCustomFields(
                    affiliation: affiliation,
                    studentId: studentId,
                    lrn: lrn,
                    studentLevel: studentLevel,
                    collegeName: studentCollege ?? empCollege,
                    programName: studentProgram,
                    yearLevel: yearLevel,
                    employeeId: employeeId,
                    departmentName: empDept,
                    officeName: empOffice,
                    position: empPosRaw,
                    designation: empDesig,
                    placeOfBirth: placeOfBirth,
                    legacyCaseNumber: legacyCaseNo,
                    tin: tin,
                    philSysId: philSysId,
                    addressLine: addrLine,
                    barangay: barangay,
                    city: city,
                    province: province,
                    emergencyContactName: ecName,
                    emergencyContactPhone: ecPhone,
                    emergencyContactRelationship: ecRel,
                    v1AccountType: v1AccountType,
                    v1OnboardingStatus: v1OnboardingStatus,
                    v1Nickname: nickname,
                    secondaryAddressLine: secAddrLine,
                    secondaryBarangay: secBarangay,
                    secondaryCity: secCity,
                    secondaryProvince: secProvince,
                    secondaryPostalCode: secZip,
                    emergencyContactAddress: ecAddr,
                    philHealthDependents: phDeps);

                var customFieldsJson = SyncTransforms.SerializeSortedJson(customFields);

                v1Fields = Track1ClinicSyncEngine.BuildClinicPatientCanonicalMap(
                    firstName, lastName, middleName, suffix, dob, sex, civilStatus, bloodType,
                    contactNumber, landline, email, empPos, nationality, religion, nickname, philHealthPin,
                    ecName, ecPhone, ecRel, verificationStatus, customFieldsJson);
            }
        }

        var v2Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v2UpdatedAt = null;
        Dictionary<string, string?>? v2Fields = null;

        const string v2Sql = """
            SELECT "FirstName","LastName","MiddleName","Suffix","DateOfBirth","Sex","CivilStatus","BloodType",
                   "ContactNumber","LandlineNumber","Email","Occupation","Nationality","Religion","PreferredName","PhilHealthNumber",
                   "EmergencyContactName","EmergencyContactNumber","EmergencyContactRelationship","VerificationStatus","CustomFields"::text,
                   "CreatedAt","UpdatedAt","IsDeleted"
            FROM public."Patients"
            WHERE "Id" = @id
            """;
        await using (var cmd = new NpgsqlCommand(v2Sql, v2))
        {
            cmd.Parameters.AddWithValue("id", conflict.V2Id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var dob = r.IsDBNull(4) ? (DateOnly?)null : r.GetFieldValue<DateOnly>(4);
                var cfRaw = r.IsDBNull(20) ? "{}" : r.GetString(20);
                var cfDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(cfRaw) ?? new();
                var cfSorted = SyncTransforms.SerializeSortedJson(cfDict);

                var createdAt = InspectorDbHelpers.GetUtc(r, 21);
                v2UpdatedAt = InspectorDbHelpers.GetUtc(r, 22) ?? createdAt;
                var isDeleted = !r.IsDBNull(23) && r.GetBoolean(23);
                v2Status = isDeleted ? ConflictRecordStatus.SoftDeleted : ConflictRecordStatus.Active;

                v2Fields = Track1ClinicSyncEngine.BuildClinicPatientCanonicalMap(
                    r.GetString(0), r.GetString(1), InspectorDbHelpers.GetStr(r, 2), InspectorDbHelpers.GetStr(r, 3),
                    dob, r.GetString(5), InspectorDbHelpers.GetStr(r, 6), InspectorDbHelpers.GetStr(r, 7),
                    r.GetString(8), InspectorDbHelpers.GetStr(r, 9), InspectorDbHelpers.GetStr(r, 10),
                    InspectorDbHelpers.GetStr(r, 11), InspectorDbHelpers.GetStr(r, 12), InspectorDbHelpers.GetStr(r, 13),
                    InspectorDbHelpers.GetStr(r, 14), InspectorDbHelpers.GetStr(r, 15), InspectorDbHelpers.GetStr(r, 16),
                    InspectorDbHelpers.GetStr(r, 17), InspectorDbHelpers.GetStr(r, 18),
                    InspectorDbHelpers.GetStr(r, 19) ?? "Verified", cfSorted);
            }
        }

        return new ConflictLiveSnapshot(v1Status, v2Status, v1UpdatedAt, v2UpdatedAt, v1Fields, v2Fields, Specs);
    }
}

public sealed class Track1PatientSocialHistoryConflictInspector : IConflictDiffInspector
{
    public string Track => SyncTrack.Track1Clinic;
    public string EntityType => "PatientSocialHistory";

    private static readonly IReadOnlyList<ConflictFieldSpec> Specs =
    [
        new("isSmoker", "Smoker", FieldSensitivity.SafeEnumOrBool),
        new("smokingStatus", "Smoking Status", FieldSensitivity.SafeEnumOrBool),
        new("isAlcoholDrinker", "Alcohol Drinker", FieldSensitivity.SafeEnumOrBool),
        new("alcoholStatus", "Alcohol Status", FieldSensitivity.SafeEnumOrBool),
        new("usesIllicitDrugs", "Uses Illicit Drugs", FieldSensitivity.SafeEnumOrBool),
        new("isSexuallyActive", "Sexually Active", FieldSensitivity.SafeEnumOrBool),
    ];

    public async Task<ConflictLiveSnapshot> LoadSnapshotAsync(
        SyncBinding binding,
        SyncConflictRecord conflict,
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        CancellationToken ct)
    {
        var v1Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v1UpdatedAt = null;
        Dictionary<string, string?>? v1Fields = null;

        if (int.TryParse(conflict.V1Id, NumberStyles.Integer, CultureInfo.InvariantCulture, out var phId) &&
            await InspectorDbHelpers.TableExistsAsync(v1, "PersonalHistory", ct))
        {
            const string v1Sql = """
                SELECT ph."smokingStatus", ph."alcoholStatus", ph."illicitDrugUse", ph."sexuallyActive",
                       ph."createdAt", ph."updatedAt", ph."deletedAt"
                FROM public."PersonalHistory" ph
                WHERE ph.id = @id
                """;
            await using var cmd = new NpgsqlCommand(v1Sql, v1);
            cmd.Parameters.AddWithValue("id", phId);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var smoke = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 0), 50);
                var alc = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 1), 50);
                var drug = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 2), 50);
                var sexAct = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 3), 50);

                var createdAt = InspectorDbHelpers.GetUtc(r, 4);
                v1UpdatedAt = InspectorDbHelpers.GetUtc(r, 5) ?? createdAt;
                var deletedAt = InspectorDbHelpers.GetUtc(r, 6);
                v1Status = deletedAt.HasValue ? ConflictRecordStatus.SoftDeleted : ConflictRecordStatus.Active;

                v1Fields = Track1ClinicSyncEngine.BuildClinicSocialHistoryCanonicalMap(
                    isSmoker: SyncTransforms.IsActiveSmoker(smoke),
                    smokingStatus: smoke,
                    isAlcoholDrinker: SyncTransforms.IsActiveAlcoholDrinker(alc),
                    alcoholStatus: alc,
                    usesIllicitDrugs: SyncTransforms.IsYesStatus(drug),
                    isSexuallyActive: SyncTransforms.IsYesStatus(sexAct));
            }
        }

        var v2Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v2UpdatedAt = null;
        Dictionary<string, string?>? v2Fields = null;

        if (await InspectorDbHelpers.TableExistsAsync(v2, "PatientSocialHistories", ct))
        {
            const string v2Sql = """
                SELECT "IsSmoker","SmokingStatus","IsAlcoholDrinker","AlcoholStatus","UsesIllicitDrugs","IsSexuallyActive",
                       "CreatedAt","UpdatedAt","IsDeleted"
                FROM public."PatientSocialHistories"
                WHERE "Id" = @id
                """;
            await using var cmd = new NpgsqlCommand(v2Sql, v2);
            cmd.Parameters.AddWithValue("id", conflict.V2Id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var createdAt = InspectorDbHelpers.GetUtc(r, 6);
                v2UpdatedAt = InspectorDbHelpers.GetUtc(r, 7) ?? createdAt;
                var isDeleted = !r.IsDBNull(8) && r.GetBoolean(8);
                v2Status = isDeleted ? ConflictRecordStatus.SoftDeleted : ConflictRecordStatus.Active;

                v2Fields = Track1ClinicSyncEngine.BuildClinicSocialHistoryCanonicalMap(
                    isSmoker: r.GetBoolean(0),
                    smokingStatus: InspectorDbHelpers.GetStr(r, 1),
                    isAlcoholDrinker: r.GetBoolean(2),
                    alcoholStatus: InspectorDbHelpers.GetStr(r, 3),
                    usesIllicitDrugs: r.GetBoolean(4),
                    isSexuallyActive: r.GetBoolean(5));
            }
        }

        return new ConflictLiveSnapshot(v1Status, v2Status, v1UpdatedAt, v2UpdatedAt, v1Fields, v2Fields, Specs);
    }
}

public sealed class Track1PatientVitalsConflictInspector : IConflictDiffInspector
{
    public string Track => SyncTrack.Track1Clinic;
    public string EntityType => "PatientVitals";

    private static readonly IReadOnlyList<ConflictFieldSpec> VitalSpecs =
    [
        new("systolicBp", "Systolic BP (mmHg)", FieldSensitivity.ClinicalMeasurement),
        new("diastolicBp", "Diastolic BP (mmHg)", FieldSensitivity.ClinicalMeasurement),
        new("heartRateBpm", "Heart Rate (bpm)", FieldSensitivity.ClinicalMeasurement),
        new("temperatureCelsius", "Temperature (°C)", FieldSensitivity.ClinicalMeasurement),
        new("oxygenSaturationPercent", "Oxygen Saturation (%)", FieldSensitivity.ClinicalMeasurement),
        new("heightCm", "Height (cm)", FieldSensitivity.ClinicalMeasurement),
        new("weightKg", "Weight (kg)", FieldSensitivity.ClinicalMeasurement),
        new("bmi", "BMI", FieldSensitivity.ClinicalMeasurement),
        new("notes", "Vitals Clinical Notes", FieldSensitivity.ClinicalNote),
    ];

    private static readonly IReadOnlyList<ConflictFieldSpec> PreAssessStandaloneSpecs =
    [
        new("preAssessmentNotes", "Pre-Assessment Notes", FieldSensitivity.ClinicalNote),
        new("preAssessmentRemarks", "Pre-Assessment Remarks", FieldSensitivity.ClinicalNote),
        new("homeInstructions", "Home Instructions", FieldSensitivity.ClinicalNote),
        new("rosCategory", "Review of Systems Category", FieldSensitivity.SafeEnumOrBool),
    ];

    private static readonly IReadOnlyList<ConflictFieldSpec> PreAssessMergedSpecs =
    [
        new("preAssessmentNotes", "Pre-Assessment Notes", FieldSensitivity.ClinicalNote),
        new("preAssessmentRemarks", "Pre-Assessment Remarks", FieldSensitivity.ClinicalNote),
        new("homeInstructions", "Home Instructions", FieldSensitivity.ClinicalNote),
    ];

    public async Task<ConflictLiveSnapshot> LoadSnapshotAsync(
        SyncBinding binding,
        SyncConflictRecord conflict,
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        CancellationToken ct)
    {
        if (conflict.V1Id.StartsWith("preassess:", StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(conflict.V1Id[10..], NumberStyles.Integer, CultureInfo.InvariantCulture, out var paId))
        {
            return await LoadPreAssessmentSnapshotAsync(binding, conflict, paId, v1, v2, ct);
        }

        var rawId = conflict.V1Id.StartsWith("vital:", StringComparison.OrdinalIgnoreCase)
            ? conflict.V1Id[6..]
            : conflict.V1Id;

        return await LoadVitalSignSnapshotAsync(binding, conflict, rawId, v1, v2, ct);
    }

    private static async Task<ConflictLiveSnapshot> LoadVitalSignSnapshotAsync(
        SyncBinding binding,
        SyncConflictRecord conflict,
        string rawVitalId,
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        CancellationToken ct)
    {
        var v1Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v1UpdatedAt = null;
        Dictionary<string, string?>? v1Fields = null;

        if (int.TryParse(rawVitalId, NumberStyles.Integer, CultureInfo.InvariantCulture, out var vitalId) &&
            await InspectorDbHelpers.TableExistsAsync(v1, "VitalSign", ct))
        {
            const string v1Sql = """
                SELECT vs."bpSystolic", vs."bpDiastolic", vs."pulseRate", vs.temp, vs.spo2,
                       vs.height, vs.weight, vs.bmi, vs.notes,
                       vs."dateTaken", vs."createdAt", vs."updatedAt", vs."deletedAt", vs."isActive"
                FROM public."VitalSign" vs
                WHERE vs.id = @id
                """;
            await using var cmd = new NpgsqlCommand(v1Sql, v1);
            cmd.Parameters.AddWithValue("id", vitalId);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var dateTaken = InspectorDbHelpers.GetUtc(r, 9);
                var createdAt = InspectorDbHelpers.GetUtc(r, 10) ?? dateTaken;
                v1UpdatedAt = InspectorDbHelpers.GetUtc(r, 11) ?? createdAt;
                var deletedAt = InspectorDbHelpers.GetUtc(r, 12);
                var isActive = r.IsDBNull(13) || r.GetBoolean(13);
                v1Status = (deletedAt.HasValue || !isActive)
                    ? ConflictRecordStatus.SoftDeleted
                    : ConflictRecordStatus.Active;

                v1Fields = Track1ClinicSyncEngine.BuildClinicVitalsCanonicalMap(
                    systolicBp: r.IsDBNull(0) ? null : r.GetInt32(0),
                    diastolicBp: r.IsDBNull(1) ? null : r.GetInt32(1),
                    heartRateBpm: r.IsDBNull(2) ? null : r.GetInt32(2),
                    temperatureCelsius: SyncTransforms.SanitizeTemperatureCelsius(InspectorDbHelpers.GetDecNullable(r, 3)),
                    oxygenSaturationPercent: SyncTransforms.SanitizeOxygenSaturationPercent(InspectorDbHelpers.GetDecNullable(r, 4)),
                    heightCm: SyncTransforms.SanitizePositiveNumeric6_2(InspectorDbHelpers.GetDecNullable(r, 5)),
                    weightKg: SyncTransforms.SanitizePositiveNumeric6_2(InspectorDbHelpers.GetDecNullable(r, 6)),
                    bmi: SyncTransforms.SanitizeBmi(InspectorDbHelpers.GetDecNullable(r, 7)),
                    notes: SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 8)));
            }
        }

        var v2Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v2UpdatedAt = null;
        Dictionary<string, string?>? v2Fields = null;

        if (await InspectorDbHelpers.TableExistsAsync(v2, "PatientVitals", ct))
        {
            const string v2Sql = """
                SELECT "SystolicBp","DiastolicBp","HeartRateBpm","TemperatureCelsius","OxygenSaturationPercent",
                       "HeightCm","WeightKg","Bmi","Notes","CreatedAt","UpdatedAt","IsDeleted"
                FROM public."PatientVitals"
                WHERE "Id" = @id
                """;
            await using var cmd = new NpgsqlCommand(v2Sql, v2);
            cmd.Parameters.AddWithValue("id", conflict.V2Id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var createdAt = InspectorDbHelpers.GetUtc(r, 9);
                v2UpdatedAt = InspectorDbHelpers.GetUtc(r, 10) ?? createdAt;
                var isDeleted = !r.IsDBNull(11) && r.GetBoolean(11);
                v2Status = isDeleted ? ConflictRecordStatus.SoftDeleted : ConflictRecordStatus.Active;

                v2Fields = Track1ClinicSyncEngine.BuildClinicVitalsCanonicalMap(
                    systolicBp: r.IsDBNull(0) ? null : r.GetInt32(0),
                    diastolicBp: r.IsDBNull(1) ? null : r.GetInt32(1),
                    heartRateBpm: r.IsDBNull(2) ? null : r.GetInt32(2),
                    temperatureCelsius: r.IsDBNull(3) ? null : r.GetDecimal(3),
                    oxygenSaturationPercent: r.IsDBNull(4) ? null : r.GetDecimal(4),
                    heightCm: r.IsDBNull(5) ? null : r.GetDecimal(5),
                    weightKg: r.IsDBNull(6) ? null : r.GetDecimal(6),
                    bmi: r.IsDBNull(7) ? null : r.GetDecimal(7),
                    notes: InspectorDbHelpers.GetStr(r, 8));
            }
        }

        return new ConflictLiveSnapshot(v1Status, v2Status, v1UpdatedAt, v2UpdatedAt, v1Fields, v2Fields, VitalSpecs);
    }

    private static async Task<ConflictLiveSnapshot> LoadPreAssessmentSnapshotAsync(
        SyncBinding binding,
        SyncConflictRecord conflict,
        int paId,
        NpgsqlConnection v1,
        NpgsqlConnection v2,
        CancellationToken ct)
    {
        var isStandalone = binding.V2ClinicId.HasValue &&
                           conflict.V2Id == DeterministicUuid.SharedPreAssessmentVitalsId(binding.V2ClinicId.Value, paId);
        var specs = isStandalone ? PreAssessStandaloneSpecs : PreAssessMergedSpecs;

        var v1Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v1UpdatedAt = null;
        Dictionary<string, string?>? v1Fields = null;

        if (await InspectorDbHelpers.TableExistsAsync(v1, "PreAssessmentNote", ct))
        {
            int? apptId = null;
            await using (var apptCmd = new NpgsqlCommand("""
                SELECT "appointmentId" FROM public."PreAssessmentNote" WHERE id = @id
                """, v1))
            {
                apptCmd.Parameters.AddWithValue("id", paId);
                var obj = await apptCmd.ExecuteScalarAsync(ct);
                if (obj is int a) apptId = a;
            }

            if (apptId.HasValue)
            {
                var noteParts = new List<string>();
                var homeParts = new List<string>();
                var remParts = new List<string>();
                DateTimeOffset? maxUpdated = null;
                DateTimeOffset? minCreated = null;

                await using (var grpCmd = new NpgsqlCommand("""
                    SELECT assessment, "homeInstructions", remarks, "createdAt", "updatedAt"
                    FROM public."PreAssessmentNote"
                    WHERE "appointmentId" = @apptId
                      AND (@cid IS NULL OR "clinicId" = @cid)
                    ORDER BY id ASC
                    """, v1))
                {
                    grpCmd.Parameters.AddWithValue("apptId", apptId.Value);
                    grpCmd.Parameters.Add(new NpgsqlParameter("cid", NpgsqlDbType.Integer) { Value = (object?)binding.V1ClinicId ?? DBNull.Value });
                    await using var r = await grpCmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var a = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 0));
                        var h = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 1));
                        var rem = SyncTransforms.Clean(InspectorDbHelpers.GetStr(r, 2));
                        if (a is not null) noteParts.Add(a);
                        if (h is not null) homeParts.Add(h);
                        if (rem is not null) remParts.Add(rem);

                        var cAt = InspectorDbHelpers.GetUtc(r, 3);
                        var uAt = InspectorDbHelpers.GetUtc(r, 4) ?? cAt;
                        if (cAt.HasValue && (!minCreated.HasValue || cAt.Value < minCreated.Value)) minCreated = cAt;
                        if (uAt.HasValue && (!maxUpdated.HasValue || uAt.Value > maxUpdated.Value)) maxUpdated = uAt;
                    }
                }

                string? rosCat = null;
                if (isStandalone &&
                    await InspectorDbHelpers.ColumnExistsAsync(v1, "Appointment", "systemId", ct) &&
                    await InspectorDbHelpers.TableExistsAsync(v1, "System", ct))
                {
                    await using var rosCmd = new NpgsqlCommand("""
                        SELECT s.name
                        FROM public."Appointment" a
                        LEFT JOIN public."System" s ON s.id = a."systemId"
                        WHERE a.id = @apptId
                        """, v1);
                    rosCmd.Parameters.AddWithValue("apptId", apptId.Value);
                    var sysName = await rosCmd.ExecuteScalarAsync(ct) as string;
                    rosCat = SyncTransforms.MapRosCategory(sysName);
                }

                v1Status = ConflictRecordStatus.Active;
                v1UpdatedAt = maxUpdated ?? minCreated;
                v1Fields = Track1ClinicSyncEngine.BuildClinicPreAssessCanonicalMap(
                    preAssessmentNotes: noteParts.Count > 0 ? string.Join("\n\n", noteParts) : null,
                    preAssessmentRemarks: remParts.Count > 0 ? string.Join("\n\n", remParts) : null,
                    homeInstructions: homeParts.Count > 0 ? string.Join("\n\n", homeParts) : null,
                    includeRosCategory: isStandalone,
                    rosCategory: rosCat);
            }
        }

        var v2Status = ConflictRecordStatus.Missing;
        DateTimeOffset? v2UpdatedAt = null;
        Dictionary<string, string?>? v2Fields = null;

        if (await InspectorDbHelpers.TableExistsAsync(v2, "PatientVitals", ct))
        {
            const string v2Sql = """
                SELECT "PreAssessmentNotes","PreAssessmentRemarks","HomeInstructions","RosCategory",
                       "CreatedAt","UpdatedAt","IsDeleted"
                FROM public."PatientVitals"
                WHERE "Id" = @id
                """;
            await using var cmd = new NpgsqlCommand(v2Sql, v2);
            cmd.Parameters.AddWithValue("id", conflict.V2Id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var createdAt = InspectorDbHelpers.GetUtc(r, 4);
                v2UpdatedAt = InspectorDbHelpers.GetUtc(r, 5) ?? createdAt;
                var isDeleted = !r.IsDBNull(6) && r.GetBoolean(6);
                v2Status = isDeleted ? ConflictRecordStatus.SoftDeleted : ConflictRecordStatus.Active;

                v2Fields = Track1ClinicSyncEngine.BuildClinicPreAssessCanonicalMap(
                    preAssessmentNotes: InspectorDbHelpers.GetStr(r, 0),
                    preAssessmentRemarks: InspectorDbHelpers.GetStr(r, 1),
                    homeInstructions: InspectorDbHelpers.GetStr(r, 2),
                    includeRosCategory: isStandalone,
                    rosCategory: InspectorDbHelpers.GetStr(r, 3));
            }
        }

        return new ConflictLiveSnapshot(v1Status, v2Status, v1UpdatedAt, v2UpdatedAt, v1Fields, v2Fields, specs);
    }
}
