using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using Npgsql;

namespace ClinicEz.V1Sync.Api.Services;

/// <summary>
/// Migration-scoped patient identity directory and manual Clerk reconciliation service
/// backing `/api/v1/v1-sync/patient-identities` for the Platform Admin Console (`/v1-sync`).
/// Returns strictly non-clinical identity metadata and records every reconciliation in `sync_audit_logs`.
/// </summary>
public sealed class PatientIdentityDirectoryService(
    SyncConnectionFactory connections,
    SyncLedgerRepository ledger)
{
    public const string ClerkEmailReclaimActor = "System:ClerkEmailReclaim";

    public async Task<PatientIdentityDirectoryResponse> ListAsync(
        string? search,
        string? statusFilter,
        int limit,
        int offset,
        CancellationToken ct = default)
    {
        var resolvedLimit = Math.Clamp(limit <= 0 ? 25 : limit, 1, 100);
        var resolvedOffset = Math.Max(0, offset);
        var normalizedFilter = NormalizeFilter(statusFilter);
        var normalizedSearch = string.IsNullOrWhiteSpace(search) ? null : $"%{search.Trim()}%";

        if (!connections.HasPatientDb)
        {
            return new PatientIdentityDirectoryResponse(
                new PatientIdentitySummaryRecord(0, 0, 0, 0, 0, 0),
                Array.Empty<PatientIdentityItemRecord>(),
                0,
                resolvedLimit,
                resolvedOffset);
        }

        await using var conn = await connections.OpenPatientDbAsync(ct);
        var primaryPredicate = await BuildPrimaryPredicateAsync(conn, ct);

        // 1. Live KPI summary across all primary patients
        var summarySql = $"""
            WITH primary_patients AS (
                SELECT id, clerk_user_id, email, updated_by
                FROM public.patients
                WHERE {primaryPredicate}
            ),
            dup_emails AS (
                SELECT LOWER(BTRIM(email)) AS norm_email, COUNT(*) AS cnt
                FROM primary_patients
                WHERE email IS NOT NULL AND BTRIM(email) <> ''
                GROUP BY LOWER(BTRIM(email))
                HAVING COUNT(*) > 1
            )
            SELECT
                (SELECT COUNT(*) FROM primary_patients) AS total_primary,
                (SELECT COUNT(*) FROM primary_patients WHERE clerk_user_id IS NOT NULL AND BTRIM(clerk_user_id) <> '') AS clerk_linked,
                (SELECT COUNT(*) FROM primary_patients WHERE clerk_user_id IS NULL OR BTRIM(clerk_user_id) = '') AS unlinked,
                (SELECT COUNT(*) FROM primary_patients WHERE clerk_user_id IS NOT NULL AND BTRIM(clerk_user_id) <> '' AND updated_by = @reclaimActor) AS reclaimed,
                (SELECT COUNT(*) FROM dup_emails) AS dup_groups,
                (SELECT COALESCE(SUM(cnt), 0) FROM dup_emails) AS dup_patients
            """;

        PatientIdentitySummaryRecord summary;
        await using (var cmd = new NpgsqlCommand(summarySql, conn))
        {
            cmd.Parameters.AddWithValue("reclaimActor", ClerkEmailReclaimActor);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            await r.ReadAsync(ct);
            summary = new PatientIdentitySummaryRecord(
                TotalPrimaryPatients: r.GetInt64(0),
                ClerkLinkedCount: r.GetInt64(1),
                UnlinkedCount: r.GetInt64(2),
                ReclaimedViaEmailCount: r.GetInt64(3),
                AmbiguousDuplicateEmailGroups: r.GetInt64(4),
                AmbiguousDuplicatePatientCount: r.GetInt64(5));
        }

        // 2. Filtered total + page rows (non-clinical identity metadata ONLY)
        var statusClause = normalizedFilter switch
        {
            "CLERK_LINKED" => "AND p.clerk_user_id IS NOT NULL AND BTRIM(p.clerk_user_id) <> ''",
            "UNLINKED" => "AND (p.clerk_user_id IS NULL OR BTRIM(p.clerk_user_id) = '')",
            "RECLAIMED" => "AND p.clerk_user_id IS NOT NULL AND BTRIM(p.clerk_user_id) <> '' AND p.updated_by = @reclaimActor",
            "AMBIGUOUS_EMAIL" => "AND COALESCE(d.cnt, 0) > 1",
            _ => string.Empty
        };

        var searchClause = normalizedSearch is null
            ? string.Empty
            : """
              AND (
                  p.clinic_ez_id ILIKE @q OR
                  p.first_name ILIKE @q OR
                  p.last_name ILIKE @q OR
                  COALESCE(p.email, '') ILIKE @q OR
                  COALESCE(p.clerk_user_id, '') ILIKE @q
              )
              """;

        var ctePrefix = $"""
            WITH primary_patients AS (
                SELECT id, clinic_ez_id, first_name, last_name, email, clerk_user_id, created_at, updated_at, updated_by
                FROM public.patients
                WHERE {primaryPredicate}
            ),
            email_counts AS (
                SELECT LOWER(BTRIM(email)) AS norm_email, COUNT(*)::int AS cnt
                FROM primary_patients
                WHERE email IS NOT NULL AND BTRIM(email) <> ''
                GROUP BY LOWER(BTRIM(email))
            )
            """;

        long totalMatching;
        var countSql = $"""
            {ctePrefix}
            SELECT COUNT(*)
            FROM primary_patients p
            LEFT JOIN email_counts d ON d.norm_email = LOWER(BTRIM(p.email))
            WHERE TRUE {statusClause} {searchClause}
            """;

        await using (var cmd = new NpgsqlCommand(countSql, conn))
        {
            cmd.Parameters.AddWithValue("reclaimActor", ClerkEmailReclaimActor);
            if (normalizedSearch is not null) cmd.Parameters.AddWithValue("q", normalizedSearch);
            totalMatching = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
        }

        var pageSql = $"""
            {ctePrefix}
            SELECT
                p.id,
                p.clinic_ez_id,
                p.first_name,
                p.last_name,
                p.email,
                p.clerk_user_id,
                COALESCE(d.cnt, CASE WHEN p.email IS NOT NULL AND BTRIM(p.email) <> '' THEN 1 ELSE 0 END) AS dup_cnt,
                p.created_at,
                p.updated_at,
                p.updated_by
            FROM primary_patients p
            LEFT JOIN email_counts d ON d.norm_email = LOWER(BTRIM(p.email))
            WHERE TRUE {statusClause} {searchClause}
            ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.id ASC
            LIMIT @lim OFFSET @off
            """;

        var rawItems = new List<(Guid Id, string ClinicEzId, string FirstName, string LastName, string? Email, string? ClerkUserId, int DupCnt, DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt, string? UpdatedBy)>();
        await using (var cmd = new NpgsqlCommand(pageSql, conn))
        {
            cmd.Parameters.AddWithValue("reclaimActor", ClerkEmailReclaimActor);
            if (normalizedSearch is not null) cmd.Parameters.AddWithValue("q", normalizedSearch);
            cmd.Parameters.AddWithValue("lim", resolvedLimit);
            cmd.Parameters.AddWithValue("off", resolvedOffset);

            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                rawItems.Add((
                    r.GetGuid(0),
                    r.GetString(1),
                    r.GetString(2),
                    r.GetString(3),
                    r.IsDBNull(4) ? null : r.GetString(4),
                    r.IsDBNull(5) ? null : r.GetString(5),
                    r.GetInt32(6),
                    r.GetFieldValue<DateTimeOffset>(7),
                    r.IsDBNull(8) ? null : r.GetFieldValue<DateTimeOffset>(8),
                    r.IsDBNull(9) ? null : r.GetString(9)));
            }
        }

        var v1IdsByV2Id = await LoadV1UserIdsAsync(rawItems.Select(x => x.Id).ToArray(), ct);

        var items = rawItems.Select(p => new PatientIdentityItemRecord(
            PatientId: p.Id,
            ClinicEzId: p.ClinicEzId,
            FirstName: p.FirstName,
            LastName: p.LastName,
            Email: p.Email,
            ClerkUserId: p.ClerkUserId,
            IdentityStatus: ComputeStatus(p.ClerkUserId, p.UpdatedBy, p.DupCnt),
            DuplicateEmailCount: p.DupCnt,
            V1UserId: v1IdsByV2Id.TryGetValue(p.Id, out var v1Id) ? v1Id : null,
            CreatedAtUtc: p.CreatedAt,
            UpdatedAtUtc: p.UpdatedAt,
            UpdatedBy: p.UpdatedBy)).ToList();

        return new PatientIdentityDirectoryResponse(summary, items, totalMatching, resolvedLimit, resolvedOffset);
    }

    public async Task<BindClerkIdentityResponse> ReconcileClerkAsync(
        Guid patientId,
        BindClerkIdentityRequest request,
        string actor,
        CancellationToken ct = default)
    {
        if (patientId == Guid.Empty)
            throw new ArgumentException("PatientId is required.");

        var action = request.Action?.Trim().ToUpperInvariant();
        if (action is not ("BIND_CLERK" or "UNBIND_CLERK"))
            throw new ArgumentException("Action must be BIND_CLERK or UNBIND_CLERK.");

        var cleanActor = string.IsNullOrWhiteSpace(actor) ? "platform-admin" : actor.Trim();
        string? trimmedClerkId = null;

        if (action == "BIND_CLERK")
        {
            trimmedClerkId = request.ClerkUserId?.Trim();
            if (string.IsNullOrWhiteSpace(trimmedClerkId) ||
                !trimmedClerkId.StartsWith("user_", StringComparison.Ordinal) ||
                trimmedClerkId.Length > 128)
            {
                throw new ArgumentException("ClerkUserId must start with 'user_' and be at most 128 characters.");
            }
        }

        await using var conn = await connections.OpenPatientDbAsync(ct);
        var primaryPredicate = await BuildPrimaryPredicateAsync(conn, ct);

        // Verify patient exists
        var checkSql = $"SELECT COUNT(*) FROM public.patients WHERE id = @pid AND {primaryPredicate}";
        await using (var checkCmd = new NpgsqlCommand(checkSql, conn))
        {
            checkCmd.Parameters.AddWithValue("pid", patientId);
            if (Convert.ToInt64(await checkCmd.ExecuteScalarAsync(ct)) == 0)
            {
                throw new KeyNotFoundException($"Primary patient '{patientId}' was not found.");
            }
        }

        if (action == "BIND_CLERK")
        {
            const string conflictSql = "SELECT COUNT(*) FROM public.patients WHERE clerk_user_id = @cid AND id <> @pid AND is_deleted = false";
            await using var conflictCmd = new NpgsqlCommand(conflictSql, conn);
            conflictCmd.Parameters.AddWithValue("cid", trimmedClerkId!);
            conflictCmd.Parameters.AddWithValue("pid", patientId);
            if (Convert.ToInt64(await conflictCmd.ExecuteScalarAsync(ct)) > 0)
            {
                throw new InvalidOperationException($"Clerk user '{trimmedClerkId}' is already bound to another patient account.");
            }
        }

        var updatedByTag = action == "BIND_CLERK"
            ? Truncate($"Admin:V1SyncBindClerk:{cleanActor}", 128)
            : Truncate($"Admin:V1SyncUnbindClerk:{cleanActor}", 128);

        const string updateSql = """
            UPDATE public.patients
            SET clerk_user_id = @cid,
                updated_at = now(),
                updated_by = @updatedBy
            WHERE id = @pid AND is_deleted = false
            RETURNING id, clinic_ez_id, first_name, last_name, email, clerk_user_id, created_at, updated_at, updated_by
            """;

        PatientIdentityItemRecord updatedItem;
        try
        {
            await using var updateCmd = new NpgsqlCommand(updateSql, conn);
            updateCmd.Parameters.AddWithValue("pid", patientId);
            updateCmd.Parameters.AddWithValue("cid", (object?)trimmedClerkId ?? DBNull.Value);
            updateCmd.Parameters.AddWithValue("updatedBy", updatedByTag);

            await using var r = await updateCmd.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct))
            {
                throw new KeyNotFoundException($"Primary patient '{patientId}' was not found.");
            }

            var clinicEzId = r.GetString(1);
            var firstName = r.GetString(2);
            var lastName = r.GetString(3);
            var email = r.IsDBNull(4) ? null : r.GetString(4);
            var clerkId = r.IsDBNull(5) ? null : r.GetString(5);
            var createdAt = r.GetFieldValue<DateTimeOffset>(6);
            var updatedAt = r.IsDBNull(7) ? (DateTimeOffset?)null : r.GetFieldValue<DateTimeOffset>(7);
            var updatedBy = r.IsDBNull(8) ? null : r.GetString(8);

            await r.CloseAsync();

            var dupCount = 0;
            if (!string.IsNullOrWhiteSpace(email))
            {
                var dupSql = $"SELECT COUNT(*)::int FROM public.patients WHERE {primaryPredicate} AND email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(@em))";
                await using var dupCmd = new NpgsqlCommand(dupSql, conn);
                dupCmd.Parameters.AddWithValue("em", email);
                dupCount = Convert.ToInt32(await dupCmd.ExecuteScalarAsync(ct));
            }

            var v1Map = await LoadV1UserIdsAsync(new[] { patientId }, ct);
            updatedItem = new PatientIdentityItemRecord(
                PatientId: patientId,
                ClinicEzId: clinicEzId,
                FirstName: firstName,
                LastName: lastName,
                Email: email,
                ClerkUserId: clerkId,
                IdentityStatus: ComputeStatus(clerkId, updatedBy, dupCount),
                DuplicateEmailCount: dupCount,
                V1UserId: v1Map.TryGetValue(patientId, out var v1Id) ? v1Id : null,
                CreatedAtUtc: createdAt,
                UpdatedAtUtc: updatedAt,
                UpdatedBy: updatedBy);
        }
        catch (PostgresException ex) when (ex.SqlState == "23505")
        {
            throw new InvalidOperationException($"Clerk user '{trimmedClerkId}' is already bound to another patient account.");
        }

        // Record immutable zero-PHI audit trail in sync_audit_logs
        if (connections.HasSyncLedgerDb)
        {
            await ledger.AppendAuditAsync(
                bindingId: null,
                action: action == "BIND_CLERK" ? "PATIENT_IDENTITY_BIND_CLERK" : "PATIENT_IDENTITY_UNBIND_CLERK",
                actor: cleanActor,
                details: new
                {
                    patientId,
                    clinicEzId = updatedItem.ClinicEzId,
                    action,
                    reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim()
                },
                ct: ct);
        }

        return new BindClerkIdentityResponse(updatedItem, action);
    }

    private async Task<Dictionary<Guid, string>> LoadV1UserIdsAsync(Guid[] v2Ids, CancellationToken ct)
    {
        var map = new Dictionary<Guid, string>();
        if (v2Ids.Length == 0 || !connections.HasSyncLedgerDb) return map;

        await using var conn = await connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT v2_id, v1_id
            FROM public.sync_id_map
            WHERE entity_type = 'PatientAccount'
              AND v2_id = ANY(@ids)
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("ids", v2Ids);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetGuid(0)] = r.GetString(1);
        }
        return map;
    }

    private static async Task<string> BuildPrimaryPredicateAsync(NpgsqlConnection conn, CancellationToken ct)
    {
        const string colCheckSql = """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'patients'
                  AND column_name = 'managed_by_patient_id'
            )
            """;
        await using var cmd = new NpgsqlCommand(colCheckSql, conn);
        var hasManagedCol = Convert.ToBoolean(await cmd.ExecuteScalarAsync(ct));
        return hasManagedCol
            ? "is_deleted = false AND managed_by_patient_id IS NULL"
            : "is_deleted = false";
    }

    private static string ComputeStatus(string? clerkUserId, string? updatedBy, int dupCount)
    {
        if (!string.IsNullOrWhiteSpace(clerkUserId))
        {
            return string.Equals(updatedBy, ClerkEmailReclaimActor, StringComparison.Ordinal)
                ? "Reclaimed"
                : "ClerkLinked";
        }

        return dupCount > 1 ? "AmbiguousEmail" : "Unlinked";
    }

    private static string NormalizeFilter(string? raw) => (raw?.Trim().ToUpperInvariant()) switch
    {
        "CLERK_LINKED" => "CLERK_LINKED",
        "UNLINKED" => "UNLINKED",
        "RECLAIMED" => "RECLAIMED",
        "AMBIGUOUS_EMAIL" => "AMBIGUOUS_EMAIL",
        _ => "ALL"
    };

    private static string Truncate(string value, int maxLen) =>
        value.Length <= maxLen ? value : value[..maxLen];
}
