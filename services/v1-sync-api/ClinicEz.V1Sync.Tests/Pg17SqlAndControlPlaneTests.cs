using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using ClinicEz.V1Sync.Api.Services.Storage;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

public sealed class Pg17SqlAndControlPlaneTests : IClassFixture<Pg17TestFixture>
{
    private readonly Pg17TestFixture _fx;

    public Pg17SqlAndControlPlaneTests(Pg17TestFixture fx)
    {
        _fx = fx;
    }

    [Fact]
    public async Task SqlTriggerPack_IsIdempotent_CapturesNewPkKeysWithoutPhi_AndUninstallsCleanly()
    {
        var installSql = await File.ReadAllTextAsync(Path.Combine(Pg17TestFixture.SqlDirectory, "01_install_v1_sync_changelog.sql"));
        var uninstallSql = await File.ReadAllTextAsync(Path.Combine(Pg17TestFixture.SqlDirectory, "02_uninstall_v1_sync_changelog.sql"));

        // Install twice to verify idempotency
        await Pg17TestFixture.ExecuteSqlAsync(_fx.V1ConnectionString, installSql);
        await Pg17TestFixture.ExecuteSqlAsync(_fx.V1ConnectionString, installSql);

        await using var v1 = await _fx.Connections.OpenV1SourceAsync();

        // Verify previously missing triggers are installed
        var expectedTables = new[]
        {
            "AppointmentRouting", "AppointmentTag", "ConsultationDiagnosis",
            "ConsultationManagement", "Intervention", "PhysicalExamination",
            "PatientNcdQuestionnaire", "UserPreference", "ClinicReferralSlip", "DiagnosticRequest"
        };

        await using (var cmd = new NpgsqlCommand("""
            SELECT event_object_table
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
              AND trigger_name = 'trg_v1_sync_capture'
            """, v1))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            var triggered = new HashSet<string>(StringComparer.Ordinal);
            while (await r.ReadAsync()) triggered.Add(r.GetString(0));
            foreach (var t in expectedTables)
            {
                triggered.Should().Contain(t);
            }
        }

        // Insert synthetic PHI into User and child rows -> changelog must contain zero PHI
        const string syntheticFirst = "SynthFirstPhi991";
        const string syntheticLast = "SynthLastPhi992";
        const string syntheticEmail = "synth.phi.993@example.com";

        await using (var cmd = new NpgsqlCommand("""
            TRUNCATE _v1_sync.changelog RESTART IDENTITY;
            INSERT INTO public."User" (id, "firstName", "lastName", email)
            VALUES (9001, @fn, @ln, @em)
            ON CONFLICT (id) DO UPDATE SET "firstName" = EXCLUDED."firstName";

            INSERT INTO public."MedicineDispenseRecord" (id, "medicineId") VALUES (8101, 7101) ON CONFLICT DO NOTHING;
            INSERT INTO public."MedicationDrug" (id, "medicationId") VALUES (8102, 7102) ON CONFLICT DO NOTHING;
            INSERT INTO public."FileClinicShare" (id, "fileSettingId", "clinicId") VALUES (8103, 7103, 1) ON CONFLICT DO NOTHING;
            INSERT INTO public."FolderClinicShare" (id, "folderSettingId", "clinicId") VALUES (8104, 7104, 1) ON CONFLICT DO NOTHING;
            INSERT INTO public."OrgMemberRequirementFile" (id, "orgMemberId", "fileId") VALUES (8105, 7105, 7106) ON CONFLICT DO NOTHING;
            INSERT INTO public."ClinicLaboratoryRequestProcedure" (id, "clinicLaboratoryRequestId") VALUES (8106, 7107) ON CONFLICT DO NOTHING;
            INSERT INTO public."ClinicImagingRequestProcedure" (id, "clinicImagingRequestId") VALUES (8107, 7108) ON CONFLICT DO NOTHING;
            INSERT INTO public."ClinicHeartStationRequestProcedure" (id, "clinicHeartStationRequestId") VALUES (8108, 7109) ON CONFLICT DO NOTHING;
            INSERT INTO public."PhilHealthDependent" (id, "philHealthRecordId") VALUES (8109, 7110) ON CONFLICT DO NOTHING;
            """, v1))
        {
            cmd.Parameters.AddWithValue("fn", syntheticFirst);
            cmd.Parameters.AddWithValue("ln", syntheticLast);
            cmd.Parameters.AddWithValue("em", syntheticEmail);
            await cmd.ExecuteNonQueryAsync();
        }

