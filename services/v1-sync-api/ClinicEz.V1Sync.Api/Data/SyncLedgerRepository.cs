using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using Npgsql;
using NpgsqlTypes;

namespace ClinicEz.V1Sync.Api.Data;

public sealed record StoredRowHash(Guid V2Id, string V1PayloadHash, string V2ExpectedHash);

public sealed class SyncLedgerRepository
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly SyncConnectionFactory _connections;

    public SyncLedgerRepository(SyncConnectionFactory connections)
    {
        _connections = connections;
    }

    public async Task EnsureSchemaAsync(CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            CREATE TABLE IF NOT EXISTS sync_bindings (
                id                    UUID        PRIMARY KEY,
                track                 TEXT        NOT NULL CHECK (track IN ('TRACK1_CLINIC', 'TRACK2_PATIENT', 'TRACK3_STORAGE')),
                name                  TEXT        NOT NULL,
                v1_clinic_id          INT,
                v1_org_id             INT,
                v2_tenant_id          TEXT,
                v2_clinic_id          UUID,
                patient_cohort_mode   TEXT        NOT NULL DEFAULT 'SCOPED' CHECK (patient_cohort_mode IN ('SCOPED', 'GLOBAL')),
                auto_sync_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
                poll_interval_seconds INT         NOT NULL DEFAULT 30,
                batch_size            INT         NOT NULL DEFAULT 200,
                is_frozen             BOOLEAN     NOT NULL DEFAULT FALSE,
                frozen_at             TIMESTAMPTZ,
                frozen_by             TEXT,
                freeze_reason         TEXT,
                created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            ALTER TABLE sync_bindings
                ADD COLUMN IF NOT EXISTS batch_size INT NOT NULL DEFAULT 200;

            CREATE TABLE IF NOT EXISTS sync_id_map (
                binding_id      UUID        NOT NULL REFERENCES sync_bindings(id) ON DELETE CASCADE,
                entity_type     TEXT        NOT NULL,
                v1_id           TEXT        NOT NULL,
                v2_id           UUID        NOT NULL,
                last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (binding_id, entity_type, v1_id)
            );

            CREATE INDEX IF NOT EXISTS ix_sync_id_map_v2_id
                ON sync_id_map (binding_id, entity_type, v2_id);

            CREATE TABLE IF NOT EXISTS sync_row_hashes (
                binding_id        UUID        NOT NULL REFERENCES sync_bindings(id) ON DELETE CASCADE,
                entity_type       TEXT        NOT NULL,
                v1_id             TEXT        NOT NULL,
                v2_id             UUID        NOT NULL,
                v1_payload_hash   TEXT        NOT NULL,
                v2_expected_hash  TEXT        NOT NULL,
                last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (binding_id, entity_type, v1_id)
            );

            CREATE TABLE IF NOT EXISTS sync_runs (
                id             UUID        PRIMARY KEY,
                binding_id     UUID        NOT NULL REFERENCES sync_bindings(id) ON DELETE CASCADE,
                mode           TEXT        NOT NULL CHECK (mode IN ('DRY_RUN', 'BACKFILL', 'INCREMENTAL', 'FINAL_SWEEP')),
                sample_limit   INT,
                status         TEXT        NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
                triggered_by   TEXT        NOT NULL,
                started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
                completed_at   TIMESTAMPTZ,
                summary_json   JSONB       NOT NULL DEFAULT '{}'::jsonb,
                error_message  TEXT
            );

            CREATE INDEX IF NOT EXISTS ix_sync_runs_binding_started
                ON sync_runs (binding_id, started_at DESC);

            CREATE TABLE IF NOT EXISTS sync_change_diffs (
                id                  BIGSERIAL   PRIMARY KEY,
                run_id              UUID        NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
                binding_id          UUID        NOT NULL REFERENCES sync_bindings(id) ON DELETE CASCADE,
                entity_type         TEXT        NOT NULL,
                v1_id               TEXT        NOT NULL,
                v2_id               UUID,
                action              TEXT        NOT NULL,
                changed_fields_json JSONB       NOT NULL DEFAULT '[]'::jsonb,
                created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS ix_sync_change_diffs_run
                ON sync_change_diffs (run_id, id);

            CREATE INDEX IF NOT EXISTS ix_sync_change_diffs_binding_id
                ON sync_change_diffs (binding_id, id DESC);

            CREATE TABLE IF NOT EXISTS sync_conflicts (
                id                  UUID        PRIMARY KEY,
                binding_id          UUID        NOT NULL REFERENCES sync_bindings(id) ON DELETE CASCADE,
                run_id              UUID        REFERENCES sync_runs(id) ON DELETE SET NULL,
                entity_type         TEXT        NOT NULL,
                v1_id               TEXT        NOT NULL,
                v2_id               UUID        NOT NULL,
                conflict_type       TEXT        NOT NULL,
                changed_fields_json JSONB       NOT NULL DEFAULT '[]'::jsonb,
                incoming_v1_hash    TEXT,
                live_v2_hash        TEXT,
                status              TEXT        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED_KEEP_V2', 'RESOLVED_FORCE_V1', 'RESOLVED_IGNORE')),
                resolved_by         TEXT,
                resolved_at         TIMESTAMPTZ,
                created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS incoming_v1_hash TEXT;
            ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS live_v2_hash TEXT;
            ALTER TABLE sync_conflicts DROP CONSTRAINT IF EXISTS sync_conflicts_status_check;
            ALTER TABLE sync_conflicts ADD CONSTRAINT sync_conflicts_status_check
                CHECK (status IN ('OPEN', 'RESOLVED_KEEP_V2', 'RESOLVED_FORCE_V1', 'RESOLVED_IGNORE'));

            CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_conflicts_open_key
                ON sync_conflicts (binding_id, entity_type, v1_id, conflict_type)
                WHERE status = 'OPEN';

            CREATE TABLE IF NOT EXISTS sync_cursors (
                binding_id        UUID        PRIMARY KEY REFERENCES sync_bindings(id) ON DELETE CASCADE,
                last_changelog_seq BIGINT     NOT NULL DEFAULT 0,
                last_polled_at    TIMESTAMPTZ,
                last_heartbeat_at TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS sync_audit_logs (
                id           BIGSERIAL   PRIMARY KEY,
                binding_id   UUID,
                action       TEXT        NOT NULL,
                actor        TEXT        NOT NULL,
                details_json JSONB       NOT NULL DEFAULT '{}'::jsonb,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            ALTER TABLE sync_bindings DROP CONSTRAINT IF EXISTS sync_bindings_track_check;
            ALTER TABLE sync_bindings ADD CONSTRAINT sync_bindings_track_check
                CHECK (track IN ('TRACK1_CLINIC', 'TRACK2_PATIENT', 'TRACK3_STORAGE'));

            CREATE TABLE IF NOT EXISTS sync_storage_objects (
                binding_id                   UUID        NOT NULL REFERENCES sync_bindings(id) ON DELETE CASCADE,
                target_plane                 TEXT        NOT NULL CHECK (target_plane IN ('CLINIC_ATTACHMENT', 'PATIENT_FILE', 'CLINIC_PATIENT_AVATAR', 'PATIENT_AVATAR')),
                target_entity_id             UUID        NOT NULL,
                owner_id                     UUID        NOT NULL,
                tenant_id                    TEXT,
                source_provider              TEXT        NOT NULL CHECK (source_provider IN ('AZURE_BLOB_1', 'AZURE_BLOB_2', 'VERCEL_BLOB', 'GOOGLE_DRIVE', 'OTHER')),
                source_url                   TEXT        NOT NULL,
                source_size_bytes            BIGINT      NOT NULL DEFAULT 0,
                source_content_type          TEXT,
                source_content_type_captured BOOLEAN     NOT NULL DEFAULT FALSE,
                source_sha256                TEXT,
                target_bucket                TEXT,
                target_r2_key                TEXT,
                encrypted_size_bytes         BIGINT,
                encrypted_sha256             TEXT,
                encryption_key_scheme        TEXT,
                status                       TEXT        NOT NULL DEFAULT 'PENDING'
                                             CHECK (status IN (
                                                 'PENDING', 'MIGRATED', 'VERIFIED',
                                                 'SKIPPED_DEAD_LINK', 'SKIPPED_EMPTY_BLOB',
                                                 'SKIPPED_AUTH_REQUIRED', 'SKIPPED_LEGACY_UNSUPPORTED',
                                                 'FAILED_RETRYABLE', 'FAILED_PERMANENT'
                                             )),
                attempt_count                INT         NOT NULL DEFAULT 0,
                last_error_code              TEXT,
                last_error_message           TEXT,
                migrated_at                  TIMESTAMPTZ,
                verified_at                  TIMESTAMPTZ,
                updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (binding_id, target_plane, target_entity_id)
            );

            ALTER TABLE sync_storage_objects DROP CONSTRAINT IF EXISTS sync_storage_objects_target_plane_check;
            ALTER TABLE sync_storage_objects ADD CONSTRAINT sync_storage_objects_target_plane_check
                CHECK (target_plane IN ('CLINIC_ATTACHMENT', 'PATIENT_FILE', 'CLINIC_PATIENT_AVATAR', 'PATIENT_AVATAR'));

            ALTER TABLE sync_storage_objects DROP CONSTRAINT IF EXISTS sync_storage_objects_source_provider_check;
            ALTER TABLE sync_storage_objects ADD CONSTRAINT sync_storage_objects_source_provider_check
                CHECK (source_provider IN ('AZURE_BLOB_1', 'AZURE_BLOB_2', 'VERCEL_BLOB', 'GOOGLE_DRIVE', 'OTHER'));

            ALTER TABLE sync_storage_objects ADD COLUMN IF NOT EXISTS source_content_type TEXT;
            ALTER TABLE sync_storage_objects ADD COLUMN IF NOT EXISTS source_content_type_captured BOOLEAN NOT NULL DEFAULT FALSE;

            CREATE INDEX IF NOT EXISTS ix_sync_storage_objects_status
                ON sync_storage_objects (binding_id, status, source_provider);

            CREATE TABLE IF NOT EXISTS sync_runtime_settings (
                id                               INT              PRIMARY KEY CHECK (id = 1),
                environment_label                TEXT             NOT NULL,
                max_pool_size                    INT              NOT NULL DEFAULT 2,
                default_batch_size               INT              NOT NULL DEFAULT 200,
                enable_background_worker         BOOLEAN          NOT NULL DEFAULT TRUE,
                default_poll_interval_seconds    INT              NOT NULL DEFAULT 30,
                overnight_poll_interval_seconds  INT              NOT NULL DEFAULT 300,
                overnight_backoff_start_hour_ph  INT              NOT NULL DEFAULT 22,
                overnight_backoff_end_hour_ph    INT              NOT NULL DEFAULT 6,
                storage_enabled                  BOOLEAN          NOT NULL DEFAULT TRUE,
                storage_max_concurrency          INT              NOT NULL DEFAULT 6,
                storage_max_file_size_bytes      BIGINT           NOT NULL DEFAULT 52428800,
                storage_verification_sample_rate DOUBLE PRECISION NOT NULL DEFAULT 0.02,
                azure_blob1_enabled              BOOLEAN          NOT NULL DEFAULT TRUE,
                updated_by                       TEXT,
                updated_at                       TIMESTAMPTZ      NOT NULL DEFAULT now()
            );
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<List<SyncBinding>> ListBindingsAsync(CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT b.id, b.track, b.name, b.v1_clinic_id, b.v1_org_id, b.v2_tenant_id, b.v2_clinic_id,
                   b.patient_cohort_mode, b.auto_sync_enabled, b.poll_interval_seconds,
                   b.is_frozen, b.frozen_at, b.frozen_by, b.freeze_reason, b.created_at, b.updated_at,
                   COALESCE(c.last_changelog_seq, 0) AS last_seq,
                   c.last_polled_at,
                   (SELECT COUNT(*) FROM sync_conflicts cf WHERE cf.binding_id = b.id AND cf.status = 'OPEN') AS open_conflicts,
                   (
                       EXISTS (SELECT 1 FROM sync_id_map m WHERE m.binding_id = b.id)
                       OR EXISTS (SELECT 1 FROM sync_storage_objects sso WHERE sso.binding_id = b.id)
                       OR EXISTS (SELECT 1 FROM sync_runs sr WHERE sr.binding_id = b.id AND sr.mode <> 'DRY_RUN')
                       OR COALESCE(c.last_changelog_seq, 0) > 0
                   ) AS has_sync_history,
                   b.batch_size,
                   (
                       EXISTS (SELECT 1 FROM sync_runs sr WHERE sr.binding_id = b.id AND sr.status = 'COMPLETED' AND sr.mode IN ('DRY_RUN', 'BACKFILL', 'FINAL_SWEEP', 'INCREMENTAL'))
                       OR COALESCE(c.last_changelog_seq, 0) > 0
                   ) AS has_completed_preview,
                   (
                       EXISTS (SELECT 1 FROM sync_runs sr WHERE sr.binding_id = b.id AND sr.status = 'COMPLETED' AND sr.mode IN ('BACKFILL', 'FINAL_SWEEP', 'INCREMENTAL'))
                       OR EXISTS (SELECT 1 FROM sync_id_map m WHERE m.binding_id = b.id)
                       OR EXISTS (SELECT 1 FROM sync_storage_objects sso WHERE sso.binding_id = b.id AND sso.status IN ('MIGRATED', 'VERIFIED'))
                       OR COALESCE(c.last_changelog_seq, 0) > 0
                   ) AS has_completed_migration
            FROM sync_bindings b
            LEFT JOIN sync_cursors c ON c.binding_id = b.id
            ORDER BY b.track, b.created_at ASC
            """;
        var result = new List<SyncBinding>();
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            result.Add(ReadBinding(r));
        }
        return result;
    }

    public async Task<SyncBinding?> GetBindingAsync(Guid id, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT b.id, b.track, b.name, b.v1_clinic_id, b.v1_org_id, b.v2_tenant_id, b.v2_clinic_id,
                   b.patient_cohort_mode, b.auto_sync_enabled, b.poll_interval_seconds,
                   b.is_frozen, b.frozen_at, b.frozen_by, b.freeze_reason, b.created_at, b.updated_at,
                   COALESCE(c.last_changelog_seq, 0) AS last_seq,
                   c.last_polled_at,
                   (SELECT COUNT(*) FROM sync_conflicts cf WHERE cf.binding_id = b.id AND cf.status = 'OPEN') AS open_conflicts,
                   (
                       EXISTS (SELECT 1 FROM sync_id_map m WHERE m.binding_id = b.id)
                       OR EXISTS (SELECT 1 FROM sync_storage_objects sso WHERE sso.binding_id = b.id)
                       OR EXISTS (SELECT 1 FROM sync_runs sr WHERE sr.binding_id = b.id AND sr.mode <> 'DRY_RUN')
                       OR COALESCE(c.last_changelog_seq, 0) > 0
                   ) AS has_sync_history,
                   b.batch_size,
                   (
                       EXISTS (SELECT 1 FROM sync_runs sr WHERE sr.binding_id = b.id AND sr.status = 'COMPLETED' AND sr.mode IN ('DRY_RUN', 'BACKFILL', 'FINAL_SWEEP', 'INCREMENTAL'))
                       OR COALESCE(c.last_changelog_seq, 0) > 0
                   ) AS has_completed_preview,
                   (
                       EXISTS (SELECT 1 FROM sync_runs sr WHERE sr.binding_id = b.id AND sr.status = 'COMPLETED' AND sr.mode IN ('BACKFILL', 'FINAL_SWEEP', 'INCREMENTAL'))
                       OR EXISTS (SELECT 1 FROM sync_id_map m WHERE m.binding_id = b.id)
                       OR EXISTS (SELECT 1 FROM sync_storage_objects sso WHERE sso.binding_id = b.id AND sso.status IN ('MIGRATED', 'VERIFIED'))
                       OR COALESCE(c.last_changelog_seq, 0) > 0
                   ) AS has_completed_migration
            FROM sync_bindings b
            LEFT JOIN sync_cursors c ON c.binding_id = b.id
            WHERE b.id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? ReadBinding(r) : null;
    }

    public async Task<SyncBinding> CreateBindingAsync(CreateBindingRequest req, string actor, CancellationToken ct = default)
    {
        var id = Guid.NewGuid();
        var cohortMode = string.Equals(req.PatientCohortMode, SyncCohortMode.Global, StringComparison.OrdinalIgnoreCase)
            ? SyncCohortMode.Global
            : SyncCohortMode.Scoped;
        var pollSeconds = Math.Clamp(req.PollIntervalSeconds ?? 30, 10, 3600);
        var batchSize = Math.Clamp(req.BatchSize ?? 200, 10, 1000);

        await using (var conn = await _connections.OpenSyncLedgerDbAsync(ct))
        {
            const string sql = """
                INSERT INTO sync_bindings (
                    id, track, name, v1_clinic_id, v1_org_id, v2_tenant_id, v2_clinic_id,
                    patient_cohort_mode, auto_sync_enabled, poll_interval_seconds, batch_size
                ) VALUES (
                    @id, @track, @name, @v1ClinicId, @v1OrgId, @v2TenantId, @v2ClinicId,
                    @cohortMode, @autoSync, @pollSeconds, @batchSize
                );
                INSERT INTO sync_cursors (binding_id, last_changelog_seq)
                VALUES (@id, 0) ON CONFLICT (binding_id) DO NOTHING;
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("track", req.Track);
            cmd.Parameters.AddWithValue("name", req.Name.Trim());
            cmd.Parameters.AddWithValue("v1ClinicId", (object?)req.V1ClinicId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("v1OrgId", (object?)req.V1OrgId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("v2TenantId", (object?)req.V2TenantId?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("v2ClinicId", (object?)req.V2ClinicId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("cohortMode", cohortMode);
            cmd.Parameters.AddWithValue("autoSync", req.AutoSyncEnabled);
            cmd.Parameters.AddWithValue("pollSeconds", pollSeconds);
            cmd.Parameters.AddWithValue("batchSize", batchSize);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        await AppendAuditAsync(id, "BINDING_CREATED", actor, new { req.Track, req.Name, req.V1ClinicId, req.V1OrgId, req.V2TenantId, req.V2ClinicId, cohortMode, batchSize }, ct);
        return (await GetBindingAsync(id, ct))!;
    }

    public async Task<SyncBinding?> UpdateBindingAsync(Guid id, UpdateBindingRequest req, string actor, CancellationToken ct = default)
    {
        var outcome = await UpdateBindingWithGuardAsync(id, req, actor, ct);
        return outcome.IsSuccess ? outcome.Value : null;
    }

    public async Task<BindingMutationOutcome<SyncBinding>> UpdateBindingWithGuardAsync(
        Guid id,
        UpdateBindingRequest req,
        string actor,
        CancellationToken ct = default)
    {
        var existing = await GetBindingAsync(id, ct);
        if (existing is null)
        {
            return new BindingMutationOutcome<SyncBinding>(404, default, "Sync connection not found.");
        }

        if (req.Name is not null && string.IsNullOrWhiteSpace(req.Name))
        {
            return new BindingMutationOutcome<SyncBinding>(400, default, "Connection name cannot be empty.");
        }

        var nextName = req.Name is null ? existing.Name : req.Name.Trim();
        var nextCohort = string.IsNullOrWhiteSpace(req.PatientCohortMode)
            ? existing.PatientCohortMode
            : (string.Equals(req.PatientCohortMode, SyncCohortMode.Global, StringComparison.OrdinalIgnoreCase)
                ? SyncCohortMode.Global
                : SyncCohortMode.Scoped);
        var nextAutoSync = existing.IsFrozen ? false : (req.AutoSyncEnabled ?? existing.AutoSyncEnabled);
        var nextPoll = Math.Clamp(req.PollIntervalSeconds ?? existing.PollIntervalSeconds, 10, 3600);
        var nextBatchSize = Math.Clamp(req.BatchSize ?? existing.BatchSize, 10, 1000);

        var nextV1ClinicId = req.UpdateMapping ? req.V1ClinicId : existing.V1ClinicId;
        var nextV1OrgId = req.UpdateMapping ? req.V1OrgId : existing.V1OrgId;
        var nextV2TenantId = req.UpdateMapping
            ? (string.IsNullOrWhiteSpace(req.V2TenantId) ? null : req.V2TenantId.Trim())
            : existing.V2TenantId;
        var nextV2ClinicId = req.UpdateMapping ? req.V2ClinicId : existing.V2ClinicId;

        var mappingChanged = req.UpdateMapping && (
            nextV1ClinicId != existing.V1ClinicId ||
            nextV1OrgId != existing.V1OrgId ||
            !string.Equals(nextV2TenantId, existing.V2TenantId, StringComparison.OrdinalIgnoreCase) ||
            nextV2ClinicId != existing.V2ClinicId
        );

        if (existing.IsFrozen && (mappingChanged || req.AutoSyncEnabled == true))
        {
            return new BindingMutationOutcome<SyncBinding>(
                409,
                default,
                "This connection is frozen. Unfreeze it before changing mappings or enabling Auto-Sync."
            );
        }

        if (mappingChanged && existing.Track == SyncTrack.Track1Clinic &&
            (!nextV1ClinicId.HasValue || string.IsNullOrWhiteSpace(nextV2TenantId) || !nextV2ClinicId.HasValue))
        {
            return new BindingMutationOutcome<SyncBinding>(
                400,
                default,
                "Clinic Sync connections require explicit Classic (v1) Clinic, Target Tenant, and Target Clinic ID."
            );
        }

        var resetLedger = mappingChanged && existing.HasSyncHistory && req.ForceMappingChange;

        await using (var conn = await _connections.OpenSyncLedgerDbAsync(ct))
        {
            if (mappingChanged)
            {
                if (await HasRunningRunAsync(conn, id, ct))
                {
                    return new BindingMutationOutcome<SyncBinding>(
                        409,
                        default,
                        "Cannot change source or destination while a sync run is in progress."
                    );
                }

                if (existing.HasSyncHistory && !req.ForceMappingChange)
                {
                    return new BindingMutationOutcome<SyncBinding>(
                        409,
                        default,
                        "This connection has existing sync history. Unlock source & destination mapping to confirm resetting its sync ledger."
                    );
                }
            }

            await using var tx = await conn.BeginTransactionAsync(ct);
            const string updateSql = """
                UPDATE sync_bindings
                SET name = @name,
                    v1_clinic_id = @v1ClinicId,
                    v1_org_id = @v1OrgId,
                    v2_tenant_id = @v2TenantId,
                    v2_clinic_id = @v2ClinicId,
                    patient_cohort_mode = @cohortMode,
                    auto_sync_enabled = @autoSync,
                    poll_interval_seconds = @pollSeconds,
                    batch_size = @batchSize,
                    updated_at = now()
                WHERE id = @id
                """;
            await using (var cmd = new NpgsqlCommand(updateSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("id", id);
                cmd.Parameters.AddWithValue("name", nextName);
                cmd.Parameters.AddWithValue("v1ClinicId", (object?)nextV1ClinicId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("v1OrgId", (object?)nextV1OrgId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("v2TenantId", (object?)nextV2TenantId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("v2ClinicId", (object?)nextV2ClinicId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("cohortMode", nextCohort);
                cmd.Parameters.AddWithValue("autoSync", nextAutoSync);
                cmd.Parameters.AddWithValue("pollSeconds", nextPoll);
                cmd.Parameters.AddWithValue("batchSize", nextBatchSize);
                await cmd.ExecuteNonQueryAsync(ct);
            }

            if (resetLedger)
            {
                const string resetSql = """
                    DELETE FROM sync_id_map WHERE binding_id = @id;
                    DELETE FROM sync_row_hashes WHERE binding_id = @id;
                    DELETE FROM sync_conflicts WHERE binding_id = @id;
                    DELETE FROM sync_storage_objects WHERE binding_id = @id;
                    UPDATE sync_cursors
                    SET last_changelog_seq = 0, last_polled_at = NULL
                    WHERE binding_id = @id;
                    """;
                await using var resetCmd = new NpgsqlCommand(resetSql, conn, tx);
                resetCmd.Parameters.AddWithValue("id", id);
                await resetCmd.ExecuteNonQueryAsync(ct);
            }

            await tx.CommitAsync(ct);
        }

        await AppendAuditAsync(
            id,
            resetLedger ? "BINDING_MAPPING_OVERRIDDEN" : "BINDING_UPDATED",
            actor,
            new
            {
                nextName,
                nextCohort,
                nextAutoSync,
                nextPoll,
                mappingChanged,
                resetLedger,
                nextV1ClinicId,
                nextV1OrgId,
                nextV2TenantId,
                nextV2ClinicId,
            },
            ct
        );

        var updated = await GetBindingAsync(id, ct);
        return new BindingMutationOutcome<SyncBinding>(200, updated);
    }

    public async Task<BindingMutationOutcome<DeleteBindingResponse>> DeleteBindingAsync(
        Guid id,
        bool force,
        string actor,
        CancellationToken ct = default)
    {
        var existing = await GetBindingAsync(id, ct);
        if (existing is null)
        {
            return new BindingMutationOutcome<DeleteBindingResponse>(404, default, "Sync connection not found.");
        }

        await using (var conn = await _connections.OpenSyncLedgerDbAsync(ct))
        {
            if (await HasRunningRunAsync(conn, id, ct))
            {
                return new BindingMutationOutcome<DeleteBindingResponse>(
                    409,
                    default,
                    "Cannot delete a connection while a sync run is in progress."
                );
            }

            if (existing.HasSyncHistory && !force)
            {
                return new BindingMutationOutcome<DeleteBindingResponse>(
                    409,
                    default,
                    "This connection has existing sync history. Freeze it to retire, or confirm permanent deletion to remove its sync ledger."
                );
            }

            await using var cmd = new NpgsqlCommand("DELETE FROM sync_bindings WHERE id = @id", conn);
            cmd.Parameters.AddWithValue("id", id);
            var rows = await cmd.ExecuteNonQueryAsync(ct);
            if (rows == 0)
            {
                return new BindingMutationOutcome<DeleteBindingResponse>(404, default, "Sync connection not found.");
            }
        }

        await AppendAuditAsync(
            id,
            "BINDING_DELETED",
            actor,
            new
            {
                existing.Track,
                existing.Name,
                existing.V1ClinicId,
                existing.V1OrgId,
                existing.V2TenantId,
                existing.V2ClinicId,
                existing.HasSyncHistory,
                Forced = force,
            },
            ct
        );

        return new BindingMutationOutcome<DeleteBindingResponse>(
            200,
            new DeleteBindingResponse(id, existing.Name, existing.HasSyncHistory)
        );
    }

    private static async Task<bool> HasRunningRunAsync(NpgsqlConnection conn, Guid bindingId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(
            "SELECT EXISTS (SELECT 1 FROM sync_runs WHERE binding_id = @id AND status = 'RUNNING')",
            conn
        );
        cmd.Parameters.AddWithValue("id", bindingId);
        return Convert.ToBoolean(await cmd.ExecuteScalarAsync(ct));
    }

    public async Task<SyncBinding?> FreezeBindingAsync(Guid id, string actor, string? reason, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            UPDATE sync_bindings
            SET is_frozen = TRUE,
                auto_sync_enabled = FALSE,
                frozen_at = now(),
                frozen_by = @actor,
                freeze_reason = @reason,
                updated_at = now()
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("actor", actor);
        cmd.Parameters.AddWithValue("reason", (object?)reason?.Trim() ?? DBNull.Value);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        if (rows == 0) return null;

        await AppendAuditAsync(id, "BINDING_FROZEN_MANUAL", actor, new { reason }, ct);
        return await GetBindingAsync(id, ct);
    }

    public async Task<SyncBinding?> UnfreezeBindingAsync(Guid id, string actor, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            UPDATE sync_bindings
            SET is_frozen = FALSE,
                frozen_at = NULL,
                frozen_by = NULL,
                freeze_reason = NULL,
                updated_at = now()
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", id);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        if (rows == 0) return null;

        await AppendAuditAsync(id, "BINDING_UNFROZEN", actor, new { }, ct);
        return await GetBindingAsync(id, ct);
    }

    public async Task<Guid> StartRunAsync(
        Guid bindingId,
        string mode,
        int? sampleLimit,
        string triggeredBy,
        CancellationToken ct = default,
        SyncRunSummary? initialSummary = null)
    {
        var runId = Guid.NewGuid();
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            INSERT INTO sync_runs (id, binding_id, mode, sample_limit, status, triggered_by, summary_json)
            VALUES (@id, @bindingId, @mode, @sampleLimit, 'RUNNING', @triggeredBy, @summary::jsonb)
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", runId);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("mode", mode);
        cmd.Parameters.AddWithValue("sampleLimit", (object?)sampleLimit ?? DBNull.Value);
        cmd.Parameters.AddWithValue("triggeredBy", triggeredBy);
        cmd.Parameters.AddWithValue(
            "summary",
            initialSummary is null ? "{}" : JsonSerializer.Serialize(initialSummary, JsonOpts)
        );
        await cmd.ExecuteNonQueryAsync(ct);
        return runId;
    }

    public async Task UpdateRunProgressAsync(Guid runId, SyncRunSummary summary, CancellationToken ct = default)
    {
        try
        {
            await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
            const string sql = """
                UPDATE sync_runs
                SET summary_json = @summary::jsonb
                WHERE id = @id AND status = 'RUNNING'
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("id", runId);
            cmd.Parameters.AddWithValue("summary", JsonSerializer.Serialize(summary, JsonOpts));
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            // Progress checkpoint failure must never abort an otherwise healthy import run.
        }
    }

    public async Task<SyncRunRecord?> GetRunAsync(Guid runId, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT id, binding_id, mode, sample_limit, status, triggered_by, started_at, completed_at, summary_json::text, error_message
            FROM sync_runs
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", runId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        using var doc = JsonDocument.Parse(r.GetString(8));
        return new SyncRunRecord(
            r.GetGuid(0),
            r.GetGuid(1),
            r.GetString(2),
            r.IsDBNull(3) ? null : r.GetInt32(3),
            r.GetString(4),
            r.GetString(5),
            r.GetFieldValue<DateTimeOffset>(6),
            r.IsDBNull(7) ? null : r.GetFieldValue<DateTimeOffset>(7),
            doc.RootElement.Clone(),
            r.IsDBNull(9) ? null : r.GetString(9)
        );
    }

    public async Task CompleteRunAsync(Guid runId, SyncRunSummary summary, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            UPDATE sync_runs
            SET status = 'COMPLETED',
                completed_at = now(),
                summary_json = @summary::jsonb
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", runId);
        cmd.Parameters.AddWithValue("summary", JsonSerializer.Serialize(summary, JsonOpts));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task DeleteRunAsync(Guid runId, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        await using var cmd = new NpgsqlCommand("DELETE FROM sync_runs WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", runId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task TouchCursorPolledAsync(Guid bindingId, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            INSERT INTO sync_cursors (binding_id, last_changelog_seq, last_polled_at, last_heartbeat_at)
            VALUES (@bindingId, 0, now(), now())
            ON CONFLICT (binding_id)
            DO UPDATE SET last_polled_at = now(),
                          last_heartbeat_at = now()
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<IAsyncDisposable?> TryAcquireBindingAdvisoryLockAsync(Guid bindingId, CancellationToken ct = default)
    {
        var lockKey = ComputeAdvisoryLockKey(bindingId);
        var conn = await _connections.OpenSyncLedgerAdvisoryConnectionAsync(ct);
        try
        {
            await using var cmd = new NpgsqlCommand("SELECT pg_try_advisory_lock(@key)", conn);
            cmd.Parameters.AddWithValue("key", lockKey);
            var acquired = Convert.ToBoolean(await cmd.ExecuteScalarAsync(ct));
            if (!acquired)
            {
                await conn.DisposeAsync();
                return null;
            }
            return new AdvisoryLockHandle(conn, lockKey);
        }
        catch
        {
            await conn.DisposeAsync();
            throw;
        }
    }

    private static long ComputeAdvisoryLockKey(Guid bindingId)
    {
        var bytes = bindingId.ToByteArray();
        return BitConverter.ToInt64(bytes, 0) ^ BitConverter.ToInt64(bytes, 8);
    }

    private sealed class AdvisoryLockHandle : IAsyncDisposable
    {
        private readonly NpgsqlConnection _conn;
        private readonly long _lockKey;
        private int _disposed;

        public AdvisoryLockHandle(NpgsqlConnection conn, long lockKey)
        {
            _conn = conn;
            _lockKey = lockKey;
        }

        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            try
            {
                await using var cmd = new NpgsqlCommand("SELECT pg_advisory_unlock(@key)", _conn);
                cmd.Parameters.AddWithValue("key", _lockKey);
                await cmd.ExecuteScalarAsync(CancellationToken.None);
            }
            catch
            {
                // Ignore transient errors if socket already closed; PG releases session advisory lock on disconnect.
            }
            finally
            {
                await _conn.DisposeAsync();
            }
        }
    }

    public Task FailRunAsync(Guid runId, SyncRunSummary summary, Exception exception, CancellationToken ct = default)
    {
        var sanitized = SyncTransforms.SanitizeErrorMessage(exception);
        return WriteFailedRunAsync(runId, summary, sanitized, ct);
    }

    public Task FailRunAsync(Guid runId, SyncRunSummary summary, string errorMessage, CancellationToken ct = default)
    {
        var sanitized = SyncTransforms.SanitizeErrorMessage(errorMessage);
        return WriteFailedRunAsync(runId, summary, sanitized, ct);
    }

    private async Task WriteFailedRunAsync(Guid runId, SyncRunSummary summary, string sanitizedError, CancellationToken ct)
    {
        using var fallbackCts = ct.IsCancellationRequested ? new CancellationTokenSource(TimeSpan.FromSeconds(5)) : null;
        var execCt = fallbackCts?.Token ?? ct;

        await using var conn = await _connections.OpenSyncLedgerDbAsync(execCt);
        const string sql = """
            UPDATE sync_runs
            SET status = 'FAILED',
                completed_at = now(),
                summary_json = @summary::jsonb,
                error_message = @error
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", runId);
        cmd.Parameters.AddWithValue("summary", JsonSerializer.Serialize(summary, JsonOpts));
        cmd.Parameters.AddWithValue("error", sanitizedError.Length > 2000 ? sanitizedError[..2000] : sanitizedError);
        await cmd.ExecuteNonQueryAsync(execCt);
    }

    public async Task<Dictionary<string, StoredRowHash>> LoadRowHashesAsync(Guid bindingId, string entityType, CancellationToken ct = default)
    {
        var map = new Dictionary<string, StoredRowHash>(StringComparer.Ordinal);
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT v1_id, v2_id, v1_payload_hash, v2_expected_hash
            FROM sync_row_hashes
            WHERE binding_id = @bindingId AND entity_type = @entityType
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("entityType", entityType);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetString(0)] = new StoredRowHash(r.GetGuid(1), r.GetString(2), r.GetString(3));
        }
        return map;
    }

    public async Task<Dictionary<string, StoredRowHash>> LoadRowHashesForIdsAsync(
        Guid bindingId,
        string entityType,
        IReadOnlyCollection<string> v1Ids,
        CancellationToken ct = default)
    {
        var map = new Dictionary<string, StoredRowHash>(StringComparer.Ordinal);
        if (v1Ids.Count == 0) return map;

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT v1_id, v2_id, v1_payload_hash, v2_expected_hash
            FROM sync_row_hashes
            WHERE binding_id = @bindingId
              AND entity_type = @entityType
              AND v1_id = ANY(@v1Ids)
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("entityType", entityType);
        cmd.Parameters.AddWithValue("v1Ids", v1Ids.ToArray());
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetString(0)] = new StoredRowHash(r.GetGuid(1), r.GetString(2), r.GetString(3));
        }
        return map;
    }

    public async Task<Dictionary<string, Guid>> GetIdMappingsByV1IdsAsync(
        Guid bindingId,
        string entityType,
        IReadOnlyCollection<string> v1Ids,
        CancellationToken ct = default)
    {
        var map = new Dictionary<string, Guid>(StringComparer.Ordinal);
        if (v1Ids.Count == 0) return map;

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT v1_id, v2_id
            FROM sync_id_map
            WHERE binding_id = @bindingId
              AND entity_type = @entityType
              AND v1_id = ANY(@v1Ids)
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("entityType", entityType);
        cmd.Parameters.AddWithValue("v1Ids", v1Ids.ToArray());
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetString(0)] = r.GetGuid(1);
        }
        return map;
    }

    public async Task<Dictionary<string, Guid>> GetAllIdMappingsForEntityAsync(
        Guid bindingId,
        string entityType,
        CancellationToken ct = default)
    {
        var map = new Dictionary<string, Guid>(StringComparer.Ordinal);
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT v1_id, v2_id
            FROM sync_id_map
            WHERE binding_id = @bindingId
              AND entity_type = @entityType
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("entityType", entityType);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetString(0)] = r.GetGuid(1);
        }
        return map;
    }

    public async Task<Dictionary<string, Guid>> GetIdMappingsByV1IdPrefixAsync(
        Guid bindingId,
        string entityType,
        string prefix,
        CancellationToken ct = default)
    {
        var map = new Dictionary<string, Guid>(StringComparer.Ordinal);
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT v1_id, v2_id
            FROM sync_id_map
            WHERE binding_id = @bindingId
              AND entity_type = @entityType
              AND v1_id LIKE @pattern
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("entityType", entityType);
        cmd.Parameters.AddWithValue("pattern", prefix + "%");
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetString(0)] = r.GetGuid(1);
        }
        return map;
    }

    public async Task UpsertIdMapAndHashBatchAsync(
        Guid bindingId,
        string entityType,
        IReadOnlyList<(string V1Id, Guid V2Id, string V1Hash, string V2ExpectedHash)> items,
        CancellationToken ct = default)
    {
        if (items.Count == 0) return;

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        const string sqlMap = """
            INSERT INTO sync_id_map (binding_id, entity_type, v1_id, v2_id, last_synced_at)
            VALUES (@bindingId, @entityType, @v1Id, @v2Id, now())
            ON CONFLICT (binding_id, entity_type, v1_id)
            DO UPDATE SET v2_id = EXCLUDED.v2_id, last_synced_at = now()
            """;

        const string sqlHash = """
            INSERT INTO sync_row_hashes (binding_id, entity_type, v1_id, v2_id, v1_payload_hash, v2_expected_hash, last_synced_at)
            VALUES (@bindingId, @entityType, @v1Id, @v2Id, @v1Hash, @v2Hash, now())
            ON CONFLICT (binding_id, entity_type, v1_id)
            DO UPDATE SET v2_id = EXCLUDED.v2_id,
                          v1_payload_hash = EXCLUDED.v1_payload_hash,
                          v2_expected_hash = EXCLUDED.v2_expected_hash,
                          last_synced_at = now()
            """;

        await using var batch = new NpgsqlBatch(conn, tx);
        foreach (var item in items)
        {
            var c1 = new NpgsqlBatchCommand(sqlMap);
            c1.Parameters.AddWithValue("bindingId", bindingId);
            c1.Parameters.AddWithValue("entityType", entityType);
            c1.Parameters.AddWithValue("v1Id", item.V1Id);
            c1.Parameters.AddWithValue("v2Id", item.V2Id);
            batch.BatchCommands.Add(c1);

            var c2 = new NpgsqlBatchCommand(sqlHash);
            c2.Parameters.AddWithValue("bindingId", bindingId);
            c2.Parameters.AddWithValue("entityType", entityType);
            c2.Parameters.AddWithValue("v1Id", item.V1Id);
            c2.Parameters.AddWithValue("v2Id", item.V2Id);
            c2.Parameters.AddWithValue("v1Hash", item.V1Hash);
            c2.Parameters.AddWithValue("v2Hash", item.V2ExpectedHash);
            batch.BatchCommands.Add(c2);
        }

        await batch.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task RecordDiffsBatchAsync(
        Guid runId,
        Guid bindingId,
        IReadOnlyList<(string EntityType, string V1Id, Guid? V2Id, string Action, IReadOnlyList<string> ChangedFields)> diffs,
        CancellationToken ct = default)
    {
        if (diffs.Count == 0) return;

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await using var batch = new NpgsqlBatch(conn, tx);

        const string sql = """
            INSERT INTO sync_change_diffs (run_id, binding_id, entity_type, v1_id, v2_id, action, changed_fields_json)
            VALUES (@runId, @bindingId, @entityType, @v1Id, @v2Id, @action, @fields::jsonb)
            """;

        foreach (var d in diffs)
        {
            var cmd = new NpgsqlBatchCommand(sql);
            cmd.Parameters.AddWithValue("runId", runId);
            cmd.Parameters.AddWithValue("bindingId", bindingId);
            cmd.Parameters.AddWithValue("entityType", d.EntityType);
            cmd.Parameters.AddWithValue("v1Id", d.V1Id);
            cmd.Parameters.AddWithValue("v2Id", (object?)d.V2Id ?? DBNull.Value);
            cmd.Parameters.AddWithValue("action", d.Action);
            cmd.Parameters.AddWithValue("fields", JsonSerializer.Serialize(d.ChangedFields, JsonOpts));
            batch.BatchCommands.Add(cmd);
        }

        await batch.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task RecordConflictAsync(
        Guid bindingId,
        Guid runId,
        string entityType,
        string v1Id,
        Guid v2Id,
        string conflictType,
        IReadOnlyList<string> changedFields,
        CancellationToken ct = default,
        string? incomingV1Hash = null,
        string? liveV2Hash = null)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            INSERT INTO sync_conflicts (
                id, binding_id, run_id, entity_type, v1_id, v2_id, conflict_type, changed_fields_json,
                incoming_v1_hash, live_v2_hash
            )
            VALUES (
                @id, @bindingId, @runId, @entityType, @v1Id, @v2Id, @conflictType, @fields::jsonb,
                @incomingV1Hash, @liveV2Hash
            )
            ON CONFLICT (binding_id, entity_type, v1_id, conflict_type) WHERE status = 'OPEN'
            DO UPDATE SET run_id = EXCLUDED.run_id,
                          changed_fields_json = EXCLUDED.changed_fields_json,
                          incoming_v1_hash = COALESCE(EXCLUDED.incoming_v1_hash, sync_conflicts.incoming_v1_hash),
                          live_v2_hash = COALESCE(EXCLUDED.live_v2_hash, sync_conflicts.live_v2_hash)
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid());
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("runId", runId);
        cmd.Parameters.AddWithValue("entityType", entityType);
        cmd.Parameters.AddWithValue("v1Id", v1Id);
        cmd.Parameters.AddWithValue("v2Id", v2Id);
        cmd.Parameters.AddWithValue("conflictType", conflictType);
        cmd.Parameters.AddWithValue("fields", JsonSerializer.Serialize(changedFields, JsonOpts));
        cmd.Parameters.Add(new NpgsqlParameter("incomingV1Hash", NpgsqlDbType.Text) { Value = (object?)incomingV1Hash ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("liveV2Hash", NpgsqlDbType.Text) { Value = (object?)liveV2Hash ?? DBNull.Value });
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<ConflictHashMetadata?> GetConflictWithHashesAsync(Guid conflictId, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT id, binding_id, run_id, entity_type, v1_id, v2_id, conflict_type, changed_fields_json::text,
                   status, resolved_by, resolved_at, created_at, incoming_v1_hash, live_v2_hash
            FROM sync_conflicts
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", conflictId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;

        var fields = JsonSerializer.Deserialize<List<string>>(r.GetString(7), JsonOpts) ?? new List<string>();
        var conflict = new SyncConflictRecord(
            r.GetGuid(0),
            r.GetGuid(1),
            r.IsDBNull(2) ? null : r.GetGuid(2),
            r.GetString(3),
            r.GetString(4),
            r.GetGuid(5),
            r.GetString(6),
            fields,
            r.GetString(8),
            r.IsDBNull(9) ? null : r.GetString(9),
            r.IsDBNull(10) ? null : r.GetFieldValue<DateTimeOffset>(10),
            r.GetFieldValue<DateTimeOffset>(11));

        return new ConflictHashMetadata(
            Conflict: conflict,
            IncomingV1Hash: r.IsDBNull(12) ? null : r.GetString(12),
            LiveV2Hash: r.IsDBNull(13) ? null : r.GetString(13));
    }

    public async Task UpdateCursorAsync(Guid bindingId, long lastSeq, CancellationToken ct = default, bool allowReset = false)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        var sql = allowReset
            ? """
              INSERT INTO sync_cursors (binding_id, last_changelog_seq, last_polled_at, last_heartbeat_at)
              VALUES (@bindingId, @lastSeq, now(), now())
              ON CONFLICT (binding_id)
              DO UPDATE SET last_changelog_seq = EXCLUDED.last_changelog_seq,
                            last_polled_at = now(),
                            last_heartbeat_at = now()
              """
            : """
              INSERT INTO sync_cursors (binding_id, last_changelog_seq, last_polled_at, last_heartbeat_at)
              VALUES (@bindingId, @lastSeq, now(), now())
              ON CONFLICT (binding_id)
              DO UPDATE SET last_changelog_seq = GREATEST(sync_cursors.last_changelog_seq, EXCLUDED.last_changelog_seq),
                            last_polled_at = now(),
                            last_heartbeat_at = now()
              """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("lastSeq", lastSeq);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<long> GetCursorAsync(Guid bindingId, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        await using var cmd = new NpgsqlCommand(
            "SELECT COALESCE((SELECT last_changelog_seq FROM sync_cursors WHERE binding_id = @id), 0)", conn);
        cmd.Parameters.AddWithValue("id", bindingId);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
    }

    public async Task<Dictionary<string, long>> GetMappedCountsByEntityAsync(Guid bindingId, CancellationToken ct = default)
    {
        var counts = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT entity_type, COUNT(*)
            FROM sync_id_map
            WHERE binding_id = @bindingId
            GROUP BY entity_type
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            counts[r.GetString(0)] = r.GetInt64(1);
        }
        return counts;
    }

    public async Task<List<SyncRunRecord>> ListRunsAsync(
        Guid bindingId,
        int limit = 25,
        CancellationToken ct = default,
        string? modeFilter = null)
    {
        var allowedModes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            SyncRunMode.DryRun,
            SyncRunMode.Backfill,
            SyncRunMode.Incremental,
            SyncRunMode.FinalSweep
        };
        var parsedModes = string.IsNullOrWhiteSpace(modeFilter)
            ? Array.Empty<string>()
            : modeFilter
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(m => m.ToUpperInvariant())
                .Where(m => allowedModes.Contains(m))
                .Distinct(StringComparer.Ordinal)
                .ToArray();

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        var sql = parsedModes.Length > 0
            ? """
              SELECT id, binding_id, mode, sample_limit, status, triggered_by, started_at, completed_at, summary_json::text, error_message
              FROM sync_runs
              WHERE binding_id = @bindingId
                AND mode = ANY(@modes)
              ORDER BY started_at DESC
              LIMIT @limit
              """
            : """
              SELECT id, binding_id, mode, sample_limit, status, triggered_by, started_at, completed_at, summary_json::text, error_message
              FROM sync_runs
              WHERE binding_id = @bindingId
              ORDER BY started_at DESC
              LIMIT @limit
              """;
        var list = new List<SyncRunRecord>();
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        if (parsedModes.Length > 0)
        {
            cmd.Parameters.Add(new NpgsqlParameter("modes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = parsedModes });
        }
        cmd.Parameters.AddWithValue("limit", Math.Clamp(limit, 1, 100));
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var summaryJson = r.IsDBNull(8) ? "{}" : r.GetString(8);
            using var doc = JsonDocument.Parse(summaryJson);
            list.Add(new SyncRunRecord(
                r.GetGuid(0),
                r.GetGuid(1),
                r.GetString(2),
                r.IsDBNull(3) ? null : r.GetInt32(3),
                r.GetString(4),
                r.GetString(5),
                r.GetFieldValue<DateTimeOffset>(6),
                r.IsDBNull(7) ? null : r.GetFieldValue<DateTimeOffset>(7),
                doc.RootElement.Clone(),
                r.IsDBNull(9) ? null : r.GetString(9)
            ));
        }
        return list;
    }

    public async Task<(List<SyncChangeDiffRecord> Items, long Total)> ListRunDiffsAsync(
        Guid runId,
        int limit = 200,
        int offset = 0,
        CancellationToken ct = default)
    {
        var clampedLimit = Math.Clamp(limit, 1, 1000);
        var clampedOffset = Math.Max(0, offset);

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);

        long total;
        await using (var countCmd = new NpgsqlCommand("SELECT COUNT(*) FROM sync_change_diffs WHERE run_id = @runId", conn))
        {
            countCmd.Parameters.AddWithValue("runId", runId);
            total = Convert.ToInt64(await countCmd.ExecuteScalarAsync(ct));
        }

        const string sql = """
            SELECT id, run_id, binding_id, entity_type, v1_id, v2_id, action, changed_fields_json::text, created_at
            FROM sync_change_diffs
            WHERE run_id = @runId
            ORDER BY id ASC
            LIMIT @limit OFFSET @offset
            """;
        var list = new List<SyncChangeDiffRecord>();
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("runId", runId);
        cmd.Parameters.AddWithValue("limit", clampedLimit);
        cmd.Parameters.AddWithValue("offset", clampedOffset);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(ReadDiff(r));
        }
        return (list, total);
    }

    public async Task<(List<SyncChangeDiffRecord> Items, long Total)> ListBindingDiffsAsync(
        Guid bindingId,
        int limit = 200,
        int offset = 0,
        CancellationToken ct = default)
    {
        var clampedLimit = Math.Clamp(limit, 1, 1000);
        var clampedOffset = Math.Max(0, offset);

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);

        long total;
        await using (var countCmd = new NpgsqlCommand("SELECT COUNT(*) FROM sync_change_diffs WHERE binding_id = @bindingId", conn))
        {
            countCmd.Parameters.AddWithValue("bindingId", bindingId);
            total = Convert.ToInt64(await countCmd.ExecuteScalarAsync(ct));
        }

        const string sql = """
            SELECT id, run_id, binding_id, entity_type, v1_id, v2_id, action, changed_fields_json::text, created_at
            FROM sync_change_diffs
            WHERE binding_id = @bindingId
            ORDER BY id DESC
            LIMIT @limit OFFSET @offset
            """;
        var list = new List<SyncChangeDiffRecord>();
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("limit", clampedLimit);
        cmd.Parameters.AddWithValue("offset", clampedOffset);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(ReadDiff(r));
        }
        return (list, total);
    }

    public async Task<(List<SyncConflictRecord> Items, long Total)> ListConflictsAsync(
        Guid bindingId,
        string? status = null,
        int limit = 100,
        int offset = 0,
        CancellationToken ct = default)
    {
        var clampedLimit = Math.Clamp(limit, 1, 500);
        var clampedOffset = Math.Max(0, offset);

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);

        long total;
        const string countSql = """
            SELECT COUNT(*)
            FROM sync_conflicts
            WHERE binding_id = @bindingId
              AND (@status IS NULL OR status = @status)
            """;
        await using (var countCmd = new NpgsqlCommand(countSql, conn))
        {
            countCmd.Parameters.AddWithValue("bindingId", bindingId);
            countCmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Text) { Value = (object?)status ?? DBNull.Value });
            total = Convert.ToInt64(await countCmd.ExecuteScalarAsync(ct));
        }

        const string sql = """
            SELECT id, binding_id, run_id, entity_type, v1_id, v2_id, conflict_type, changed_fields_json::text,
                   status, resolved_by, resolved_at, created_at
            FROM sync_conflicts
            WHERE binding_id = @bindingId
              AND (@status IS NULL OR status = @status)
            ORDER BY created_at DESC
            LIMIT @limit OFFSET @offset
            """;
        var list = new List<SyncConflictRecord>();
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Text) { Value = (object?)status ?? DBNull.Value });
        cmd.Parameters.AddWithValue("limit", clampedLimit);
        cmd.Parameters.AddWithValue("offset", clampedOffset);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(ReadConflict(r));
        }
        return (list, total);
    }

    public async Task<(List<ConflictHashMetadata> Items, long Total)> ListConflictsWithHashesForReportAsync(
        Guid bindingId,
        string? status = null,
        int maxRows = 2000,
        CancellationToken ct = default)
    {
        var clampedMax = Math.Clamp(maxRows, 1, 5000);
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);

        long total;
        const string countSql = """
            SELECT COUNT(*)
            FROM sync_conflicts
            WHERE binding_id = @bindingId
              AND (@status IS NULL OR status = @status)
            """;
        await using (var countCmd = new NpgsqlCommand(countSql, conn))
        {
            countCmd.Parameters.AddWithValue("bindingId", bindingId);
            countCmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Text) { Value = (object?)status ?? DBNull.Value });
            total = Convert.ToInt64(await countCmd.ExecuteScalarAsync(ct));
        }

        const string sql = """
            SELECT id, binding_id, run_id, entity_type, v1_id, v2_id, conflict_type, changed_fields_json::text,
                   status, resolved_by, resolved_at, created_at, incoming_v1_hash, live_v2_hash
            FROM sync_conflicts
            WHERE binding_id = @bindingId
              AND (@status IS NULL OR status = @status)
            ORDER BY created_at DESC
            LIMIT @limit
            """;
        var list = new List<ConflictHashMetadata>();
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Text) { Value = (object?)status ?? DBNull.Value });
        cmd.Parameters.AddWithValue("limit", clampedMax);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var conflict = ReadConflict(r);
            list.Add(new ConflictHashMetadata(
                Conflict: conflict,
                IncomingV1Hash: r.IsDBNull(12) ? null : r.GetString(12),
                LiveV2Hash: r.IsDBNull(13) ? null : r.GetString(13)));
        }

        return (list, total);
    }

    public async Task<SyncConflictRecord?> ResolveConflictStatusAsync(
        Guid conflictId,
        string nextStatus,
        string actor,
        string? updateV1Hash = null,
        string? updateV2ExpectedHash = null,
        CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        const string sql = """
            UPDATE sync_conflicts
            SET status = @status,
                resolved_by = @actor,
                resolved_at = now()
            WHERE id = @id
            RETURNING id, binding_id, run_id, entity_type, v1_id, v2_id, conflict_type, changed_fields_json::text,
                      status, resolved_by, resolved_at, created_at
            """;
        SyncConflictRecord? rec;
        await using (var cmd = new NpgsqlCommand(sql, conn, tx))
        {
            cmd.Parameters.AddWithValue("id", conflictId);
            cmd.Parameters.AddWithValue("status", nextStatus);
            cmd.Parameters.AddWithValue("actor", actor);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct))
            {
                await tx.RollbackAsync(ct);
                return null;
            }
            rec = ReadConflict(r);
        }

        if (string.Equals(nextStatus, SyncConflictStatus.ResolvedKeepV2, StringComparison.Ordinal))
        {
            if (rec.V2Id != Guid.Empty && !string.IsNullOrWhiteSpace(rec.V1Id))
            {
                const string idMapUpsertSql = """
                    INSERT INTO sync_id_map (
                        binding_id, entity_type, v1_id, v2_id, last_synced_at
                    ) VALUES (
                        @bindingId, @entityType, @v1Id, @v2Id, now()
                    )
                    ON CONFLICT (binding_id, entity_type, v1_id)
                    DO UPDATE SET v2_id = EXCLUDED.v2_id,
                                  last_synced_at = now()
                    """;
                await using var mapCmd = new NpgsqlCommand(idMapUpsertSql, conn, tx);
                mapCmd.Parameters.AddWithValue("bindingId", rec.BindingId);
                mapCmd.Parameters.AddWithValue("entityType", rec.EntityType);
                mapCmd.Parameters.AddWithValue("v1Id", rec.V1Id);
                mapCmd.Parameters.AddWithValue("v2Id", rec.V2Id);
                await mapCmd.ExecuteNonQueryAsync(ct);
            }

            if (!string.IsNullOrWhiteSpace(updateV1Hash) &&
                !string.IsNullOrWhiteSpace(updateV2ExpectedHash))
            {
                const string hashUpsertSql = """
                    INSERT INTO sync_row_hashes (
                        binding_id, entity_type, v1_id, v2_id, v1_payload_hash, v2_expected_hash, last_synced_at
                    ) VALUES (
                        @bindingId, @entityType, @v1Id, @v2Id, @v1Hash, @v2Hash, now()
                    )
                    ON CONFLICT (binding_id, entity_type, v1_id)
                    DO UPDATE SET v2_id = EXCLUDED.v2_id,
                                  v1_payload_hash = EXCLUDED.v1_payload_hash,
                                  v2_expected_hash = EXCLUDED.v2_expected_hash,
                                  last_synced_at = now()
                    """;
                await using var hashCmd = new NpgsqlCommand(hashUpsertSql, conn, tx);
                hashCmd.Parameters.AddWithValue("bindingId", rec.BindingId);
                hashCmd.Parameters.AddWithValue("entityType", rec.EntityType);
                hashCmd.Parameters.AddWithValue("v1Id", rec.V1Id);
                hashCmd.Parameters.AddWithValue("v2Id", rec.V2Id);
                hashCmd.Parameters.AddWithValue("v1Hash", updateV1Hash);
                hashCmd.Parameters.AddWithValue("v2Hash", updateV2ExpectedHash);
                await hashCmd.ExecuteNonQueryAsync(ct);
            }
        }

        await tx.CommitAsync(ct);
        await AppendAuditAsync(rec.BindingId, "CONFLICT_RESOLVED", actor, new { conflictId, nextStatus, rec.EntityType, rec.V1Id }, ct);
        return rec;
    }

    public Task<SyncConflictRecord?> ResolveConflictAsync(Guid conflictId, string resolution, string actor, CancellationToken ct = default)
    {
        var nextStatus = resolution.Trim().ToUpperInvariant() switch
        {
            "FORCE_V1" => SyncConflictStatus.ResolvedForceV1,
            "IGNORE" => SyncConflictStatus.ResolvedIgnore,
            _ => SyncConflictStatus.ResolvedKeepV2
        };
        return ResolveConflictStatusAsync(conflictId, nextStatus, actor, ct: ct);
    }

    private static SyncChangeDiffRecord ReadDiff(NpgsqlDataReader r)
    {
        var fields = JsonSerializer.Deserialize<List<string>>(r.GetString(7), JsonOpts) ?? new List<string>();
        return new SyncChangeDiffRecord(
            r.GetInt64(0),
            r.GetGuid(1),
            r.GetGuid(2),
            r.GetString(3),
            r.GetString(4),
            r.IsDBNull(5) ? null : r.GetGuid(5),
            r.GetString(6),
            fields,
            r.GetFieldValue<DateTimeOffset>(8));
    }

    private static SyncConflictRecord ReadConflict(NpgsqlDataReader r)
    {
        var fields = JsonSerializer.Deserialize<List<string>>(r.GetString(7), JsonOpts) ?? new List<string>();
        return new SyncConflictRecord(
            r.GetGuid(0),
            r.GetGuid(1),
            r.IsDBNull(2) ? null : r.GetGuid(2),
            r.GetString(3),
            r.GetString(4),
            r.GetGuid(5),
            r.GetString(6),
            fields,
            r.GetString(8),
            r.IsDBNull(9) ? null : r.GetString(9),
            r.IsDBNull(10) ? null : r.GetFieldValue<DateTimeOffset>(10),
            r.GetFieldValue<DateTimeOffset>(11));
    }

    public async Task<int> CountOpenConflictsAsync(Guid? bindingId = null, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT COUNT(*) FROM sync_conflicts
            WHERE status = 'OPEN'
              AND (@bindingId IS NULL OR binding_id = @bindingId)
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.Add(new NpgsqlParameter("bindingId", NpgsqlDbType.Uuid) { Value = (object?)bindingId ?? DBNull.Value });
        return Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
    }

    public async Task AppendAuditAsync(Guid? bindingId, string action, string actor, object details, CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            INSERT INTO sync_audit_logs (binding_id, action, actor, details_json)
            VALUES (@bindingId, @action, @actor, @details::jsonb)
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.Add(new NpgsqlParameter("bindingId", NpgsqlDbType.Uuid) { Value = (object?)bindingId ?? DBNull.Value });
        cmd.Parameters.AddWithValue("action", action);
        cmd.Parameters.AddWithValue("actor", actor);
        cmd.Parameters.AddWithValue("details", JsonSerializer.Serialize(details, JsonOpts));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task UpsertStorageObjectsBatchAsync(
        IReadOnlyList<SyncStorageObjectUpsert> items,
        CancellationToken ct = default)
    {
        if (items.Count == 0) return;

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await using var batch = new NpgsqlBatch(conn, tx);

        const string sql = """
            INSERT INTO sync_storage_objects (
                binding_id, target_plane, target_entity_id, owner_id, tenant_id,
                source_provider, source_url, source_size_bytes,
                source_content_type, source_content_type_captured,
                source_sha256, target_bucket, target_r2_key,
                encrypted_size_bytes, encrypted_sha256, encryption_key_scheme,
                status, attempt_count, last_error_code, last_error_message,
                migrated_at, verified_at, updated_at
            ) VALUES (
                @bindingId, @targetPlane, @targetEntityId, @ownerId, @tenantId,
                @sourceProvider, @sourceUrl, @sourceSizeBytes,
                @sourceContentType, @sourceContentTypeCaptured,
                @sourceSha256, @targetBucket, @targetR2Key,
                @encryptedSizeBytes, @encryptedSha256, @encryptionKeyScheme,
                @status, @attemptDelta, @lastErrorCode, @lastErrorMessage,
                @migratedAt, @verifiedAt, now()
            )
            ON CONFLICT (binding_id, target_plane, target_entity_id) DO UPDATE SET
                owner_id = EXCLUDED.owner_id,
                tenant_id = COALESCE(EXCLUDED.tenant_id, sync_storage_objects.tenant_id),
                source_provider = EXCLUDED.source_provider,
                source_url = CASE
                    WHEN sync_storage_objects.status IN ('MIGRATED', 'VERIFIED') THEN sync_storage_objects.source_url
                    ELSE EXCLUDED.source_url
                END,
                source_size_bytes = CASE
                    WHEN sync_storage_objects.status IN ('MIGRATED', 'VERIFIED') THEN sync_storage_objects.source_size_bytes
                    ELSE EXCLUDED.source_size_bytes
                END,
                source_content_type = CASE
                    WHEN sync_storage_objects.source_content_type_captured THEN sync_storage_objects.source_content_type
                    WHEN EXCLUDED.source_content_type_captured THEN EXCLUDED.source_content_type
                    ELSE sync_storage_objects.source_content_type
                END,
                source_content_type_captured = sync_storage_objects.source_content_type_captured OR EXCLUDED.source_content_type_captured,
                source_sha256 = COALESCE(EXCLUDED.source_sha256, sync_storage_objects.source_sha256),
                target_bucket = COALESCE(EXCLUDED.target_bucket, sync_storage_objects.target_bucket),
                target_r2_key = COALESCE(EXCLUDED.target_r2_key, sync_storage_objects.target_r2_key),
                encrypted_size_bytes = COALESCE(EXCLUDED.encrypted_size_bytes, sync_storage_objects.encrypted_size_bytes),
                encrypted_sha256 = COALESCE(EXCLUDED.encrypted_sha256, sync_storage_objects.encrypted_sha256),
                encryption_key_scheme = COALESCE(EXCLUDED.encryption_key_scheme, sync_storage_objects.encryption_key_scheme),
                status = EXCLUDED.status,
                attempt_count = sync_storage_objects.attempt_count + EXCLUDED.attempt_count,
                last_error_code = EXCLUDED.last_error_code,
                last_error_message = EXCLUDED.last_error_message,
                migrated_at = COALESCE(EXCLUDED.migrated_at, sync_storage_objects.migrated_at),
                verified_at = COALESCE(EXCLUDED.verified_at, sync_storage_objects.verified_at),
                updated_at = now()
            """;

        foreach (var item in items)
        {
            var cmd = new NpgsqlBatchCommand(sql);
            cmd.Parameters.AddWithValue("bindingId", item.BindingId);
            cmd.Parameters.AddWithValue("targetPlane", item.TargetPlane);
            cmd.Parameters.AddWithValue("targetEntityId", item.TargetEntityId);
            cmd.Parameters.AddWithValue("ownerId", item.OwnerId);
            cmd.Parameters.Add(new NpgsqlParameter("tenantId", NpgsqlDbType.Text) { Value = (object?)item.TenantId ?? DBNull.Value });
            cmd.Parameters.AddWithValue("sourceProvider", item.SourceProvider);
            cmd.Parameters.AddWithValue("sourceUrl", item.SourceUrl);
            cmd.Parameters.AddWithValue("sourceSizeBytes", item.SourceSizeBytes);
            cmd.Parameters.Add(new NpgsqlParameter("sourceContentType", NpgsqlDbType.Text) { Value = (object?)item.SourceContentType ?? DBNull.Value });
            cmd.Parameters.AddWithValue("sourceContentTypeCaptured", item.SourceContentTypeCaptured);
            cmd.Parameters.Add(new NpgsqlParameter("sourceSha256", NpgsqlDbType.Text) { Value = (object?)item.SourceSha256 ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("targetBucket", NpgsqlDbType.Text) { Value = (object?)item.TargetBucket ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("targetR2Key", NpgsqlDbType.Text) { Value = (object?)item.TargetR2Key ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("encryptedSizeBytes", NpgsqlDbType.Bigint) { Value = (object?)item.EncryptedSizeBytes ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("encryptedSha256", NpgsqlDbType.Text) { Value = (object?)item.EncryptedSha256 ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("encryptionKeyScheme", NpgsqlDbType.Text) { Value = (object?)item.EncryptionKeyScheme ?? DBNull.Value });
            cmd.Parameters.AddWithValue("status", item.Status);
            cmd.Parameters.AddWithValue("attemptDelta", Math.Max(0, item.AttemptDelta));
            cmd.Parameters.Add(new NpgsqlParameter("lastErrorCode", NpgsqlDbType.Text) { Value = (object?)item.LastErrorCode ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("lastErrorMessage", NpgsqlDbType.Text) { Value = (object?)item.LastErrorMessage ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("migratedAt", NpgsqlDbType.TimestampTz) { Value = (object?)item.MigratedAt ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("verifiedAt", NpgsqlDbType.TimestampTz) { Value = (object?)item.VerifiedAt ?? DBNull.Value });
            batch.BatchCommands.Add(cmd);
        }

        await batch.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<Dictionary<(string TargetPlane, Guid TargetEntityId), SyncStorageObjectState>> LoadStorageObjectStatesAsync(
        Guid bindingId,
        CancellationToken ct = default)
    {
        var map = new Dictionary<(string, Guid), SyncStorageObjectState>();
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT target_plane, target_entity_id, source_provider, source_url, source_size_bytes,
                   source_content_type, source_content_type_captured, source_sha256,
                   target_bucket, target_r2_key, encrypted_size_bytes, encryption_key_scheme, status
            FROM sync_storage_objects
            WHERE binding_id = @bindingId
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var plane = r.GetString(0);
            var entityId = r.GetGuid(1);
            map[(plane, entityId)] = new SyncStorageObjectState(
                TargetPlane: plane,
                TargetEntityId: entityId,
                SourceProvider: r.GetString(2),
                SourceUrl: r.GetString(3),
                SourceSizeBytes: r.GetInt64(4),
                SourceContentType: r.IsDBNull(5) ? null : r.GetString(5),
                SourceContentTypeCaptured: r.GetBoolean(6),
                SourceSha256: r.IsDBNull(7) ? null : r.GetString(7),
                TargetBucket: r.IsDBNull(8) ? null : r.GetString(8),
                TargetR2Key: r.IsDBNull(9) ? null : r.GetString(9),
                EncryptedSizeBytes: r.IsDBNull(10) ? null : r.GetInt64(10),
                EncryptionKeyScheme: r.IsDBNull(11) ? null : r.GetString(11),
                Status: r.GetString(12)
            );
        }
        return map;
    }

    public async Task<StorageObjectsResponse> ListStorageObjectsAsync(
        Guid bindingId,
        string? statusFilter,
        string? providerFilter,
        string? planeFilter,
        int limit = 50,
        int offset = 0,
        CancellationToken ct = default)
    {
        var clampedLimit = Math.Clamp(limit, 1, 200);
        var clampedOffset = Math.Max(0, offset);

        string[]? statuses = null;
        if (!string.IsNullOrWhiteSpace(statusFilter))
        {
            var trimmed = statusFilter.Trim().ToUpperInvariant();
            if (trimmed == "ATTENTION")
            {
                statuses =
                [
                    SyncStorageStatus.SkippedDeadLink,
                    SyncStorageStatus.SkippedEmptyBlob,
                    SyncStorageStatus.SkippedAuthRequired,
                    SyncStorageStatus.SkippedLegacyUnsupported,
                    SyncStorageStatus.FailedRetryable,
                    SyncStorageStatus.FailedPermanent
                ];
            }
            else if (trimmed != "ALL")
            {
                var parsed = trimmed
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Where(s => s.Length > 0)
                    .Distinct(StringComparer.Ordinal)
                    .ToArray();
                if (parsed.Length > 0)
                {
                    statuses = parsed;
                }
            }
        }

        string[]? providers = null;
        if (!string.IsNullOrWhiteSpace(providerFilter))
        {
            var trimmed = providerFilter.Trim().ToUpperInvariant();
            if (trimmed != "ALL")
            {
                var list = new List<string>();
                foreach (var p in trimmed.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (p == "AZURE_BLOB")
                    {
                        list.Add(SyncStorageProvider.AzureBlob1);
                        list.Add(SyncStorageProvider.AzureBlob2);
                    }
                    else
                    {
                        list.Add(p);
                    }
                }
                if (list.Count > 0)
                {
                    providers = list.Distinct(StringComparer.Ordinal).ToArray();
                }
            }
        }

        string[]? normalizedPlanes = null;
        if (!string.IsNullOrWhiteSpace(planeFilter))
        {
            var trimmed = planeFilter.Trim().ToUpperInvariant();
            normalizedPlanes = trimmed switch
            {
                "ALL" or "BOTH" => null,
                "CLINIC" or "CLINIC_ONLY" => new[] { SyncStoragePlane.ClinicAttachment, SyncStoragePlane.ClinicPatientAvatar },
                "PATIENT" or "PATIENT_ONLY" => new[] { SyncStoragePlane.PatientFile, SyncStoragePlane.PatientAvatar },
                SyncStoragePlane.ClinicAttachment => new[] { SyncStoragePlane.ClinicAttachment },
                SyncStoragePlane.ClinicPatientAvatar => new[] { SyncStoragePlane.ClinicPatientAvatar },
                SyncStoragePlane.PatientFile => new[] { SyncStoragePlane.PatientFile },
                SyncStoragePlane.PatientAvatar => new[] { SyncStoragePlane.PatientAvatar },
                _ => new[] { trimmed }
            };
        }

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);

        const string whereClause = """
            WHERE binding_id = @bindingId
              AND (@statuses IS NULL OR status = ANY(@statuses))
              AND (@providers IS NULL OR source_provider = ANY(@providers))
              AND (@planes IS NULL OR target_plane = ANY(@planes))
            """;

        long totalCount;
        await using (var countCmd = new NpgsqlCommand($"SELECT COUNT(*) FROM sync_storage_objects {whereClause}", conn))
        {
            countCmd.Parameters.AddWithValue("bindingId", bindingId);
            countCmd.Parameters.Add(new NpgsqlParameter("statuses", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)statuses ?? DBNull.Value });
            countCmd.Parameters.Add(new NpgsqlParameter("providers", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)providers ?? DBNull.Value });
            countCmd.Parameters.Add(new NpgsqlParameter("planes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)normalizedPlanes ?? DBNull.Value });
            totalCount = Convert.ToInt64(await countCmd.ExecuteScalarAsync(ct));
        }

        // Strict zero-PHI projection: never select source_url, target_r2_key, source_sha256, or encrypted_sha256
        var items = new List<SyncStorageObjectDto>();
        var selectSql = $"""
            SELECT target_plane, target_entity_id, owner_id, tenant_id, source_provider,
                   status, source_size_bytes, COALESCE(encrypted_size_bytes, 0), attempt_count,
                   last_error_code, last_error_message, migrated_at, verified_at, updated_at
            FROM sync_storage_objects
            {whereClause}
            ORDER BY updated_at DESC, target_entity_id ASC
            LIMIT @limit OFFSET @offset
            """;

        await using (var cmd = new NpgsqlCommand(selectSql, conn))
        {
            cmd.Parameters.AddWithValue("bindingId", bindingId);
            cmd.Parameters.Add(new NpgsqlParameter("statuses", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)statuses ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("providers", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)providers ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("planes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)normalizedPlanes ?? DBNull.Value });
            cmd.Parameters.AddWithValue("limit", clampedLimit);
            cmd.Parameters.AddWithValue("offset", clampedOffset);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                items.Add(new SyncStorageObjectDto(
                    TargetPlane: r.GetString(0),
                    TargetEntityId: r.GetGuid(1),
                    OwnerId: r.GetGuid(2),
                    TenantId: r.IsDBNull(3) ? null : r.GetString(3),
                    SourceProvider: r.GetString(4),
                    Status: r.GetString(5),
                    SourceSizeBytes: r.GetInt64(6),
                    EncryptedSizeBytes: r.GetInt64(7),
                    AttemptCount: r.GetInt32(8),
                    LastErrorCode: r.IsDBNull(9) ? null : r.GetString(9),
                    LastErrorMessage: r.IsDBNull(10) ? null : r.GetString(10),
                    MigratedAt: r.IsDBNull(11) ? null : r.GetFieldValue<DateTimeOffset>(11),
                    VerifiedAt: r.IsDBNull(12) ? null : r.GetFieldValue<DateTimeOffset>(12),
                    UpdatedAt: r.GetFieldValue<DateTimeOffset>(13)
                ));
            }
        }

        long failedRetryableCount;
        await using (var retryCountCmd = new NpgsqlCommand(
            """
            SELECT COUNT(*)
            FROM sync_storage_objects
            WHERE binding_id = @bindingId
              AND status = 'FAILED_RETRYABLE'
              AND (@providers IS NULL OR source_provider = ANY(@providers))
              AND (@planes IS NULL OR target_plane = ANY(@planes))
            """, conn))
        {
            retryCountCmd.Parameters.AddWithValue("bindingId", bindingId);
            retryCountCmd.Parameters.Add(new NpgsqlParameter("providers", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)providers ?? DBNull.Value });
            retryCountCmd.Parameters.Add(new NpgsqlParameter("planes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)normalizedPlanes ?? DBNull.Value });
            failedRetryableCount = Convert.ToInt64(await retryCountCmd.ExecuteScalarAsync(ct));
        }

        return new StorageObjectsResponse(bindingId, totalCount, items, failedRetryableCount);
    }

    public async Task<long> CountPendingWithTargetR2KeyAsync(
        Guid bindingId,
        CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT COUNT(*)
            FROM sync_storage_objects
            WHERE binding_id = @bindingId
              AND status = 'PENDING'
              AND target_r2_key IS NOT NULL
              AND btrim(target_r2_key) <> ''
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
    }

    public async Task<int> RequeueFailedStorageObjectsAsync(
        Guid bindingId,
        bool includeAuthSkipped,
        CancellationToken ct = default) =>
        await RequeueFailedStorageObjectsAsync(bindingId, includeAuthSkipped, targetPlaneFilter: null, providerFilter: null, ct);

    public async Task<int> RequeueFailedStorageObjectsAsync(
        Guid bindingId,
        bool includeAuthSkipped,
        string? targetPlaneFilter,
        string? providerFilter,
        CancellationToken ct = default)
    {
        string[]? normalizedPlanes = null;
        if (!string.IsNullOrWhiteSpace(targetPlaneFilter))
        {
            var trimmed = targetPlaneFilter.Trim().ToUpperInvariant();
            normalizedPlanes = trimmed switch
            {
                "CLINIC_ONLY" or "CLINIC" => new[] { SyncStoragePlane.ClinicAttachment, SyncStoragePlane.ClinicPatientAvatar },
                "PATIENT_ONLY" or "PATIENT" => new[] { SyncStoragePlane.PatientFile, SyncStoragePlane.PatientAvatar },
                SyncStoragePlane.ClinicAttachment => new[] { SyncStoragePlane.ClinicAttachment },
                SyncStoragePlane.ClinicPatientAvatar => new[] { SyncStoragePlane.ClinicPatientAvatar },
                SyncStoragePlane.PatientFile => new[] { SyncStoragePlane.PatientFile },
                SyncStoragePlane.PatientAvatar => new[] { SyncStoragePlane.PatientAvatar },
                _ => null
            };
        }

        string? normalizedProvider = null;
        if (!string.IsNullOrWhiteSpace(providerFilter))
        {
            var trimmed = providerFilter.Trim().ToUpperInvariant();
            normalizedProvider = trimmed switch
            {
                "AZURE_BLOB_1" or "AZURE_BLOB" => SyncStorageProvider.AzureBlob1,
                "VERCEL_BLOB" => SyncStorageProvider.VercelBlob,
                _ => null
            };
        }

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            UPDATE sync_storage_objects
            SET status = CASE
                    WHEN status = 'FAILED_RETRYABLE'
                     AND target_r2_key IS NOT NULL
                     AND btrim(target_r2_key) <> ''
                    THEN 'MIGRATED'
                    ELSE 'PENDING'
                END,
                verified_at = CASE
                    WHEN status = 'FAILED_RETRYABLE'
                     AND target_r2_key IS NOT NULL
                     AND btrim(target_r2_key) <> ''
                    THEN NULL
                    ELSE verified_at
                END,
                last_error_code = NULL,
                last_error_message = NULL,
                updated_at = now()
            WHERE binding_id = @bindingId
              AND (@planes IS NULL OR target_plane = ANY(@planes))
              AND (@provider IS NULL OR source_provider = @provider)
              AND (
                  status = 'FAILED_RETRYABLE'
                  OR (@includeAuth = TRUE AND status = 'SKIPPED_AUTH_REQUIRED')
              )
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        cmd.Parameters.AddWithValue("includeAuth", includeAuthSkipped);
        cmd.Parameters.Add(new NpgsqlParameter("planes", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = (object?)normalizedPlanes ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("provider", NpgsqlDbType.Text) { Value = (object?)normalizedProvider ?? DBNull.Value });
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<Dictionary<Guid, MigratedStorageSource>> LoadMigratedSourceInfoByPlaneAsync(
        string targetPlane,
        IReadOnlyCollection<Guid> targetEntityIds,
        CancellationToken ct = default)
    {
        var map = new Dictionary<Guid, MigratedStorageSource>();
        if (targetEntityIds.Count == 0) return map;

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT DISTINCT ON (target_entity_id)
                   target_entity_id, source_url, source_size_bytes,
                   source_content_type, source_content_type_captured
            FROM sync_storage_objects
            WHERE target_plane = @plane
              AND target_entity_id = ANY(@ids)
              AND (
                  status IN ('MIGRATED', 'VERIFIED')
                  OR (target_r2_key IS NOT NULL AND btrim(target_r2_key) <> '')
              )
            ORDER BY target_entity_id, updated_at DESC
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("plane", targetPlane);
        cmd.Parameters.AddWithValue("ids", targetEntityIds.ToArray());
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            map[r.GetGuid(0)] = new MigratedStorageSource(
                SourceUrl: r.GetString(1),
                SourceSizeBytes: r.GetInt64(2),
                SourceContentType: r.IsDBNull(3) ? null : r.GetString(3),
                SourceContentTypeCaptured: r.GetBoolean(4)
            );
        }
        return map;
    }

    public async Task RefreshMigratedSourceBaselineAsync(
        string targetPlane,
        IReadOnlyList<MigratedStorageBaselineUpdate> updates,
        CancellationToken ct = default)
    {
        if (updates.Count == 0) return;

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await using var batch = new NpgsqlBatch(conn, tx);

        var isPatientPlane = string.Equals(targetPlane, SyncStoragePlane.PatientFile, StringComparison.Ordinal);
        var sql = isPatientPlane
            ? """
              UPDATE sync_storage_objects
              SET source_url = @sourceUrl,
                  source_content_type = @sourceContentType,
                  source_content_type_captured = TRUE,
                  source_size_bytes = @sourceSizeBytes,
                  updated_at = now()
              WHERE target_plane = @plane
                AND target_entity_id = @entityId
                AND (
                    status IN ('MIGRATED', 'VERIFIED')
                    OR (target_r2_key IS NOT NULL AND btrim(target_r2_key) <> '')
                )
              """
            : """
              UPDATE sync_storage_objects
              SET source_url = @sourceUrl,
                  source_content_type = @sourceContentType,
                  source_content_type_captured = TRUE,
                  updated_at = now()
              WHERE target_plane = @plane
                AND target_entity_id = @entityId
                AND (
                    status IN ('MIGRATED', 'VERIFIED')
                    OR (target_r2_key IS NOT NULL AND btrim(target_r2_key) <> '')
                )
              """;

        foreach (var item in updates)
        {
            var cmd = new NpgsqlBatchCommand(sql);
            cmd.Parameters.AddWithValue("plane", targetPlane);
            cmd.Parameters.AddWithValue("entityId", item.TargetEntityId);
            cmd.Parameters.AddWithValue("sourceUrl", item.SourceUrl);
            cmd.Parameters.Add(new NpgsqlParameter("sourceContentType", NpgsqlDbType.Text) { Value = (object?)item.SourceContentType ?? DBNull.Value });
            if (isPatientPlane)
            {
                cmd.Parameters.AddWithValue("sourceSizeBytes", item.SourceSizeBytes);
            }
            batch.BatchCommands.Add(cmd);
        }

        await batch.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<Dictionary<(string Status, string Provider), long>> GetStorageObjectCountsByStatusAndProviderAsync(
        Guid bindingId,
        CancellationToken ct = default)
    {
        var counts = new Dictionary<(string, string), long>();
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT status, source_provider, COUNT(*)
            FROM sync_storage_objects
            WHERE binding_id = @bindingId
            GROUP BY status, source_provider
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("bindingId", bindingId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            counts[(r.GetString(0), r.GetString(1))] = r.GetInt64(2);
        }
        return counts;
    }

    public async Task<List<Guid>> GetScopedPatientV2IdsForBindingCoordsAsync(
        int? v1ClinicId,
        int? v1OrgId,
        Guid? v2ClinicId,
        CancellationToken ct = default)
    {
        var ids = new List<Guid>();
        if (!v1ClinicId.HasValue && !v1OrgId.HasValue && !v2ClinicId.HasValue)
        {
            return ids;
        }

        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT DISTINCT m.v2_id
            FROM sync_id_map m
            JOIN sync_bindings b ON b.id = m.binding_id
            WHERE b.track = 'TRACK2_PATIENT'
              AND m.entity_type = 'PatientAccount'
              AND (
                  (@v2Cid IS NOT NULL AND b.v2_clinic_id = @v2Cid)
                  OR (
                      @v1Cid IS NOT NULL
                      AND b.v1_clinic_id = @v1Cid
                      AND (@v1Oid IS NULL OR b.v1_org_id IS NOT DISTINCT FROM @v1Oid)
                  )
              )
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.Add(new NpgsqlParameter("v2Cid", NpgsqlDbType.Uuid) { Value = (object?)v2ClinicId ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("v1Cid", NpgsqlDbType.Integer) { Value = (object?)v1ClinicId ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("v1Oid", NpgsqlDbType.Integer) { Value = (object?)v1OrgId ?? DBNull.Value });
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            ids.Add(r.GetGuid(0));
        }
        return ids;
    }

    public async Task<(Guid[] ClinicIds, Guid[] PatientIds, Guid[] ClinicAvatarIds, Guid[] PatientAvatarIds)> LoadGloballySkippedStorageEntityIdsAsync(
        CancellationToken ct = default)
    {
        var clinicIds = new List<Guid>();
        var patientIds = new List<Guid>();
        var clinicAvatarIds = new List<Guid>();
        var patientAvatarIds = new List<Guid>();

        try
        {
            await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
            const string sql = """
                SELECT target_plane, target_entity_id
                FROM sync_storage_objects
                WHERE status IN (
                    'SKIPPED_DEAD_LINK',
                    'SKIPPED_EMPTY_BLOB',
                    'SKIPPED_AUTH_REQUIRED',
                    'SKIPPED_LEGACY_UNSUPPORTED',
                    'FAILED_PERMANENT'
                )
                GROUP BY target_plane, target_entity_id
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var plane = r.GetString(0);
                var entityId = r.GetGuid(1);
                if (string.Equals(plane, SyncStoragePlane.ClinicAttachment, StringComparison.Ordinal))
                {
                    clinicIds.Add(entityId);
                }
                else if (string.Equals(plane, SyncStoragePlane.PatientFile, StringComparison.Ordinal))
                {
                    patientIds.Add(entityId);
                }
                else if (string.Equals(plane, SyncStoragePlane.ClinicPatientAvatar, StringComparison.Ordinal))
                {
                    clinicAvatarIds.Add(entityId);
                }
                else if (string.Equals(plane, SyncStoragePlane.PatientAvatar, StringComparison.Ordinal))
                {
                    patientAvatarIds.Add(entityId);
                }
            }
        }
        catch (PostgresException ex) when (ex.SqlState == "42P01")
        {
            // sync_storage_objects table not yet created
        }

        return (clinicIds.ToArray(), patientIds.ToArray(), clinicAvatarIds.ToArray(), patientAvatarIds.ToArray());
    }

    public async Task<SyncRuntimeSettings?> GetRuntimeSettingsAsync(CancellationToken ct = default)
    {
        await using var conn = await _connections.OpenSyncLedgerDbAsync(ct);
        const string sql = """
            SELECT environment_label,
                   max_pool_size,
                   default_batch_size,
                   enable_background_worker,
                   default_poll_interval_seconds,
                   overnight_poll_interval_seconds,
                   overnight_backoff_start_hour_ph,
                   overnight_backoff_end_hour_ph,
                   storage_enabled,
                   storage_max_concurrency,
                   storage_max_file_size_bytes,
                   storage_verification_sample_rate,
                   azure_blob1_enabled,
                   updated_by,
                   updated_at
            FROM sync_runtime_settings
            WHERE id = 1
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct))
        {
            return null;
        }

        return new SyncRuntimeSettings(
            EnvironmentLabel: r.GetString(0),
            MaxPoolSize: r.GetInt32(1),
            DefaultBatchSize: r.GetInt32(2),
            EnableBackgroundWorker: r.GetBoolean(3),
            DefaultPollIntervalSeconds: r.GetInt32(4),
            OvernightPollIntervalSeconds: r.GetInt32(5),
            OvernightBackoffStartHourPh: r.GetInt32(6),
            OvernightBackoffEndHourPh: r.GetInt32(7),
            StorageEnabled: r.GetBoolean(8),
            StorageMaxConcurrency: r.GetInt32(9),
            StorageMaxFileSizeBytes: r.GetInt64(10),
            StorageVerificationSampleRate: r.GetDouble(11),
            AzureBlob1Enabled: r.GetBoolean(12),
            UpdatedBy: r.IsDBNull(13) ? null : r.GetString(13),
            UpdatedAt: r.GetFieldValue<DateTimeOffset>(14)
        );
    }

    public async Task<SyncRuntimeSettings> UpsertRuntimeSettingsAsync(
        SyncRuntimeSettings settings,
        string actor,
        CancellationToken ct = default,
        bool writeAudit = true)
    {
        await using (var conn = await _connections.OpenSyncLedgerDbAsync(ct))
        {
            const string sql = """
                INSERT INTO sync_runtime_settings (
                    id,
                    environment_label,
                    max_pool_size,
                    default_batch_size,
                    enable_background_worker,
                    default_poll_interval_seconds,
                    overnight_poll_interval_seconds,
                    overnight_backoff_start_hour_ph,
                    overnight_backoff_end_hour_ph,
                    storage_enabled,
                    storage_max_concurrency,
                    storage_max_file_size_bytes,
                    storage_verification_sample_rate,
                    azure_blob1_enabled,
                    updated_by,
                    updated_at
                )
                VALUES (
                    1,
                    @envLabel,
                    @maxPoolSize,
                    @defaultBatchSize,
                    @enableWorker,
                    @defaultPoll,
                    @overnightPoll,
                    @startHour,
                    @endHour,
                    @storageEnabled,
                    @storageConcurrency,
                    @storageMaxFileBytes,
                    @storageVerifyRate,
                    @azureBlob1Enabled,
                    @updatedBy,
                    now()
                )
                ON CONFLICT (id) DO UPDATE SET
                    environment_label = EXCLUDED.environment_label,
                    max_pool_size = EXCLUDED.max_pool_size,
                    default_batch_size = EXCLUDED.default_batch_size,
                    enable_background_worker = EXCLUDED.enable_background_worker,
                    default_poll_interval_seconds = EXCLUDED.default_poll_interval_seconds,
                    overnight_poll_interval_seconds = EXCLUDED.overnight_poll_interval_seconds,
                    overnight_backoff_start_hour_ph = EXCLUDED.overnight_backoff_start_hour_ph,
                    overnight_backoff_end_hour_ph = EXCLUDED.overnight_backoff_end_hour_ph,
                    storage_enabled = EXCLUDED.storage_enabled,
                    storage_max_concurrency = EXCLUDED.storage_max_concurrency,
                    storage_max_file_size_bytes = EXCLUDED.storage_max_file_size_bytes,
                    storage_verification_sample_rate = EXCLUDED.storage_verification_sample_rate,
                    azure_blob1_enabled = EXCLUDED.azure_blob1_enabled,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = now()
                """;
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("envLabel", settings.EnvironmentLabel);
            cmd.Parameters.AddWithValue("maxPoolSize", settings.MaxPoolSize);
            cmd.Parameters.AddWithValue("defaultBatchSize", settings.DefaultBatchSize);
            cmd.Parameters.AddWithValue("enableWorker", settings.EnableBackgroundWorker);
            cmd.Parameters.AddWithValue("defaultPoll", settings.DefaultPollIntervalSeconds);
            cmd.Parameters.AddWithValue("overnightPoll", settings.OvernightPollIntervalSeconds);
            cmd.Parameters.AddWithValue("startHour", settings.OvernightBackoffStartHourPh);
            cmd.Parameters.AddWithValue("endHour", settings.OvernightBackoffEndHourPh);
            cmd.Parameters.AddWithValue("storageEnabled", settings.StorageEnabled);
            cmd.Parameters.AddWithValue("storageConcurrency", settings.StorageMaxConcurrency);
            cmd.Parameters.AddWithValue("storageMaxFileBytes", settings.StorageMaxFileSizeBytes);
            cmd.Parameters.AddWithValue("storageVerifyRate", settings.StorageVerificationSampleRate);
            cmd.Parameters.AddWithValue("azureBlob1Enabled", settings.AzureBlob1Enabled);
            cmd.Parameters.Add(new NpgsqlParameter("updatedBy", NpgsqlDbType.Text) { Value = (object?)actor ?? DBNull.Value });
            await cmd.ExecuteNonQueryAsync(ct);
        }

        if (writeAudit)
        {
            await AppendAuditAsync(null, "RUNTIME_SETTINGS_UPDATED", actor ?? "platform-admin", new
            {
                settings.EnvironmentLabel,
                settings.MaxPoolSize,
                settings.DefaultBatchSize,
                settings.EnableBackgroundWorker,
                settings.DefaultPollIntervalSeconds,
                settings.OvernightPollIntervalSeconds,
                settings.OvernightBackoffStartHourPh,
                settings.OvernightBackoffEndHourPh,
                settings.StorageEnabled,
                settings.StorageMaxConcurrency,
                settings.StorageMaxFileSizeBytes,
                settings.StorageVerificationSampleRate,
                settings.AzureBlob1Enabled
            }, ct);
        }

        return (await GetRuntimeSettingsAsync(ct))!;
    }

    private static SyncBinding ReadBinding(NpgsqlDataReader r) => new(
        Id: r.GetGuid(0),
        Track: r.GetString(1),
        Name: r.GetString(2),
        V1ClinicId: r.IsDBNull(3) ? null : r.GetInt32(3),
        V1OrgId: r.IsDBNull(4) ? null : r.GetInt32(4),
        V2TenantId: r.IsDBNull(5) ? null : r.GetString(5),
        V2ClinicId: r.IsDBNull(6) ? null : r.GetGuid(6),
        PatientCohortMode: r.GetString(7),
        AutoSyncEnabled: r.GetBoolean(8),
        PollIntervalSeconds: r.GetInt32(9),
        IsFrozen: r.GetBoolean(10),
        FrozenAt: r.IsDBNull(11) ? null : r.GetFieldValue<DateTimeOffset>(11),
        FrozenBy: r.IsDBNull(12) ? null : r.GetString(12),
        FreezeReason: r.IsDBNull(13) ? null : r.GetString(13),
        CreatedAt: r.GetFieldValue<DateTimeOffset>(14),
        UpdatedAt: r.GetFieldValue<DateTimeOffset>(15),
        LastChangelogSeq: r.GetInt64(16),
        LastPolledAt: r.IsDBNull(17) ? null : r.GetFieldValue<DateTimeOffset>(17),
        OpenConflictCount: Convert.ToInt32(r.GetInt64(18)),
        HasSyncHistory: r.FieldCount > 19 && !r.IsDBNull(19) && r.GetBoolean(19),
        BatchSize: r.FieldCount > 20 && !r.IsDBNull(20) ? r.GetInt32(20) : 200,
        HasCompletedPreview: r.FieldCount > 21 && !r.IsDBNull(21) && r.GetBoolean(21),
        HasCompletedMigration: r.FieldCount > 22 && !r.IsDBNull(22) && r.GetBoolean(22)
    );
}
