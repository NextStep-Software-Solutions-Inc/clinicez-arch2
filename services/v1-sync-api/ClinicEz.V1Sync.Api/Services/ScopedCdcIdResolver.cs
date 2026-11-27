using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Npgsql;
using NpgsqlTypes;

namespace ClinicEz.V1Sync.Api.Services;

public sealed record CdcChangelogEntry(long Seq, string TableName, string Op, string RowId, string PkJson);

public sealed record DeletedCdcEvent(
    long Seq,
    string TableName,
    string RowId,
    IReadOnlyDictionary<string, string?> PkValues);

public sealed record ExtractedCdcKeys(
    HashSet<int> UserIds,
    HashSet<int> ClinicPatientIds,
    HashSet<int> PhilHealthRecordIds,
    HashSet<int> AppointmentIds,
    HashSet<int> ConsultIds,
    HashSet<int> PrescriptionIds,
    HashSet<int> MedicineIds,
    HashSet<int> MedicationIds,
    HashSet<int> LabReqIds,
    HashSet<int> ImgReqIds,
    HashSet<int> HeartReqIds,
    HashSet<int> FileIds,
    HashSet<int> FolderIds,
    HashSet<int> FileSettingIds,
    HashSet<int> FolderSettingIds,
    HashSet<int> OrgMemberIds,
    List<DeletedCdcEvent> DeletedEvents,
    long MaxSeq,
    int RawEventCount);

public sealed record CdcBatchResolution(
    List<int> ScopedUserIds,
    List<DeletedCdcEvent> DeletedEvents,
    long MaxSeq,
    int RawEventCount,
    bool HasMore);

/// <summary>
/// Shared, scoped CDC ID resolver for both Track 1 (clinic-api) and Track 2 (patient-api).
/// Separates pure pk_json/key extraction from parameterized Npgsql v1 resolution queries,
/// handles Prescription.patientId -> ClinicPatient.id polymorphism, recovers AppointmentRequester
/// consultations via LEFT JOIN, and surfaces op='D' delete events for Deletion Shield.
/// </summary>
public sealed class ScopedCdcIdResolver
{
    public async Task<CdcBatchResolution> ResolveBatchAsync(
        NpgsqlConnection v1,
        long afterSeq,
        int? v1ClinicId,
        int? v1OrgId,
        bool isGlobal,
        int batchLimit = 5000,
        CancellationToken ct = default)
    {
        var effectiveLimit = Math.Clamp(batchLimit, 1, 50000);
        var entries = new List<CdcChangelogEntry>();

        // MVCC commit-gap guard: never advance past an uncommitted in-flight transaction that grabbed a
        // lower BIGSERIAL seq while a sibling transaction committed a higher seq first.
        try
        {
            await using (var cmd = new NpgsqlCommand("""
                WITH snap AS (
                    SELECT pg_snapshot_xmin(pg_current_snapshot()) AS s_xmin,
                           pg_snapshot_xmax(pg_current_snapshot()) AS s_xmax
                ),
                unsafe_floor AS (
                    SELECT COALESCE(MIN(c2.seq), 9223372036854775807) AS min_unsafe_seq
                    FROM _v1_sync.changelog c2, snap
                    WHERE c2.seq > @afterSeq
                      AND age(c2.xmin) <= age((snap.s_xmin::text::bigint & 4294967295)::text::xid)
                )
                SELECT c.seq, c.table_name, c.op, c.row_id, c.pk_json::text
                FROM _v1_sync.changelog c, snap, unsafe_floor uf
                WHERE c.seq > @afterSeq
                  AND c.seq < uf.min_unsafe_seq
                  AND age(c.xmin) > age((snap.s_xmin::text::bigint & 4294967295)::text::xid)
                  AND (
                      snap.s_xmin = snap.s_xmax
                      OR c.changed_at < now() - interval '5 seconds'
                  )
                ORDER BY c.seq ASC
                LIMIT @lim
                """, v1))
            {
                cmd.Parameters.AddWithValue("afterSeq", afterSeq);
                cmd.Parameters.AddWithValue("lim", effectiveLimit);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    entries.Add(new CdcChangelogEntry(
                        Seq: r.GetInt64(0),
                        TableName: r.GetString(1),
                        Op: r.GetString(2),
                        RowId: r.GetString(3),
                        PkJson: r.GetString(4)));
                }
            }
        }
        catch (PostgresException ex) when (ex.SqlState is "42P01" or "3F000" or "42501")
        {
            // _v1_sync.changelog is not installed (or not yet readable by this role) — treat as 0 CDC events.
            return new CdcBatchResolution(new List<int>(), new List<DeletedCdcEvent>(), afterSeq, 0, false);
        }