        var logRows = new List<(string Table, string RowId, string PkJson)>();
        await using (var cmd = new NpgsqlCommand("SELECT table_name, row_id, pk_json::text FROM _v1_sync.changelog ORDER BY seq ASC", v1))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                logRows.Add((r.GetString(0), r.GetString(1), r.GetString(2)));
            }
        }

        logRows.Should().NotBeEmpty();
        var serializedAll = string.Join("\n", logRows.Select(x => $"{x.Table}:{x.RowId}:{x.PkJson}"));
        serializedAll.Should().NotContain(syntheticFirst);
        serializedAll.Should().NotContain(syntheticLast);
        serializedAll.Should().NotContain(syntheticEmail);

        serializedAll.Should().Contain("\"medicineId\": 7101");
        serializedAll.Should().Contain("\"medicationId\": 7102");
        serializedAll.Should().Contain("\"fileSettingId\": 7103");
        serializedAll.Should().Contain("\"folderSettingId\": 7104");
        serializedAll.Should().Contain("\"orgMemberId\": 7105");
        serializedAll.Should().Contain("\"clinicLaboratoryRequestId\": 7107");
        serializedAll.Should().Contain("\"clinicImagingRequestId\": 7108");
        serializedAll.Should().Contain("\"clinicHeartStationRequestId\": 7109");
        serializedAll.Should().Contain("\"philHealthRecordId\": 7110");

        // Uninstall twice to verify idempotency
        await Pg17TestFixture.ExecuteSqlAsync(_fx.V1ConnectionString, uninstallSql);
        await Pg17TestFixture.ExecuteSqlAsync(_fx.V1ConnectionString, uninstallSql);

        await using (var cmd = new NpgsqlCommand("""
            SELECT COUNT(*) FROM information_schema.triggers
            WHERE trigger_schema = 'public' AND trigger_name = 'trg_v1_sync_capture'
            """, v1))
        {
            Convert.ToInt64(await cmd.ExecuteScalarAsync()).Should().Be(0);
        }

        await using (var cmd = new NpgsqlCommand("""
            SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '_v1_sync'
            """, v1))
        {
            Convert.ToInt64(await cmd.ExecuteScalarAsync()).Should().Be(0);
        }
    }

    [Fact]
    public async Task ScopedCdcIdResolver_ResolvesPrescriptionPatientId_AppointmentRequesterConsult_DeletesAndHasMore()
    {
        var installSql = await File.ReadAllTextAsync(Path.Combine(Pg17TestFixture.SqlDirectory, "01_install_v1_sync_changelog.sql"));
        await Pg17TestFixture.ExecuteSqlAsync(_fx.V1ConnectionString, installSql);

        await using var v1 = await _fx.Connections.OpenV1SourceAsync();
        await using (var setup = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "firstName", "lastName") VALUES
                (101, 'Scoped', 'Patient'),
                (102, 'OtherClinic', 'Patient')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES
                (501, 10, 101),
                (502, 99, 102)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO public."Appointment" (id, "clinicId") VALUES (601, 10) ON CONFLICT DO NOTHING;
            INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId") VALUES (602, 601, 101) ON CONFLICT DO NOTHING;
            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId") VALUES (701, 10, NULL, 601) ON CONFLICT DO NOTHING;

            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId") VALUES (801, 10, 501, NULL) ON CONFLICT DO NOTHING;
            INSERT INTO public."Folder" (id, "userId") VALUES (901, 101) ON CONFLICT DO NOTHING;
            INSERT INTO public."File" (id, "folderId") VALUES (902, 901) ON CONFLICT DO NOTHING;
            INSERT INTO public."FileSetting" (id, "fileId") VALUES (903, 902) ON CONFLICT DO NOTHING;

            TRUNCATE _v1_sync.changelog RESTART IDENTITY;

            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId") VALUES (802, 10, 501, NULL);
            INSERT INTO public."ConsultationTicket" (id, "clinicId", "clinicPatientId", "appointmentId") VALUES (702, 10, NULL, 601);
            INSERT INTO public."FileClinicShare" (id, "fileSettingId", "clinicId") VALUES (904, 903, 10);
            INSERT INTO public."Prescription" (id, "clinicId", "patientId", "consultationTicketId") VALUES (803, 99, 502, NULL);
            DELETE FROM public."FileClinicShare" WHERE id = 904;
            """, v1))
        {
            await setup.ExecuteNonQueryAsync();
        }

        // Batch limit = 2 -> HasMore must be true
        var page1 = await _fx.CdcResolver.ResolveBatchAsync(v1, afterSeq: 0, v1ClinicId: 10, v1OrgId: null, isGlobal: false, batchLimit: 2);
        page1.HasMore.Should().BeTrue();
        page1.RawEventCount.Should().Be(2);
        page1.ScopedUserIds.Should().Contain(101);
        page1.ScopedUserIds.Should().NotContain(501);
        page1.ScopedUserIds.Should().NotContain(102);

        // Drain remainder
        var page2 = await _fx.CdcResolver.ResolveBatchAsync(v1, afterSeq: page1.MaxSeq, v1ClinicId: 10, v1OrgId: null, isGlobal: false, batchLimit: 5000);
        page2.HasMore.Should().BeFalse();
        page2.ScopedUserIds.Should().Contain(101);
        page2.ScopedUserIds.Should().NotContain(102);
        page2.DeletedEvents.Should().ContainSingle(d => d.TableName == "FileClinicShare" && d.RowId == "904");
    }

    [Fact]
    public async Task AdvisoryLock_And_ManualFreeze_CoordinateExclusiveAccess()
    {
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, "LockTestClinic", 10, null, "tenant-lock", Guid.NewGuid()),
            "test-admin");

        await using (var lock1 = await _fx.Ledger.TryAcquireBindingAdvisoryLockAsync(binding.Id))
        {
            lock1.Should().NotBeNull();

            var lock2 = await _fx.Ledger.TryAcquireBindingAdvisoryLockAsync(binding.Id);
            lock2.Should().BeNull("a second session cannot acquire the same advisory lock");
        }

        // After dispose, lock can be acquired again
        await using (var lock3 = await _fx.Ledger.TryAcquireBindingAdvisoryLockAsync(binding.Id))
        {
            lock3.Should().NotBeNull();
        }

        // Manual freeze via SyncCoordinator
        var frozen = await _fx.Coordinator.FreezeBindingAsync(binding.Id, "test-admin", "Decommissioned", CancellationToken.None);
        frozen.Should().NotBeNull();
        frozen!.IsFrozen.Should().BeTrue();
        frozen.AutoSyncEnabled.Should().BeFalse();

        // Subsequent write execution must be rejected
        Func<Task> act = () => _fx.Coordinator.ExecuteAsync(binding.Id, SyncRunMode.Incremental, null, false, "test-admin", CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task FailRunAsync_SanitizesPhiAndSucceedsUnderCancelledToken()
    {
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, "FailSanitizeClinic", 10, null, "tenant-fail", Guid.NewGuid()),
            "test-admin");

        var runId = await _fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 1, "test-admin");
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var pgEx = new PostgresException(
            messageText: "23505: duplicate email patient.phi.secret@example.com",
            severity: "ERROR",
            invariantSeverity: "ERROR",
            sqlState: "23505",
            detail: "Key (email)=(patient.phi.secret@example.com) already exists.",
            constraintName: "uq_test_email");

        await _fx.Ledger.FailRunAsync(runId, new SyncRunSummary { Track = SyncTrack.Track1Clinic, Mode = SyncRunMode.Incremental }, pgEx, cts.Token);

        var runs = await _fx.Ledger.ListRunsAsync(binding.Id, 5);
        var failed = runs.Should().ContainSingle(r => r.Id == runId).Subject;
        failed.Status.Should().Be(SyncRunStatus.Failed);
        failed.ErrorMessage.Should().Be("PostgresException (SqlState=23505, Constraint=uq_test_email)");
        failed.ErrorMessage.Should().NotContain("patient.phi.secret@example.com");
    }

    [Fact]
    public async Task ConflictResolution_KeepV2_ForceV1_Ignore_And_Pagination_WorkEndToEnd()
    {
        var v2ClinicId = Guid.NewGuid();
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, "ConflictTestClinic", 20, null, "tenant-conflict", v2ClinicId),
            "test-admin");

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "firstName", "lastName", email)
            VALUES (2001, 'InitialV1', 'TestUser', 'u2001@example.test'),
                   (2002, 'InitialV1Two', 'TestUserTwo', 'u2002@example.test')
            ON CONFLICT (id) DO UPDATE SET "firstName" = EXCLUDED."firstName";

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId")
            VALUES (2101, 20, 2001),
                   (2102, 20, 2002)
            ON CONFLICT (id) DO NOTHING;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        // Initial single-entity sync of 2001 & 2002
        var v2Pat1 = DeterministicUuid.ClinicPatientId(v2ClinicId, 2001);
        var v2Pat2 = DeterministicUuid.ClinicPatientId(v2ClinicId, 2002);
        await _fx.Track1.ForceSyncEntityAsync(binding, "Patient", "2001", v2Pat1, "seed", CancellationToken.None);
        await _fx.Track1.ForceSyncEntityAsync(binding, "Patient", "2002", v2Pat2, "seed", CancellationToken.None);

        // Simulate staff edit in v2 + update in v1
        await using (var v2 = await _fx.Connections.OpenClinicDbAsync())
        await using (var cmd = new NpgsqlCommand("""
            UPDATE public."Patients" SET "FirstName" = 'StaffV2Win' WHERE "Id" = @id1;
            UPDATE public."Patients" SET "FirstName" = 'StaffV2Old' WHERE "Id" = @id2;
            """, v2))
        {
            cmd.Parameters.AddWithValue("id1", v2Pat1);
            cmd.Parameters.AddWithValue("id2", v2Pat2);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            UPDATE public."User" SET "firstName" = 'V1Changed1' WHERE id = 2001;
            UPDATE public."User" SET "firstName" = 'V1Forced2' WHERE id = 2002;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var runId = await _fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 2, "test-admin");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "Patient", "2001", v2Pat1, SyncConflictType.V2Modified,
            new[] { "firstName" }, CancellationToken.None, incomingV1Hash: "hash-v1-2001", liveV2Hash: "hash-v2-2001");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "Patient", "2002", v2Pat2, SyncConflictType.V2Modified,
            new[] { "firstName" }, CancellationToken.None, incomingV1Hash: "hash-v1-2002", liveV2Hash: "hash-v2-2002");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "Patient", "2003", Guid.NewGuid(), SyncConflictType.V1SoftDeletedShielded,
            new[] { "isDeleted" }, CancellationToken.None);
        await _fx.Ledger.CompleteRunAsync(runId, new SyncRunSummary { Track = SyncTrack.Track1Clinic, Mode = SyncRunMode.Incremental });

        // Test pagination on conflicts & diffs
        var (cPage1, cTotal) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, limit: 2, offset: 0);
        cTotal.Should().Be(3);
        cPage1.Should().HaveCount(2);
        var (cPage2, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, limit: 2, offset: 2);
        cPage2.Should().HaveCount(1);

        var (allOpen, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open, limit: 10, offset: 0);
        var c2001 = allOpen.Single(c => c.V1Id == "2001");
        var c2002 = allOpen.Single(c => c.V1Id == "2002");
        var c2003 = allOpen.Single(c => c.V1Id == "2003");

        // 1. KEEP_V2 updates sync_row_hashes atomically
        var keepRes = await _fx.Coordinator.ResolveConflictAsync(c2001.Id, "KEEP_V2", "reviewer-1", CancellationToken.None);
        keepRes.Should().NotBeNull();
        keepRes!.Conflict.Status.Should().Be(SyncConflictStatus.ResolvedKeepV2);
        var hashes2001 = await _fx.Ledger.LoadRowHashesForIdsAsync(binding.Id, "Patient", new[] { "2001" });
        hashes2001["2001"].V1PayloadHash.Should().Be("hash-v1-2001");
        hashes2001["2001"].V2ExpectedHash.Should().Be("hash-v2-2001");

        // 2. FORCE_V1 immediately re-syncs Patient 2002 to v2 & emits SYNC_FORCE_V1 diff
        var forceRes = await _fx.Coordinator.ResolveConflictAsync(c2002.Id, "FORCE_V1", "reviewer-2", CancellationToken.None);
        forceRes.Should().NotBeNull();
        forceRes!.Conflict.Status.Should().Be(SyncConflictStatus.ResolvedForceV1);
        forceRes.Run.Should().NotBeNull();

        await using (var v2 = await _fx.Connections.OpenClinicDbAsync())
        await using (var cmd = new NpgsqlCommand("""SELECT "FirstName" FROM public."Patients" WHERE "Id" = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2Pat2);
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("V1Forced2");
        }

        var (bindingDiffs, diffTotal) = await _fx.Ledger.ListBindingDiffsAsync(binding.Id, limit: 10, offset: 0);
        diffTotal.Should().BeGreaterThanOrEqualTo(3);
        bindingDiffs.Should().Contain(d => d.V1Id == "2002" && d.Action == SyncDiffAction.ForceV1);

        var (runDiffs, runDiffTotal) = await _fx.Ledger.ListRunDiffsAsync(forceRes.Run!.Id, limit: 10, offset: 0);
        runDiffTotal.Should().Be(1);
        runDiffs.Should().ContainSingle(d => d.Action == SyncDiffAction.ForceV1);

        // 3. FORCE_V1 on Deletion Shield conflict must be rejected (R4)
        Func<Task> forceShieldAct = () => _fx.Coordinator.ResolveConflictAsync(c2003.Id, "FORCE_V1", "reviewer-3", CancellationToken.None);
        await forceShieldAct.Should().ThrowAsync<InvalidOperationException>();

        // 4. IGNORE marks conflict RESOLVED_IGNORE
        var ignoreRes = await _fx.Coordinator.ResolveConflictAsync(c2003.Id, "IGNORE", "reviewer-3", CancellationToken.None);
        ignoreRes!.Conflict.Status.Should().Be(SyncConflictStatus.ResolvedIgnore);

        // 5. Verify M2.2/M2.3 ledger lookup helpers
        var byIds = await _fx.Ledger.GetIdMappingsByV1IdsAsync(binding.Id, "Patient", new[] { "2001", "2002" });
        byIds.Should().ContainKey("2001").And.ContainKey("2002");
        var allEntity = await _fx.Ledger.GetAllIdMappingsForEntityAsync(binding.Id, "Patient");
        allEntity.Count.Should().BeGreaterThanOrEqualTo(2);
        var byPrefix = await _fx.Ledger.GetIdMappingsByV1IdPrefixAsync(binding.Id, "Patient", "200");
        byPrefix.Should().ContainKey("2001").And.ContainKey("2002");
    }

    [Fact]
    public async Task Track2_ForceSyncEntityAsync_OverwritesV2AndEmitsSyncForceV1Diff()
    {
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, "Track2ForceClinic", null, null, null, null, SyncCohortMode.Global),
            "test-admin");

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "userId", "firstName", "lastName", email)
            VALUES (3001, 'auth0|legacy3001', 'OriginalT2', 'PatientT2', 't2.3001@example.test')
            ON CONFLICT (id) DO UPDATE SET "firstName" = EXCLUDED."firstName";
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var v2PatientId = DeterministicUuid.PatientAccountId(3001);
        await _fx.Track2.ForceSyncEntityAsync(binding, "PatientAccount", "3001", v2PatientId, "seed", CancellationToken.None);

        // Verify Auth0 ID was stripped (clerk_user_id IS NULL) and v1 row landed in public.patients
        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""
            SELECT first_name, clerk_user_id FROM public.patients WHERE id = @id
            """, v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatientId);
            await using var r = await cmd.ExecuteReaderAsync();
            (await r.ReadAsync()).Should().BeTrue();
            r.GetString(0).Should().Be("OriginalT2");
            r.IsDBNull(1).Should().BeTrue("Auth0 identifiers must never enter v2");
        }

        // Simulate v2 modification + v1 update + FORCE_V1 via Coordinator
        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""UPDATE public.patients SET first_name = 'V2EditedT2' WHERE id = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatientId);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""UPDATE public."User" SET "firstName" = 'V1RestoredT2' WHERE id = 3001""", v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var runId = await _fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 1, "test-admin");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "PatientAccount", "3001", v2PatientId, SyncConflictType.V2Modified,
            new[] { "firstName" }, CancellationToken.None, incomingV1Hash: "h1", liveV2Hash: "h2");
        await _fx.Ledger.CompleteRunAsync(runId, new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.Incremental });

        var (conflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        var conflict = conflicts.Should().ContainSingle(c => c.V1Id == "3001").Subject;

        var resolved = await _fx.Coordinator.ResolveConflictAsync(conflict.Id, "FORCE_V1", "reviewer-t2", CancellationToken.None);
        resolved.Should().NotBeNull();
        resolved!.Conflict.Status.Should().Be(SyncConflictStatus.ResolvedForceV1);
        resolved.Run.Should().NotBeNull();

        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""SELECT first_name FROM public.patients WHERE id = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatientId);
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("V1RestoredT2");
        }

        var (diffs, _) = await _fx.Ledger.ListRunDiffsAsync(resolved.Run!.Id);
        diffs.Should().ContainSingle(d => d.EntityType == "PatientAccount" && d.Action == SyncDiffAction.ForceV1);
    }

    [Fact]
    public async Task ScopedCdcIdResolver_ExcludesCrossClinicClinicPatientDeletesFromDeletedEvents()
    {
        var installSql = await File.ReadAllTextAsync(Path.Combine(Pg17TestFixture.SqlDirectory, "01_install_v1_sync_changelog.sql"));
        await Pg17TestFixture.ExecuteSqlAsync(_fx.V1ConnectionString, installSql);

        await using var v1 = await _fx.Connections.OpenV1SourceAsync();
        await using (var setup = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "firstName", "lastName")
            VALUES (4101, 'DualClinic', 'Patient')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES
                (4501, 10, 4101),
                (4502, 99, 4101)
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO public."OrganizationMember" (id, "organizationId", "userId") VALUES
                (4601, 5, 4101),
                (4602, 99, 4101)
            ON CONFLICT (id) DO NOTHING;

            TRUNCATE _v1_sync.changelog RESTART IDENTITY;

            DELETE FROM public."ClinicPatient" WHERE id = 4502;
            DELETE FROM public."OrganizationMember" WHERE id = 4602;
            """, v1))
        {
            await setup.ExecuteNonQueryAsync();
        }

        // Scoped to Clinic 10 (and Org 5): neither Clinic 99 ClinicPatient delete nor Org 99 OrganizationMember delete may surface
        var res = await _fx.CdcResolver.ResolveBatchAsync(v1, afterSeq: 0, v1ClinicId: 10, v1OrgId: 5, isGlobal: false, batchLimit: 5000);
        res.DeletedEvents.Should().NotContain(d => d.TableName == "ClinicPatient" && d.RowId == "4502");
        res.DeletedEvents.Should().NotContain(d => d.TableName == "OrganizationMember" && d.RowId == "4602");

        // Now delete Clinic 10's ClinicPatient 4501 -> MUST surface for Clinic 10
        await using (var del10 = new NpgsqlCommand("""DELETE FROM public."ClinicPatient" WHERE id = 4501""", v1))
        {
            await del10.ExecuteNonQueryAsync();
        }

        var res2 = await _fx.CdcResolver.ResolveBatchAsync(v1, afterSeq: res.MaxSeq, v1ClinicId: 10, v1OrgId: null, isGlobal: false, batchLimit: 5000);
        res2.DeletedEvents.Should().ContainSingle(d => d.TableName == "ClinicPatient" && d.RowId == "4501");
        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(res2.DeletedEvents[0], v1ClinicId: 10)
            .Should().ContainSingle().Which.Should().Be(("Patient", "4101"));
    }

    [Fact]
    public async Task ForceV1_OnSoftDeletedOrMissingV1Row_ThrowsInvalidOperation_PreservesV2_AndLeavesConflictOpen()
    {
        var v2ClinicId = Guid.NewGuid();
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, "ForceV1DeletedShieldClinic", 30, null, "tenant-shield", v2ClinicId),
            "test-admin");

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "firstName", "lastName", email)
            VALUES (2050, 'OriginalV1', 'Patient2050', 'u2050@example.test'),
                   (2051, 'OriginalHardDel', 'Patient2051', 'u2051@example.test')
            ON CONFLICT (id) DO UPDATE SET "firstName" = EXCLUDED."firstName", "deletedAt" = NULL, "isActive" = true;

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId")
            VALUES (2150, 30, 2050),
                   (2151, 30, 2051)
            ON CONFLICT (id) DO NOTHING;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var v2PatSoft = DeterministicUuid.ClinicPatientId(v2ClinicId, 2050);
        var v2PatHard = DeterministicUuid.ClinicPatientId(v2ClinicId, 2051);
        await _fx.Track1.ForceSyncEntityAsync(binding, "Patient", "2050", v2PatSoft, "seed", CancellationToken.None);
        await _fx.Track1.ForceSyncEntityAsync(binding, "Patient", "2051", v2PatHard, "seed", CancellationToken.None);

        // Staff edits v2; subsequently v1 2050 is soft-deleted and v1 2051 is hard-deleted
        await using (var v2 = await _fx.Connections.OpenClinicDbAsync())
        await using (var cmd = new NpgsqlCommand("""
            UPDATE public."Patients" SET "FirstName" = 'V2ModifiedSoft' WHERE "Id" = @id1;
            UPDATE public."Patients" SET "FirstName" = 'V2ModifiedHard' WHERE "Id" = @id2;
            """, v2))
        {
            cmd.Parameters.AddWithValue("id1", v2PatSoft);
            cmd.Parameters.AddWithValue("id2", v2PatHard);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            UPDATE public."User" SET "deletedAt" = now(), "isActive" = false WHERE id = 2050;
            DELETE FROM public."User" WHERE id = 2051;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var runId = await _fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 2, "test-admin");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "Patient", "2050", v2PatSoft, SyncConflictType.V2Modified,
            new[] { "firstName" }, CancellationToken.None, incomingV1Hash: "h1", liveV2Hash: "h2");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "Patient", "2051", v2PatHard, SyncConflictType.V2Modified,
            new[] { "firstName" }, CancellationToken.None, incomingV1Hash: "h3", liveV2Hash: "h4");
        await _fx.Ledger.CompleteRunAsync(runId, new SyncRunSummary { Track = SyncTrack.Track1Clinic, Mode = SyncRunMode.Incremental });

        var (openConflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        var cSoft = openConflicts.Single(c => c.V1Id == "2050");
        var cHard = openConflicts.Single(c => c.V1Id == "2051");

        // FORCE_V1 on soft-deleted v1 row must throw InvalidOperationException
        Func<Task> softAct = () => _fx.Coordinator.ResolveConflictAsync(cSoft.Id, "FORCE_V1", "reviewer-shield", CancellationToken.None);
        await softAct.Should().ThrowAsync<InvalidOperationException>();

        // FORCE_V1 on hard-deleted v1 row must also throw InvalidOperationException
        Func<Task> hardAct = () => _fx.Coordinator.ResolveConflictAsync(cHard.Id, "FORCE_V1", "reviewer-shield", CancellationToken.None);
        await hardAct.Should().ThrowAsync<InvalidOperationException>();

        // Verify v2 FirstName preserved and conflicts remain OPEN (NOT RESOLVED_FORCE_V1)
        await using (var v2 = await _fx.Connections.OpenClinicDbAsync())
        await using (var cmd = new NpgsqlCommand("""SELECT "FirstName" FROM public."Patients" WHERE "Id" = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatSoft);
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("V2ModifiedSoft");

            cmd.Parameters.Clear();
            cmd.Parameters.AddWithValue("id", v2PatHard);
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("V2ModifiedHard");
        }

        var (afterConflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        afterConflicts.Should().Contain(c => c.Id == cSoft.Id && c.Status == SyncConflictStatus.Open);
        afterConflicts.Should().Contain(c => c.Id == cHard.Id && c.Status == SyncConflictStatus.Open);

        var runs = await _fx.Ledger.ListRunsAsync(binding.Id, 10);
        runs.Where(r => r.TriggeredBy == "reviewer-shield").Should().AllSatisfy(r => r.Status.Should().Be(SyncRunStatus.Failed));
    }

    [Fact]
    public async Task Track2_ForceV1_OnSoftDeletedV1Row_ThrowsInvalidOperation_PreservesV2_AndLeavesConflictOpen()
    {
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, "Track2ForceShieldClinic", null, null, null, null, SyncCohortMode.Global),
            "test-admin");

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "userId", "firstName", "lastName", email)
            VALUES (3050, 'auth0|t2shield3050', 'OrigT2', 'Shield3050', 't2.3050@example.test')
            ON CONFLICT (id) DO UPDATE SET "firstName" = EXCLUDED."firstName", "deletedAt" = NULL, "isActive" = true;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var v2PatId = DeterministicUuid.PatientAccountId(3050);
        await _fx.Track2.ForceSyncEntityAsync(binding, "PatientAccount", "3050", v2PatId, "seed", CancellationToken.None);

        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""UPDATE public.patients SET first_name = 'V2KeptT2' WHERE id = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatId);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""UPDATE public."User" SET "deletedAt" = now(), "isActive" = false WHERE id = 3050""", v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var runId = await _fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 1, "test-admin");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "PatientAccount", "3050", v2PatId, SyncConflictType.V2Modified,
            new[] { "firstName" }, CancellationToken.None, incomingV1Hash: "h1", liveV2Hash: "h2");
        await _fx.Ledger.CompleteRunAsync(runId, new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.Incremental });

        var (openConflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        var conflict = openConflicts.Should().ContainSingle(c => c.V1Id == "3050").Subject;

        Func<Task> act = () => _fx.Coordinator.ResolveConflictAsync(conflict.Id, "FORCE_V1", "reviewer-t2-shield", CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();

        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""SELECT first_name FROM public.patients WHERE id = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatId);
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("V2KeptT2");
        }

        var (afterConflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        afterConflicts.Should().ContainSingle(c => c.Id == conflict.Id && c.Status == SyncConflictStatus.Open);
    }

    [Fact]
    public async Task ForceV1_OnOutOfScopeOrDeletedClinicPatient_ThrowsInvalidOperation_PreservesV2_AndLeavesConflictOpen()
    {
        var v2ClinicId = Guid.NewGuid();
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, "ForceV1OutOfScopeClinic30", 30, null, "tenant-scope-t1", v2ClinicId),
            "test-admin");

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "firstName", "lastName", email)
            VALUES (2060, 'V1ActiveGlobal', 'Patient2060', 'u2060@example.test')
            ON CONFLICT (id) DO UPDATE SET "firstName" = EXCLUDED."firstName", "deletedAt" = NULL, "isActive" = true;

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId", "deletedAt")
            VALUES (2160, 30, 2060, NULL),
                   (2161, 99, 2060, NULL)
            ON CONFLICT (id) DO UPDATE SET "deletedAt" = NULL;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var v2PatId = DeterministicUuid.ClinicPatientId(v2ClinicId, 2060);
        await _fx.Track1.ForceSyncEntityAsync(binding, "Patient", "2060", v2PatId, "seed", CancellationToken.None);

        // Staff edits v2; subsequently ClinicPatient in Clinic 30 is soft-deleted while User 2060 remains active globally & in Clinic 99
        await using (var v2 = await _fx.Connections.OpenClinicDbAsync())
        await using (var cmd = new NpgsqlCommand("""UPDATE public."Patients" SET "FirstName" = 'V2KeptScope30' WHERE "Id" = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatId);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            UPDATE public."User" SET "firstName" = 'V1OverwriteAttempt' WHERE id = 2060;
            UPDATE public."ClinicPatient" SET "deletedAt" = now() WHERE id = 2160;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var runId = await _fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 1, "test-admin");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "Patient", "2060", v2PatId, SyncConflictType.V2Modified,
            new[] { "firstName" }, CancellationToken.None, incomingV1Hash: "h1", liveV2Hash: "h2");
        await _fx.Ledger.CompleteRunAsync(runId, new SyncRunSummary { Track = SyncTrack.Track1Clinic, Mode = SyncRunMode.Incremental });

        var (openConflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        var conflict = openConflicts.Should().ContainSingle(c => c.V1Id == "2060").Subject;

        Func<Task> act = () => _fx.Coordinator.ResolveConflictAsync(conflict.Id, "FORCE_V1", "reviewer-t1-scope", CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();

        await using (var v2 = await _fx.Connections.OpenClinicDbAsync())
        await using (var cmd = new NpgsqlCommand("""SELECT "FirstName" FROM public."Patients" WHERE "Id" = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatId);
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("V2KeptScope30");
        }

        var (afterConflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        afterConflicts.Should().ContainSingle(c => c.Id == conflict.Id && c.Status == SyncConflictStatus.Open);

        var runs = await _fx.Ledger.ListRunsAsync(binding.Id, 10);
        runs.Where(r => r.TriggeredBy == "reviewer-t1-scope").Should().AllSatisfy(r => r.Status.Should().Be(SyncRunStatus.Failed));
    }

    [Fact]
    public async Task Track2_Scoped_ForceV1_OnOutOfScopeOrDeletedClinicPatient_ThrowsInvalidOperation_PreservesV2_AndLeavesConflictOpen()
    {
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, "Track2ScopedForceClinic31", 31, null, null, null, SyncCohortMode.Scoped),
            "test-admin");

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "userId", "firstName", "lastName", email)
            VALUES (3060, 'auth0|t2scoped3060', 'OrigScopedT2', 'Patient3060', 't2.3060@example.test')
            ON CONFLICT (id) DO UPDATE SET "firstName" = EXCLUDED."firstName", "deletedAt" = NULL, "isActive" = true;

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId", "deletedAt")
            VALUES (3160, 31, 3060, NULL),
                   (3161, 99, 3060, NULL)
            ON CONFLICT (id) DO UPDATE SET "deletedAt" = NULL;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var v2PatId = DeterministicUuid.PatientAccountId(3060);
        await _fx.Track2.ForceSyncEntityAsync(binding, "PatientAccount", "3060", v2PatId, "seed", CancellationToken.None);

        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""UPDATE public.patients SET first_name = 'V2KeptScopedT2' WHERE id = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatId);
            await cmd.ExecuteNonQueryAsync();
        }

        // User 3060 stays active globally & in Clinic 99, but ClinicPatient in scoped Clinic 31 is soft-deleted
        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            UPDATE public."User" SET "firstName" = 'V1ScopedOverwriteAttempt' WHERE id = 3060;
            UPDATE public."ClinicPatient" SET "deletedAt" = now() WHERE id = 3160;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        var runId = await _fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 1, "test-admin");
        await _fx.Ledger.RecordConflictAsync(binding.Id, runId, "PatientAccount", "3060", v2PatId, SyncConflictType.V2Modified,
            new[] { "firstName" }, CancellationToken.None, incomingV1Hash: "h1", liveV2Hash: "h2");
        await _fx.Ledger.CompleteRunAsync(runId, new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.Incremental });

        var (openConflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        var conflict = openConflicts.Should().ContainSingle(c => c.V1Id == "3060").Subject;

        Func<Task> act = () => _fx.Coordinator.ResolveConflictAsync(conflict.Id, "FORCE_V1", "reviewer-t2-scope", CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();

        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""SELECT first_name FROM public.patients WHERE id = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2PatId);
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("V2KeptScopedT2");
        }

        var (afterConflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        afterConflicts.Should().ContainSingle(c => c.Id == conflict.Id && c.Status == SyncConflictStatus.Open);

        var runs = await _fx.Ledger.ListRunsAsync(binding.Id, 10);
        runs.Where(r => r.TriggeredBy == "reviewer-t2-scope").Should().AllSatisfy(r => r.Status.Should().Be(SyncRunStatus.Failed));
    }

    [Fact]
    public async Task UpdateBindingWithGuard_AndDeleteBinding_EnforceHistoryGuardsAndLedgerReset()
    {
        var clinicV2A = Guid.Parse("10000000-0000-4000-8000-000000000001");
        var clinicV2B = Guid.Parse("10000000-0000-4000-8000-000000000002");

        var created = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, "Initial Name", 3, 1, "tenant-a", clinicV2A, SyncCohortMode.Scoped, false, 30),
            "test-admin");
        created.HasSyncHistory.Should().BeFalse();

        // 1. Fresh connection (even after a DRY_RUN) can freely edit name, poll interval, and source/destination
        var dryRunId = await _fx.Ledger.StartRunAsync(created.Id, SyncRunMode.DryRun, 10, "test-admin");
        await _fx.Ledger.CompleteRunAsync(dryRunId, new SyncRunSummary { Track = SyncTrack.Track1Clinic, Mode = SyncRunMode.DryRun });

        var afterDryRun = await _fx.Ledger.GetBindingAsync(created.Id);
        afterDryRun!.HasSyncHistory.Should().BeFalse();

        var freshEdit = await _fx.Ledger.UpdateBindingWithGuardAsync(
            created.Id,
            new UpdateBindingRequest(
                Name: "Renamed Clinic",
                PollIntervalSeconds: 60,
                AutoSyncEnabled: true,
                UpdateMapping: true,
                V1ClinicId: 5,
                V1OrgId: 2,
                V2TenantId: "tenant-b",
                V2ClinicId: clinicV2B,
                ForceMappingChange: false),
            "test-admin");

        freshEdit.StatusCode.Should().Be(200);
        freshEdit.Value!.Name.Should().Be("Renamed Clinic");
        freshEdit.Value.PollIntervalSeconds.Should().Be(60);
        freshEdit.Value.AutoSyncEnabled.Should().BeTrue();
        freshEdit.Value.V1ClinicId.Should().Be(5);
        freshEdit.Value.V1OrgId.Should().Be(2);
        freshEdit.Value.V2TenantId.Should().Be("tenant-b");
        freshEdit.Value.V2ClinicId.Should().Be(clinicV2B);

        // 2. Reject empty name with 400 and incomplete Track 1 mapping with 400
        var emptyName = await _fx.Ledger.UpdateBindingWithGuardAsync(
            created.Id,
            new UpdateBindingRequest(Name: "   "),
            "test-admin");
        emptyName.StatusCode.Should().Be(400);

        var missingDest = await _fx.Ledger.UpdateBindingWithGuardAsync(
            created.Id,
            new UpdateBindingRequest(UpdateMapping: true, V1ClinicId: 5, V1OrgId: null, V2TenantId: "", V2ClinicId: null),
            "test-admin");
        missingDest.StatusCode.Should().Be(400);

        // 3. Once a non-dry-run sync writes history/cursor, HasSyncHistory becomes true
        await _fx.Ledger.UpsertIdMapAndHashBatchAsync(
            created.Id,
            "Patient",
            new[] { ("501", Guid.NewGuid(), "hash-v1", "hash-v2") });
        await _fx.Ledger.UpdateCursorAsync(created.Id, 42);

        var synced = await _fx.Ledger.GetBindingAsync(created.Id);
        synced!.HasSyncHistory.Should().BeTrue();

        // Editing name/poll without changing mapping succeeds immediately even with sync history
        var safeMetaEdit = await _fx.Ledger.UpdateBindingWithGuardAsync(
            created.Id,
            new UpdateBindingRequest(
                Name: "Renamed Again",
                PollIntervalSeconds: 45,
                UpdateMapping: true,
                V1ClinicId: 5,
                V1OrgId: 2,
                V2TenantId: "tenant-b",
                V2ClinicId: clinicV2B,
                ForceMappingChange: false),
            "test-admin");
        safeMetaEdit.StatusCode.Should().Be(200);
        safeMetaEdit.Value!.LastChangelogSeq.Should().Be(42);

        // Changing mapping with sync history without ForceMappingChange -> 409 Conflict
        var blockedMappingEdit = await _fx.Ledger.UpdateBindingWithGuardAsync(
            created.Id,
            new UpdateBindingRequest(
                UpdateMapping: true,
                V1ClinicId: 9,
                V1OrgId: null,
                V2TenantId: "tenant-a",
                V2ClinicId: clinicV2A,
                ForceMappingChange: false),
            "test-admin");
        blockedMappingEdit.StatusCode.Should().Be(409);

        // Confirming ForceMappingChange -> 200 OK and resets id_map + cursor atomically
        var forcedMappingEdit = await _fx.Ledger.UpdateBindingWithGuardAsync(
            created.Id,
            new UpdateBindingRequest(
                UpdateMapping: true,
                V1ClinicId: 9,
                V1OrgId: null,
                V2TenantId: "tenant-a",
                V2ClinicId: clinicV2A,
                ForceMappingChange: true),
            "test-admin");
        forcedMappingEdit.StatusCode.Should().Be(200);
        forcedMappingEdit.Value!.V1ClinicId.Should().Be(9);
        forcedMappingEdit.Value.V1OrgId.Should().BeNull();
        forcedMappingEdit.Value.V2TenantId.Should().Be("tenant-a");
        forcedMappingEdit.Value.LastChangelogSeq.Should().Be(0);

        // 4. Delete guard: re-seed history -> delete without force returns 409, with force=true succeeds and keeps audit row
        await _fx.Ledger.UpdateCursorAsync(created.Id, 77);
        var blockedDelete = await _fx.Ledger.DeleteBindingAsync(created.Id, force: false, "test-admin");
        blockedDelete.StatusCode.Should().Be(409);

        var forcedDelete = await _fx.Ledger.DeleteBindingAsync(created.Id, force: true, "test-admin");
        forcedDelete.StatusCode.Should().Be(200);
        forcedDelete.Value!.DeletedId.Should().Be(created.Id);
        (await _fx.Ledger.GetBindingAsync(created.Id)).Should().BeNull();

        await using (var ledgerConn = await _fx.Connections.OpenSyncLedgerDbAsync())
        await using (var auditCmd = new NpgsqlCommand(
            "SELECT COUNT(*) FROM sync_audit_logs WHERE binding_id = @id AND action = 'BINDING_DELETED'",
            ledgerConn))
        {
            auditCmd.Parameters.AddWithValue("id", created.Id);
            Convert.ToInt64(await auditCmd.ExecuteScalarAsync()).Should().Be(1);
        }

        // 5. Fresh connection deletes immediately with force=false
        var freshBinding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, "Unused Temp", 3, 1, "tenant-a", clinicV2A, BatchSize: 50),
            "test-admin");
        freshBinding.BatchSize.Should().Be(50);

        var updatedBatch = await _fx.Ledger.UpdateBindingWithGuardAsync(
            freshBinding.Id,
            new UpdateBindingRequest(BatchSize: 125),
            "test-admin");
        updatedBatch.StatusCode.Should().Be(200);
        updatedBatch.Value!.BatchSize.Should().Be(125);

        // Clamps out-of-range batch sizes safely (10..1000)
        var clampedBatch = await _fx.Ledger.UpdateBindingWithGuardAsync(
            freshBinding.Id,
            new UpdateBindingRequest(BatchSize: 5000),
            "test-admin");
        clampedBatch.StatusCode.Should().Be(200);
        clampedBatch.Value!.BatchSize.Should().Be(1000);

        var freshDelete = await _fx.Ledger.DeleteBindingAsync(freshBinding.Id, force: false, "test-admin");
        freshDelete.StatusCode.Should().Be(200);
        (await _fx.Ledger.GetBindingAsync(freshBinding.Id)).Should().BeNull();
    }

    [Fact]
    public async Task RuntimeSettings_PersistInDb_ValidateBounds_ApplyLiveToStorageAndTrackSampleCompletionFlags()
    {
        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ASPNETCORE_ENVIRONMENT"] = "Staging",
                ["V1Sync:MaxPoolSize"] = "2",
                ["V1Sync:BatchSize"] = "200",
                ["ClinicEncryption:MasterSecret"] = "test-clinic-encryption-master-secret-32chars-min!",
                ["PatientEncryption:MasterSecret"] = "test-patient-encryption-master-secret-32chars-min!"
            })
            .Build();

        var storageOpts = Options.Create(new Track3StorageOptions
        {
            Enabled = true,
            MaxConcurrency = 6,
            MaxFileSizeBytes = 50L * 1024 * 1024,
            VerificationSampleRate = 0.02,
            AzureBlob1Enabled = true,
            ClinicR2 = new Track3BucketOptions
            {
                AccountId = "acct-clinic",
                BucketName = "clinic-bucket",
                AccessKeyId = "ak-clinic",
                SecretAccessKey = "sk-clinic"
            },
            PatientR2 = new Track3BucketOptions
            {
                AccountId = "acct-patient",
                BucketName = "patient-bucket",
                AccessKeyId = "ak-patient",
                SecretAccessKey = "sk-patient"
            }
        });

        var settingsService = new SyncRuntimeSettingsService(
            _fx.Connections,
            _fx.Ledger,
            cfg,
            storageOpts,
            NullLogger<SyncRuntimeSettingsService>.Instance);

        await settingsService.InitializeAsync();
        using var r2Pool = new Track3R2ClientPool(
            storageOpts,
            NullLogger<Track3R2ClientPool>.Instance,
            settingsService);
        var encryptor = new Track3EnvelopeEncryptor(cfg);

        var initial = await settingsService.GetResponseAsync(r2Pool, encryptor);
        initial.EnvironmentLabel.Should().Be("STAGING");
        initial.MaxPoolSize.Should().Be(2);
        initial.DefaultBatchSize.Should().Be(200);
        initial.EnableBackgroundWorker.Should().BeTrue();
        initial.StorageEnabled.Should().BeTrue();
        initial.ClinicStorageConfigured.Should().BeTrue();
        initial.PatientStorageConfigured.Should().BeTrue();
        r2Pool.IsClinicConfigured.Should().BeTrue();
        r2Pool.IsPatientConfigured.Should().BeTrue();

        // Validation rejects out-of-range settings
        await Assert.ThrowsAsync<ArgumentException>(() =>
            settingsService.UpdateAsync(new UpdateSyncRuntimeSettingsRequest(MaxPoolSize: 99), "admin@test", r2Pool, encryptor));
        await Assert.ThrowsAsync<ArgumentException>(() =>
            settingsService.UpdateAsync(new UpdateSyncRuntimeSettingsRequest(DefaultBatchSize: 5), "admin@test", r2Pool, encryptor));
        await Assert.ThrowsAsync<ArgumentException>(() =>
            settingsService.UpdateAsync(new UpdateSyncRuntimeSettingsRequest(StorageMaxConcurrency: 32), "admin@test", r2Pool, encryptor));
        await Assert.ThrowsAsync<ArgumentException>(() =>
            settingsService.UpdateAsync(new UpdateSyncRuntimeSettingsRequest(StorageVerificationSampleRate: 1.5), "admin@test", r2Pool, encryptor));

        // Valid live update persists to DB, updates Track3R2ClientPool live, and flags pool restart requirement
        var updated = await settingsService.UpdateAsync(
            new UpdateSyncRuntimeSettingsRequest(
                EnvironmentLabel: "production",
                MaxPoolSize: 4,
                DefaultBatchSize: 500,
                EnableBackgroundWorker: false,
                DefaultPollIntervalSeconds: 45,
                OvernightPollIntervalSeconds: 600,
                OvernightBackoffStartHourPh: 23,
                OvernightBackoffEndHourPh: 5,
                StorageEnabled: false,
                StorageMaxConcurrency: 10,
                StorageMaxFileSizeBytes: 100L * 1024 * 1024,
                StorageVerificationSampleRate: 0.1,
                AzureBlob1Enabled: false),
            "ops@clinicez.test",
            r2Pool,
            encryptor);

        updated.EnvironmentLabel.Should().Be("PRODUCTION");
        updated.MaxPoolSize.Should().Be(4);
        updated.PoolSizeRestartRequired.Should().BeTrue();
        updated.DefaultBatchSize.Should().Be(500);
        updated.EnableBackgroundWorker.Should().BeFalse();
        updated.StorageEnabled.Should().BeFalse();
        updated.AzureBlob1Enabled.Should().BeFalse();
        updated.UpdatedBy.Should().Be("ops@clinicez.test");

        // Credentials still exist, but live StorageEnabled=false disables Track3R2ClientPool immediately
        r2Pool.HasClinicCredentials.Should().BeTrue();
        r2Pool.HasPatientCredentials.Should().BeTrue();
        r2Pool.IsClinicConfigured.Should().BeFalse();
        r2Pool.IsPatientConfigured.Should().BeFalse();

        // Simulate restart: a fresh SyncRuntimeSettingsService loads persisted values from SyncLedgerDb
        var reloadedService = new SyncRuntimeSettingsService(
            _fx.Connections,
            _fx.Ledger,
            cfg,
            storageOpts,
            NullLogger<SyncRuntimeSettingsService>.Instance);
        await reloadedService.InitializeAsync();
        reloadedService.Current.DefaultBatchSize.Should().Be(500);
        reloadedService.Current.StorageMaxConcurrency.Should().Be(10);
        reloadedService.Current.OvernightBackoffStartHourPh.Should().Be(23);
        reloadedService.Current.StorageEnabled.Should().BeFalse();

        // Restore StorageEnabled=true -> pool becomes active immediately again
        await settingsService.UpdateAsync(
            new UpdateSyncRuntimeSettingsRequest(StorageEnabled: true, AzureBlob1Enabled: true, EnableBackgroundWorker: true, MaxPoolSize: 2),
            "ops@clinicez.test",
            r2Pool,
            encryptor);
        r2Pool.IsClinicConfigured.Should().BeTrue();

        // Verify SyncBinding HasCompletedPreview / HasCompletedMigration flags progression
        var sampleBinding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, "Sample Progression Check", 1, null, "tenant-prog", Guid.NewGuid()),
            "test-admin");
        sampleBinding.HasCompletedPreview.Should().BeFalse();
        sampleBinding.HasCompletedMigration.Should().BeFalse();

        // Failed preview MUST NOT unlock HasCompletedPreview
        var failedPreviewId = await _fx.Ledger.StartRunAsync(sampleBinding.Id, SyncRunMode.DryRun, 25, "test-admin");
        await _fx.Ledger.FailRunAsync(
            failedPreviewId,
            new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.DryRun, SampleLimit = 25 },
            "simulated error");
        var afterFailedPreview = (await _fx.Ledger.GetBindingAsync(sampleBinding.Id))!;
        afterFailedPreview.HasCompletedPreview.Should().BeFalse();
        afterFailedPreview.HasCompletedMigration.Should().BeFalse();

        // Completed sample preview unlocks HasCompletedPreview only (NOT HasCompletedMigration)
        var okPreviewId = await _fx.Ledger.StartRunAsync(sampleBinding.Id, SyncRunMode.DryRun, 25, "test-admin");
        await _fx.Ledger.CompleteRunAsync(okPreviewId, new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.DryRun, SampleLimit = 25 });
        var afterOkPreview = (await _fx.Ledger.GetBindingAsync(sampleBinding.Id))!;
        afterOkPreview.HasCompletedPreview.Should().BeTrue();
        afterOkPreview.HasCompletedMigration.Should().BeFalse();

        // Completed sample migration unlocks HasCompletedMigration
        var okSampleMigId = await _fx.Ledger.StartRunAsync(sampleBinding.Id, SyncRunMode.Backfill, 25, "test-admin");
        await _fx.Ledger.CompleteRunAsync(okSampleMigId, new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.Backfill, SampleLimit = 25 });
        var afterOkSampleMig = (await _fx.Ledger.GetBindingAsync(sampleBinding.Id))!;
        afterOkSampleMig.HasCompletedPreview.Should().BeTrue();
        afterOkSampleMig.HasCompletedMigration.Should().BeTrue();
    }

    [Fact]
    public async Task FrozenBinding_RejectsMappingAndAutoSyncUpdatesUntilUnfrozen()
    {
        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, "Frozen Mutation Guard", 3, 1, "tenant-frz", Guid.NewGuid()),
            "test-admin");

        await _fx.Ledger.FreezeBindingAsync(binding.Id, "test-admin", "retirement check");

        var autoSyncAttempt = await _fx.Ledger.UpdateBindingWithGuardAsync(
            binding.Id,
            new UpdateBindingRequest(AutoSyncEnabled: true),
            "test-admin");
        autoSyncAttempt.StatusCode.Should().Be(409);

        var remapAttempt = await _fx.Ledger.UpdateBindingWithGuardAsync(
            binding.Id,
            new UpdateBindingRequest(
                UpdateMapping: true,
                V1ClinicId: 99,
                V2TenantId: binding.V2TenantId,
                V2ClinicId: binding.V2ClinicId,
                ForceMappingChange: true),
            "test-admin");
        remapAttempt.StatusCode.Should().Be(409);

        var stillOriginal = (await _fx.Ledger.GetBindingAsync(binding.Id))!;
        stillOriginal.IsFrozen.Should().BeTrue();
        stillOriginal.AutoSyncEnabled.Should().BeFalse();
        stillOriginal.V1ClinicId.Should().Be(3);

        await _fx.Ledger.UnfreezeBindingAsync(binding.Id, "test-admin");
        var afterUnfreeze = await _fx.Ledger.UpdateBindingWithGuardAsync(
            binding.Id,
            new UpdateBindingRequest(AutoSyncEnabled: true),
            "test-admin");
        afterUnfreeze.StatusCode.Should().Be(200);
        afterUnfreeze.Value!.AutoSyncEnabled.Should().BeTrue();
    }
}