        if (entries.Count == 0)
        {
            return new CdcBatchResolution(new List<int>(), new List<DeletedCdcEvent>(), afterSeq, 0, false);
        }

        var keys = ExtractKeys(entries);
        var userIds = keys.UserIds;
        var clinicPatientIds = keys.ClinicPatientIds;
        var fileIds = keys.FileIds;
        var folderIds = keys.FolderIds;

        var scopedCid = isGlobal ? null : v1ClinicId;
        var scopedOid = isGlobal ? null : v1OrgId;

        // 1. FileSetting -> File
        if (keys.FileSettingIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT fs."fileId"
                FROM public."FileSetting" fs
                WHERE fs.id = ANY(@ids) AND fs."fileId" IS NOT NULL
                """, keys.FileSettingIds, null, null, fileIds, ct);
        }

        // 2. FolderSetting -> Folder
        if (keys.FolderSettingIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT fls."folderId"
                FROM public."FolderSetting" fls
                WHERE fls.id = ANY(@ids) AND fls."folderId" IS NOT NULL
                """, keys.FolderSettingIds, null, null, folderIds, ct);
        }

        // 3. File -> Folder -> User
        if (fileIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT fo."userId"
                FROM public."File" f
                JOIN public."Folder" fo ON fo.id = f."folderId"
                WHERE f.id = ANY(@ids)
                """, fileIds, null, null, userIds, ct);
        }

        // 4. Folder -> User
        if (folderIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT fo."userId"
                FROM public."Folder" fo
                WHERE fo.id = ANY(@ids)
                """, folderIds, null, null, userIds, ct);
        }

        // 5. OrganizationMember -> User
        if (keys.OrgMemberIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT om."userId"
                FROM public."OrganizationMember" om
                WHERE om.id = ANY(@ids)
                  AND (@oid IS NULL OR om."organizationId" = @oid)
                """, keys.OrgMemberIds, null, scopedOid, userIds, ct);
        }

        // 6. PhilHealthRecord -> User
        if (keys.PhilHealthRecordIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT pr."userId"
                FROM public."PhilHealthRecord" pr
                WHERE pr.id = ANY(@ids)
                """, keys.PhilHealthRecordIds, null, null, userIds, ct);
        }

        // 7. Medicine -> Prescription -> (ClinicPatient | ConsultationTicket) -> User
        if (keys.MedicineIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT COALESCE(cp."patientId", cp2."patientId", ar."userId")
                FROM public."Medicine" m
                JOIN public."Prescription" p ON p.id = m."prescriptionId"
                LEFT JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
                LEFT JOIN public."ConsultationTicket" t ON t.id = p."consultationTicketId"
                LEFT JOIN public."ClinicPatient" cp2 ON cp2.id = t."clinicPatientId"
                LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId"
                WHERE m.id = ANY(@ids)
                  AND (@cid IS NULL OR p."clinicId" = @cid)
                  AND COALESCE(cp."patientId", cp2."patientId", ar."userId") IS NOT NULL
                """, keys.MedicineIds, scopedCid, null, userIds, ct);
        }

        // 8. Prescription -> (ClinicPatient | ConsultationTicket) -> User
        if (keys.PrescriptionIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT COALESCE(cp."patientId", cp2."patientId", ar."userId")
                FROM public."Prescription" p
                LEFT JOIN public."ClinicPatient" cp ON cp.id = p."patientId"
                LEFT JOIN public."ConsultationTicket" t ON t.id = p."consultationTicketId"
                LEFT JOIN public."ClinicPatient" cp2 ON cp2.id = t."clinicPatientId"
                LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId"
                WHERE p.id = ANY(@ids)
                  AND (@cid IS NULL OR p."clinicId" = @cid)
                  AND COALESCE(cp."patientId", cp2."patientId", ar."userId") IS NOT NULL
                """, keys.PrescriptionIds, scopedCid, null, userIds, ct);
        }

        // 9. Medication -> User
        if (keys.MedicationIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT med."patientId"
                FROM public."Medication" med
                WHERE med.id = ANY(@ids)
                  AND (@cid IS NULL OR med."clinicId" = @cid)
                  AND med."patientId" IS NOT NULL
                """, keys.MedicationIds, scopedCid, null, userIds, ct);
        }

        // 10. Diagnostic Requests (Lab, Imaging, HeartStation) -> ClinicPatient -> User
        if (keys.LabReqIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT cp."patientId"
                FROM public."ClinicLaboratoryRequest" r
                JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                WHERE r.id = ANY(@ids)
                  AND (@cid IS NULL OR r."clinicId" = @cid)
                """, keys.LabReqIds, scopedCid, null, userIds, ct);
        }

        if (keys.ImgReqIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT cp."patientId"
                FROM public."ClinicImagingRequest" r
                JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                WHERE r.id = ANY(@ids)
                  AND (@cid IS NULL OR r."clinicId" = @cid)
                """, keys.ImgReqIds, scopedCid, null, userIds, ct);
        }

        if (keys.HeartReqIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT cp."patientId"
                FROM public."ClinicHeartStationRequest" r
                JOIN public."ClinicPatient" cp ON cp.id = r."clinicPatientId"
                WHERE r.id = ANY(@ids)
                  AND (@cid IS NULL OR r."clinicId" = @cid)
                """, keys.HeartReqIds, scopedCid, null, userIds, ct);
        }

        // 11. ConsultationTicket -> LEFT JOIN ClinicPatient + LEFT JOIN AppointmentRequester -> User
        if (keys.ConsultIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT COALESCE(cp."patientId", ar."userId")
                FROM public."ConsultationTicket" t
                LEFT JOIN public."ClinicPatient" cp ON cp.id = t."clinicPatientId"
                LEFT JOIN public."AppointmentRequester" ar ON ar."appointmentId" = t."appointmentId"
                WHERE t.id = ANY(@ids)
                  AND (@cid IS NULL OR t."clinicId" = @cid)
                  AND COALESCE(cp."patientId", ar."userId") IS NOT NULL
                """, keys.ConsultIds, scopedCid, null, userIds, ct);
        }

        // 12. Appointment -> AppointmentRequester -> User
        if (keys.AppointmentIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT ar."userId"
                FROM public."AppointmentRequester" ar
                JOIN public."Appointment" a ON a.id = ar."appointmentId"
                WHERE a.id = ANY(@ids)
                  AND (@cid IS NULL OR a."clinicId" = @cid)
                """, keys.AppointmentIds, scopedCid, null, userIds, ct);
        }

        // 13. ClinicPatient -> User
        if (clinicPatientIds.Count > 0)
        {
            await CollectIdsAsync(v1, """
                SELECT DISTINCT cp."patientId"
                FROM public."ClinicPatient" cp
                WHERE cp.id = ANY(@ids)
                  AND (@cid IS NULL OR cp."clinicId" = @cid)
                """, clinicPatientIds, scopedCid, null, userIds, ct);
        }

        var scoped = new List<int>();
        if (userIds.Count > 0)
        {
            if (isGlobal)
            {
                scoped.AddRange(userIds.OrderBy(x => x));
            }
            else
            {
                const string scopeSql = """
                    SELECT DISTINCT u.id
                    FROM public."User" u
                    WHERE u.id = ANY(@ids)
                      AND (
                          (@cid IS NOT NULL AND EXISTS (SELECT 1 FROM public."ClinicPatient" cp WHERE cp."patientId" = u.id AND cp."clinicId" = @cid))
                          OR (@oid IS NOT NULL AND EXISTS (SELECT 1 FROM public."OrganizationMember" om WHERE om."userId" = u.id AND om."organizationId" = @oid))
                      )
                    ORDER BY u.id ASC
                    """;
                await using var cmd = new NpgsqlCommand(scopeSql, v1);
                cmd.Parameters.AddWithValue("ids", userIds.ToArray());
                cmd.Parameters.Add(new NpgsqlParameter("cid", NpgsqlDbType.Integer) { Value = (object?)v1ClinicId ?? DBNull.Value });
                cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)v1OrgId ?? DBNull.Value });
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    scoped.Add(r.GetInt32(0));
                }
            }
        }

        var deletedEvents = isGlobal
            ? keys.DeletedEvents
            : FilterScopedDeletedEvents(keys.DeletedEvents, v1ClinicId, v1OrgId);

        return new CdcBatchResolution(
            ScopedUserIds: scoped,
            DeletedEvents: deletedEvents,
            MaxSeq: keys.MaxSeq,
            RawEventCount: keys.RawEventCount,
            HasMore: keys.RawEventCount == effectiveLimit);
    }

    private static List<DeletedCdcEvent> FilterScopedDeletedEvents(
        List<DeletedCdcEvent> deletedEvents,
        int? v1ClinicId,
        int? v1OrgId)
    {
        if (deletedEvents.Count == 0 || (!v1ClinicId.HasValue && !v1OrgId.HasValue))
        {
            return deletedEvents;
        }

        var filtered = new List<DeletedCdcEvent>(deletedEvents.Count);
        foreach (var evt in deletedEvents)
        {
            if (v1ClinicId.HasValue &&
                evt.PkValues.TryGetValue("clinicId", out var cidStr) &&
                int.TryParse(cidStr, out var cid) &&
                cid != v1ClinicId.Value)
            {
                continue;
            }

            if (v1OrgId.HasValue &&
                evt.PkValues.TryGetValue("organizationId", out var oidStr) &&
                int.TryParse(oidStr, out var oid) &&
                oid != v1OrgId.Value)
            {
                continue;
            }

            filtered.Add(evt);
        }

        return filtered;
    }

    public static ExtractedCdcKeys ExtractKeys(IEnumerable<CdcChangelogEntry> entries)
    {
        var userIds = new HashSet<int>();
        var clinicPatientIds = new HashSet<int>();
        var philHealthRecordIds = new HashSet<int>();
        var appointmentIds = new HashSet<int>();
        var consultIds = new HashSet<int>();
        var prescriptionIds = new HashSet<int>();
        var medicineIds = new HashSet<int>();
        var medicationIds = new HashSet<int>();
        var labReqIds = new HashSet<int>();
        var imgReqIds = new HashSet<int>();
        var heartReqIds = new HashSet<int>();
        var fileIds = new HashSet<int>();
        var folderIds = new HashSet<int>();
        var fileSettingIds = new HashSet<int>();
        var folderSettingIds = new HashSet<int>();
        var orgMemberIds = new HashSet<int>();
        var deletedEvents = new List<DeletedCdcEvent>();

        long maxSeq = 0;
        var rawCount = 0;

        foreach (var entry in entries)
        {
            rawCount++;
            if (entry.Seq > maxSeq) maxSeq = entry.Seq;

            JsonDocument? doc = null;
            try
            {
                doc = string.IsNullOrWhiteSpace(entry.PkJson)
                    ? JsonDocument.Parse("{}")
                    : JsonDocument.Parse(entry.PkJson);

                var root = doc.RootElement;
                var table = entry.TableName;

                if (string.Equals(entry.Op, "D", StringComparison.OrdinalIgnoreCase))
                {
                    var pkValues = ExtractPkDictionary(root);
                    deletedEvents.Add(new DeletedCdcEvent(entry.Seq, table, entry.RowId, pkValues));
                }

                if (string.Equals(table, "User", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var rowUserId))
                {
                    userIds.Add(rowUserId);
                }

                if (TryGetInt(root, "userId", out var uid))
                {
                    userIds.Add(uid);
                }

                if (TryGetInt(root, "patientId", out var patId))
                {
                    if (string.Equals(table, "Prescription", StringComparison.Ordinal))
                    {
                        clinicPatientIds.Add(patId);
                    }
                    else
                    {
                        userIds.Add(patId);
                    }
                }

                if (TryGetInt(root, "clinicPatientId", out var cpId))
                {
                    clinicPatientIds.Add(cpId);
                }
                if (string.Equals(table, "ClinicPatient", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var cpRowId))
                {
                    clinicPatientIds.Add(cpRowId);
                }

                if (TryGetInt(root, "philHealthRecordId", out var prId))
                {
                    philHealthRecordIds.Add(prId);
                }
                if (string.Equals(table, "PhilHealthRecord", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var prRowId))
                {
                    philHealthRecordIds.Add(prRowId);
                }

                if (TryGetInt(root, "appointmentId", out var apptId))
                {
                    appointmentIds.Add(apptId);
                }
                if (string.Equals(table, "Appointment", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var apptRowId))
                {
                    appointmentIds.Add(apptRowId);
                }

                if (TryGetInt(root, "consultationTicketId", out var consultId))
                {
                    consultIds.Add(consultId);
                }
                if (string.Equals(table, "ConsultationTicket", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var consultRowId))
                {
                    consultIds.Add(consultRowId);
                }

                if (TryGetInt(root, "prescriptionId", out var rxId))
                {
                    prescriptionIds.Add(rxId);
                }
                if (string.Equals(table, "Prescription", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var rxRowId))
                {
                    prescriptionIds.Add(rxRowId);
                }

                if (TryGetInt(root, "medicineId", out var medId))
                {
                    medicineIds.Add(medId);
                }
                if (string.Equals(table, "Medicine", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var medRowId))
                {
                    medicineIds.Add(medRowId);
                }

                if (TryGetInt(root, "medicationId", out var medicationId))
                {
                    medicationIds.Add(medicationId);
                }
                if (string.Equals(table, "Medication", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var medicationRowId))
                {
                    medicationIds.Add(medicationRowId);
                }

                if (TryGetInt(root, "clinicLaboratoryRequestId", out var labReqId))
                {
                    labReqIds.Add(labReqId);
                }
                if (string.Equals(table, "ClinicLaboratoryRequest", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var labReqRowId))
                {
                    labReqIds.Add(labReqRowId);
                }

                if (TryGetInt(root, "clinicImagingRequestId", out var imgReqId))
                {
                    imgReqIds.Add(imgReqId);
                }
                if (string.Equals(table, "ClinicImagingRequest", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var imgReqRowId))
                {
                    imgReqIds.Add(imgReqRowId);
                }

                if (TryGetInt(root, "clinicHeartStationRequestId", out var heartReqId))
                {
                    heartReqIds.Add(heartReqId);
                }
                if (string.Equals(table, "ClinicHeartStationRequest", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var heartReqRowId))
                {
                    heartReqIds.Add(heartReqRowId);
                }

                if (TryGetInt(root, "fileId", out var fileId))
                {
                    fileIds.Add(fileId);
                }
                if (string.Equals(table, "File", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var fileRowId))
                {
                    fileIds.Add(fileRowId);
                }

                if (TryGetInt(root, "folderId", out var folderId))
                {
                    folderIds.Add(folderId);
                }
                if (string.Equals(table, "Folder", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var folderRowId))
                {
                    folderIds.Add(folderRowId);
                }

                if (TryGetInt(root, "fileSettingId", out var fsId))
                {
                    fileSettingIds.Add(fsId);
                }
                if (string.Equals(table, "FileSetting", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var fsRowId))
                {
                    fileSettingIds.Add(fsRowId);
                }

                if (TryGetInt(root, "folderSettingId", out var flsId))
                {
                    folderSettingIds.Add(flsId);
                }
                if (string.Equals(table, "FolderSetting", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var flsRowId))
                {
                    folderSettingIds.Add(flsRowId);
                }

                if (TryGetInt(root, "orgMemberId", out var omId))
                {
                    orgMemberIds.Add(omId);
                }
                if (string.Equals(table, "OrganizationMember", StringComparison.Ordinal) &&
                    int.TryParse(entry.RowId, out var omRowId))
                {
                    orgMemberIds.Add(omRowId);
                }
            }
            catch (JsonException)
            {
                // Ignore malformed JSON while still advancing MaxSeq and RawEventCount
            }
            finally
            {
                doc?.Dispose();
            }
        }

        return new ExtractedCdcKeys(
            UserIds: userIds,
            ClinicPatientIds: clinicPatientIds,
            PhilHealthRecordIds: philHealthRecordIds,
            AppointmentIds: appointmentIds,
            ConsultIds: consultIds,
            PrescriptionIds: prescriptionIds,
            MedicineIds: medicineIds,
            MedicationIds: medicationIds,
            LabReqIds: labReqIds,
            ImgReqIds: imgReqIds,
            HeartReqIds: heartReqIds,
            FileIds: fileIds,
            FolderIds: folderIds,
            FileSettingIds: fileSettingIds,
            FolderSettingIds: folderSettingIds,
            OrgMemberIds: orgMemberIds,
            DeletedEvents: deletedEvents,
            MaxSeq: maxSeq,
            RawEventCount: rawCount);
    }

    public static IReadOnlyList<(string EntityType, string V1Id)> GetTrack1DeleteMapKeys(
        DeletedCdcEvent evt,
        int? v1ClinicId = null)
    {
        var keys = new List<(string EntityType, string V1Id)>();
        var id = evt.RowId;
        if (string.IsNullOrWhiteSpace(id)) return keys;

        if (v1ClinicId.HasValue &&
            evt.PkValues.TryGetValue("clinicId", out var cidStr) &&
            int.TryParse(cidStr, out var cid) &&
            cid != v1ClinicId.Value)
        {
            return keys;
        }

        switch (evt.TableName)
        {
            case "User":
                keys.Add(("Patient", id));
                break;
            case "ClinicPatient":
                if (evt.PkValues.TryGetValue("patientId", out var cpUid) && !string.IsNullOrWhiteSpace(cpUid))
                    keys.Add(("Patient", cpUid));
                break;
            case "UserAddress":
                keys.Add(("PatientAddress", id));
                break;
            case "UserEmergencyContact":
                keys.Add(("PatientGuardian", id));
                break;
            case "UserAllergy":
                keys.Add(("PatientAllergy", id));
                break;
            case "UserHealthCondition":
                keys.Add(("PatientMedicalHistory", $"hc:{id}"));
                break;
            case "MedicalHistory":
                keys.Add(("PatientMedicalHistory", $"mh:{id}"));
                break;
            case "UserDisability":
                keys.Add(("PatientMedicalHistory", $"dis:{id}"));
                break;
            case "FamilyMedicalHistory":
                keys.Add(("PatientFamilyHistory", id));
                break;
            case "PersonalHistory":
                keys.Add(("PatientSocialHistory", id));
                break;
            case "ObGyneHistory":
                keys.Add(("PatientReproductiveHistory", id));
                break;
            case "SurgicalHistory":
                keys.Add(("PatientSurgicalHistory", id));
                break;
            case "UserVaccination":
            case "PatientImmunization":
                keys.Add(("PatientImmunization", id));
                break;
            case "PhilHealthRecord":
                keys.Add(("PatientPhilHealth", id));
                break;
            case "PhysicalExamination":
                keys.Add(("PatientPhysicalExam", id));
                break;
            case "Medication":
                keys.Add(("PatientHomeMedication", id));
                break;
            case "PatientInsight":
                keys.Add(("PatientAlert", id));
                break;
            case "Appointment":
                keys.Add(("Appointment", id));
                keys.Add(("QueueItem", $"appt:{id}"));
                break;
            case "ConsultationTicket":
                keys.Add(("Consultation", id));
                break;
            case "VitalSign":
                keys.Add(("PatientVitals", $"vital:{id}"));
                break;
            case "PreAssessmentNote":
                keys.Add(("PatientVitals", $"preassess:{id}"));
                break;
            case "Medicine":
                keys.Add(("Prescription", id));
                break;
            case "MedicineDispenseRecord":
                keys.Add(("ClinicDispensingLog", id));
                break;
            case "ClinicLaboratoryRequest":
                keys.Add(("LabOrder", $"lab:{id}"));
                break;
            case "ClinicImagingRequest":
                keys.Add(("LabOrder", $"img:{id}"));
                break;
            case "ClinicHeartStationRequest":
                keys.Add(("LabOrder", $"ecg:{id}"));
                break;
            case "ClinicLaboratoryRequestProcedure":
                keys.Add(("LabOrderItem", $"lab:{id}"));
                break;
            case "ClinicImagingRequestProcedure":
                keys.Add(("LabOrderItem", $"img:{id}"));
                break;
            case "ClinicHeartStationRequestProcedure":
                keys.Add(("LabOrderItem", $"ecg:{id}"));
                break;
            case "ClinicMedicalCertificate":
                keys.Add(("MedicalCertificate", id));
                break;
            case "File":
                keys.Add(("RecordAttachment", $"file:{id}"));
                break;
            case "AppointmentAttachment":
                keys.Add(("RecordAttachment", $"appt_att:{id}"));
                break;
        }

        return keys;
    }

    public static IReadOnlyList<(string EntityType, string V1Id)> GetTrack2DeleteMapKeys(DeletedCdcEvent evt)
    {
        var keys = new List<(string EntityType, string V1Id)>();
        var id = evt.RowId;
        if (string.IsNullOrWhiteSpace(id)) return keys;

        switch (evt.TableName)
        {
            case "User":
                keys.Add(("PatientAccount", id));
                break;
            case "UserAddress":
                keys.Add(("PatientAddress", id));
                break;
            case "UserEmergencyContact":
                keys.Add(("EmergencyContact", id));
                break;
            case "UserAllergy":
                keys.Add(("PatientAllergy", id));
                break;
            case "UserHealthCondition":
                keys.Add(("PatientChronicCondition", id));
                break;
            case "MedicalHistory":
                keys.Add(("PatientPastIllness", id));
                break;
            case "FamilyMedicalHistory":
                keys.Add(("PatientFamilyHistory", id));
                break;
            case "PersonalHistory":
                keys.Add(("PatientSocialHistory", id));
                break;
            case "ObGyneHistory":
                keys.Add(("PatientObstetricProfile", id));
                break;
            case "SurgicalHistory":
                keys.Add(("PatientSurgicalHistory", id));
                break;
            case "UserDisability":
                keys.Add(("PatientDisability", id));
                break;
            case "UserVaccination":
            case "PatientImmunization":
                keys.Add(("PatientImmunizationSelf", id));
                keys.Add(("VaccinationAdministered", id));
                break;
            case "Medication":
                keys.Add(("PatientMedication", id));
                break;
            case "MedicationDrug":
                if (evt.PkValues.TryGetValue("medicationId", out var parentMedId) && !string.IsNullOrWhiteSpace(parentMedId))
                    keys.Add(("PatientMedication", $"{parentMedId}:{id}"));
                keys.Add(("PatientMedication", id));
                break;
            case "PhilHealthRecord":
                keys.Add(("PatientGovernmentId", $"{id}:pin"));
                keys.Add(("PatientGovernmentId", $"{id}:tin"));
                keys.Add(("PatientGovernmentId", $"{id}:psn"));
                break;
            case "File":
                keys.Add(("FileRecord", id));
                break;
            case "ClinicPatient":
                keys.Add(("ClinicMembership", id));
                break;
            case "Appointment":
                keys.Add(("PatientAppointment", id));
                break;
            case "ConsultationTicket":
                keys.Add(("PatientConsultation", id));
                break;
            case "VitalSign":
                keys.Add(("PatientVitalSign", id));
                break;
            case "Prescription":
                keys.Add(("PatientPrescriptionDocument", id));
                break;
            case "Medicine":
                keys.Add(("PatientPrescription", id));
                break;
            case "ClinicMedicalCertificate":
                keys.Add(("PatientMedicalCertificate", id));
                break;
            case "ClinicLaboratoryRequest":
                keys.Add(("PatientLabRequestSlip", $"lab:{id}"));
                break;
            case "ClinicImagingRequest":
                keys.Add(("PatientLabRequestSlip", $"img:{id}"));
                break;
            case "ClinicHeartStationRequest":
                keys.Add(("PatientLabRequestSlip", $"ecg:{id}"));
                break;
        }

        return keys;
    }

    private static async Task CollectIdsAsync(
        NpgsqlConnection v1,
        string sql,
        HashSet<int> inputIds,
        int? clinicId,
        int? orgId,
        HashSet<int> outputIds,
        CancellationToken ct)
    {
        if (inputIds.Count == 0) return;

        await using var cmd = new NpgsqlCommand(sql, v1);
        cmd.Parameters.AddWithValue("ids", inputIds.ToArray());
        if (sql.Contains("@cid", StringComparison.Ordinal))
        {
            cmd.Parameters.Add(new NpgsqlParameter("cid", NpgsqlDbType.Integer) { Value = (object?)clinicId ?? DBNull.Value });
        }
        if (sql.Contains("@oid", StringComparison.Ordinal))
        {
            cmd.Parameters.Add(new NpgsqlParameter("oid", NpgsqlDbType.Integer) { Value = (object?)orgId ?? DBNull.Value });
        }

        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            if (!r.IsDBNull(0))
            {
                outputIds.Add(r.GetInt32(0));
            }
        }
    }

    private static Dictionary<string, string?> ExtractPkDictionary(JsonElement root)
    {
        var dict = new Dictionary<string, string?>(StringComparer.Ordinal);
        if (root.ValueKind != JsonValueKind.Object) return dict;

        foreach (var prop in root.EnumerateObject())
        {
            dict[prop.Name] = prop.Value.ValueKind switch
            {
                JsonValueKind.String => prop.Value.GetString(),
                JsonValueKind.Number => prop.Value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => null
            };
        }

        return dict;
    }

    private static bool TryGetInt(JsonElement root, string prop, out int value)
    {
        value = 0;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(prop, out var el))
            return false;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out value))
            return true;
        if (el.ValueKind == JsonValueKind.String && int.TryParse(el.GetString(), out value))
            return true;
        return false;
    }
}
