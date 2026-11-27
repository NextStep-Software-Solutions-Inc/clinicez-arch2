using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using ClinicEz.V1Sync.Api.Services.ConflictDiff;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

[Collection("Pg17Integration")]
public sealed class ConflictDiffIntegrationTests : IClassFixture<Pg17TestFixture>
{
    private readonly Pg17TestFixture _fx;

    public ConflictDiffIntegrationTests(Pg17TestFixture fx)
    {
        _fx = fx;
    }

    private ConflictDiffService CreateService(bool allowBreakGlassClinicalNotes = false)
    {
        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["V1Sync:AllowBreakGlassClinicalNotes"] = allowBreakGlassClinicalNotes ? "true" : "false"
            })
            .Build();

        IConflictDiffInspector[] inspectors =
        [
            new Track2PatientAccountConflictInspector(),
            new Track2PatientSocialHistoryConflictInspector(),
            new Track1PatientConflictInspector(),
            new Track1PatientSocialHistoryConflictInspector(),
            new Track1PatientVitalsConflictInspector()
        ];

        return new ConflictDiffService(
            _fx.Connections,
            _fx.Ledger,
            inspectors,
            cfg,
            NullLogger<ConflictDiffService>.Instance);
    }

    private async Task EnsureExtendedDiffTablesAsync()
    {
        await Pg17TestFixture.ExecuteSqlAsync(_fx.V1ConnectionString, """
            CREATE TABLE IF NOT EXISTS public."PersonalHistory" (
                id                     SERIAL PRIMARY KEY,
                "userId"               INT NOT NULL,
                "smokingStatus"        TEXT,
                "numberOfPacksPerYear" NUMERIC(8,2),
                "alcoholStatus"        TEXT,
                "numberOfBottlesPerDay" INT,
                "illicitDrugUse"       TEXT,
                "sexuallyActive"       TEXT,
                "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
                "deletedAt"            TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS public."VitalSign" (
                id                          SERIAL PRIMARY KEY,
                "userId"                    INT NOT NULL,
                "consultationTicketId"      INT,
                "dateTaken"                 TIMESTAMPTZ,
                height                      NUMERIC(6,2),
                weight                      NUMERIC(6,2),
                bmi                         NUMERIC(6,2),
                "bpSystolic"                INT,
                "bpDiastolic"               INT,
                "pulseRate"                 INT,
                temp                        NUMERIC(5,2),
                spo2                        NUMERIC(5,2),
                "respRate"                  INT,
                notes                       TEXT,
                "headCircumference"         NUMERIC(6,2),
                "hipCircumference"          NUMERIC(6,2),
                length                      NUMERIC(6,2),
                "limbCircumference"         NUMERIC(6,2),
                "midUpperArmCircumference"  NUMERIC(6,2),
                "skinfoldThickness"         NUMERIC(6,2),
                "visualAcuityLeft"          TEXT,
                "visualAcuityRight"         TEXT,
                "waistCircumference"        NUMERIC(6,2),
                "isActive"                  BOOLEAN NOT NULL DEFAULT TRUE,
                "deletedAt"                 TIMESTAMPTZ,
                "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS public."PreAssessmentNote" (
                id                 SERIAL PRIMARY KEY,
                "appointmentId"    INT NOT NULL,
                "clinicId"         INT NOT NULL,
                assessment         TEXT,
                "homeInstructions" TEXT,
                remarks            TEXT,
                "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """);

        await Pg17TestFixture.ExecuteSqlAsync(_fx.ClinicConnectionString, """
            CREATE TABLE IF NOT EXISTS public."PatientSocialHistories" (
                "Id"                     UUID PRIMARY KEY,
                "PatientId"              UUID NOT NULL,
                "IsSmoker"               BOOLEAN NOT NULL DEFAULT FALSE,
                "SmokingPackYears"       NUMERIC(6,2),
                "SmokingStatus"          TEXT,
                "IsAlcoholDrinker"       BOOLEAN NOT NULL DEFAULT FALSE,
                "AlcoholBottlesPerDay"   INT,
                "AlcoholStatus"          TEXT,
                "UsesIllicitDrugs"       BOOLEAN NOT NULL DEFAULT FALSE,
                "IsSexuallyActive"       BOOLEAN NOT NULL DEFAULT FALSE,
                "IsPhysicallyActive"     BOOLEAN NOT NULL DEFAULT FALSE,
                "UsesFluorideToothpaste" BOOLEAN NOT NULL DEFAULT FALSE,
                "CreatedAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
                "CreatedBy"              TEXT,
                "UpdatedAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
                "UpdatedBy"              TEXT,
                "IsDeleted"              BOOLEAN NOT NULL DEFAULT FALSE,
                "TenantId"               TEXT NOT NULL,
                "ClinicId"               UUID NOT NULL
            );

            CREATE TABLE IF NOT EXISTS public."PatientVitals" (
                "Id"                         UUID PRIMARY KEY,
                "QueueItemId"                UUID,
                "ConsultationEncounterId"    UUID,
                "PatientId"                  UUID NOT NULL,
                "RecordedAt"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
                "SystolicBp"                 INT,
                "DiastolicBp"                INT,
                "HeartRateBpm"               INT,
                "TemperatureCelsius"         NUMERIC(5,2),
                "RespiratoryRateBreathsPerMin" INT,
                "OxygenSaturationPercent"    NUMERIC(5,2),
                "HeightCm"                   NUMERIC(6,2),
                "WeightKg"                   NUMERIC(6,2),
                "Bmi"                        NUMERIC(6,2),
                "Notes"                      TEXT,
                "PreAssessmentNotes"         TEXT,
                "PreAssessmentRemarks"       TEXT,
                "HomeInstructions"           TEXT,
                "IsMeasuredRecumbent"        BOOLEAN NOT NULL DEFAULT FALSE,
                "RosCategory"                TEXT,
                "CreatedAt"                  TIMESTAMPTZ NOT NULL DEFAULT now(),
                "CreatedBy"                  TEXT,
                "UpdatedAt"                  TIMESTAMPTZ NOT NULL DEFAULT now(),
                "UpdatedBy"                  TEXT,
                "IsDeleted"                  BOOLEAN NOT NULL DEFAULT FALSE,
                "TenantId"                   TEXT NOT NULL,
                "ClinicId"                   UUID NOT NULL
            );
            """);

        await Pg17TestFixture.ExecuteSqlAsync(_fx.PatientConnectionString, """
            CREATE TABLE IF NOT EXISTS public.patient_social_histories (
                id                  UUID PRIMARY KEY,
                client_id           UUID NOT NULL,
                patient_id          UUID NOT NULL UNIQUE,
                smoking_status      TEXT,
                pack_years          NUMERIC(5,1),
                alcohol_use         TEXT,
                uses_substances     BOOLEAN NOT NULL DEFAULT FALSE,
                is_sexually_active  BOOLEAN,
                created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
                created_by          TEXT,
                updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_by          TEXT,
                is_deleted          BOOLEAN NOT NULL DEFAULT FALSE
            );
            """);
    }

    [Fact]
    public async Task Track2_PatientAccount_InspectsTier1Masked_DetectsHashDrift_LogsBreakGlassAudit_AndExportsZeroPhiReport()
    {
        await EnsureExtendedDiffTablesAsync();
        var service = CreateService();

        var binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, "DiffInspectorTrack2", null, null, null, null, SyncCohortMode.Global),
            "test-admin");

        const int v1Uid = 9101;
        var v2Pid = DeterministicUuid.PatientAccountId(v1Uid);

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public."User" (
                id, "userId", "firstName", "lastName", "middleName", gender, dob,
                "civilStatus", "bloodType", mobile, email, "updatedAt"
            ) VALUES (
                @uid, 'auth0|9101', 'Maria', 'Santos', 'Cruz', 'FEMALE', '1992-07-19',
                'SINGLE', 'O_POSITIVE', '0917-555-0199', 'maria.santos@example.test', '2026-11-20T08:00:00Z'
            )
            ON CONFLICT (id) DO UPDATE SET
                "firstName" = EXCLUDED."firstName",
                "middleName" = EXCLUDED."middleName",
                mobile = EXCLUDED.mobile,
                email = EXCLUDED.email,
                "civilStatus" = EXCLUDED."civilStatus",
                "deletedAt" = NULL,
                "isActive" = true,
                "updatedAt" = EXCLUDED."updatedAt";
            """, v1))
        {
            cmd.Parameters.AddWithValue("uid", v1Uid);
            await cmd.ExecuteNonQueryAsync();
        }

        await _fx.Track2.ForceSyncEntityAsync(binding, "PatientAccount", v1Uid.ToString(), v2Pid, "seed", CancellationToken.None);

        // Edit v2: clear middle_name (V2_CLEARED_VALUE), fill alt_phone (V2_FILLED_EMPTY),
        // format-only change mobile (FORMAT_ONLY), modify civil_status & email (MODIFIED)
        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""
            UPDATE public.patients
            SET middle_name = NULL,
                alt_phone = '0888123456',
                mobile = '09175550199',
                civil_status = 'Married',
                email = 'maria.new@example.test',
                updated_at = '2026-11-26T10:30:00Z'
            WHERE id = @id
            """, v2))
        {
            cmd.Parameters.AddWithValue("id", v2Pid);
            await cmd.ExecuteNonQueryAsync();
        }

        // Compute exact recorded hashes matching what sync engine records
        var v1Canonical = Track2PatientSyncEngine.BuildPatientCanonicalMap(
            "Maria", "Cruz", "Santos", null, "Female", new DateOnly(1992, 7, 19),
            null, "Single", "OPositive", null, null, "0917-555-0199", null, "maria.santos@example.test");
        var v2Canonical = Track2PatientSyncEngine.BuildPatientCanonicalMap(
            "Maria", null, "Santos", null, "Female", new DateOnly(1992, 7, 19),
            null, "Married", "OPositive", null, null, "09175550199", "0888123456", "maria.new@example.test");
        var recV1Hash = DeterministicUuid.ComputeCanonicalHash(v1Canonical);
        var recV2Hash = DeterministicUuid.ComputeCanonicalHash(v2Canonical);

        var runId = await _fx.Ledger.StartRunAsync(binding.Id, SyncRunMode.Incremental, 1, "test-admin");
        await _fx.Ledger.RecordConflictAsync(
            binding.Id, runId, "PatientAccount", v1Uid.ToString(), v2Pid,
            SyncConflictType.V2Modified,
            ["middle_name", "alt_phone", "mobile", "civil_status", "email"],
            CancellationToken.None, recV1Hash, recV2Hash);
        await _fx.Ledger.CompleteRunAsync(runId, new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.Incremental });

        var (conflicts, _) = await _fx.Ledger.ListConflictsAsync(binding.Id, SyncConflictStatus.Open);
        var conflict = conflicts.Should().ContainSingle(c => c.V1Id == v1Uid.ToString()).Subject;

        // 1. Tier 1 Zero-PHI Inspection (fresh hashes -> NOT stale)
        var tier1 = await service.GetConflictDetailAsync(
            conflict.Id, revealValues: false, reason: null, actor: "admin@clinicez.test", mfaVerified: false, CancellationToken.None);

        tier1.InspectorMode.Should().Be(ConflictInspectorMode.FieldDiff);
        tier1.IsStale.Should().BeFalse();
        tier1.HasV1HashDrift.Should().BeFalse();
        tier1.HasV2HashDrift.Should().BeFalse();
        tier1.V1RecordStatus.Should().Be(ConflictRecordStatus.Active);
        tier1.V2RecordStatus.Should().Be(ConflictRecordStatus.Active);
        tier1.V1UpdatedAtUtc.Should().Be(new DateTimeOffset(2026, 11, 20, 8, 0, 0, TimeSpan.Zero));
        tier1.V2UpdatedAtUtc.Should().Be(new DateTimeOffset(2026, 11, 26, 10, 30, 0, TimeSpan.Zero));
        tier1.ValuesRevealed.Should().BeFalse();

        tier1.Fields.Should().ContainSingle(f => f.FieldName == "middle_name" && f.Classification == FieldDiffClassification.V2ClearedValue);
        tier1.Fields.Should().ContainSingle(f => f.FieldName == "alt_phone" && f.Classification == FieldDiffClassification.V2FilledEmpty);
        tier1.Fields.Should().ContainSingle(f => f.FieldName == "mobile" && f.Classification == FieldDiffClassification.FormatOnly);
        tier1.Fields.Should().ContainSingle(f => f.FieldName == "email" && f.Classification == FieldDiffClassification.Modified);

        var civilField = tier1.Fields.Should().ContainSingle(f => f.FieldName == "civil_status").Subject;
        civilField.Classification.Should().Be(FieldDiffClassification.Modified);
        civilField.V1Preview.Should().Be("Single");
        civilField.V2Preview.Should().Be("Married");

        // Zero-PHI guarantee on Tier 1 JSON payload
        var tier1Json = JsonSerializer.Serialize(tier1);
        tier1Json.Should().NotContain("Maria");
        tier1Json.Should().NotContain("Santos");
        tier1Json.Should().NotContain("maria.santos@example.test");
        tier1Json.Should().NotContain("maria.new@example.test");
        tier1Json.Should().NotContain("0917-555-0199");
        tier1Json.Should().NotContain("0888123456");

        // 2. Tier 2 Break-Glass Reveal -> returns live values transiently & writes Zero-PHI audit event
        var tier2 = await service.GetConflictDetailAsync(
            conflict.Id, revealValues: true, reason: "Verifying patient email change before cutover",
            actor: "dpo.admin@clinicez.test", mfaVerified: true, CancellationToken.None);

        tier2.ValuesRevealed.Should().BeTrue();
        var emailField = tier2.Fields.Should().ContainSingle(f => f.FieldName == "email").Subject;
        emailField.V1Value.Should().Be("maria.santos@example.test");
        emailField.V2Value.Should().Be("maria.new@example.test");

        await using (var ledgerConn = await _fx.Connections.OpenSyncLedgerDbAsync())
        await using (var auditCmd = new NpgsqlCommand("""
            SELECT actor, details_json::text
            FROM sync_audit_logs
            WHERE binding_id = @bid AND action = 'CONFLICT_DIFF_VALUES_REVEALED'
            ORDER BY id DESC LIMIT 1
            """, ledgerConn))
        {
            auditCmd.Parameters.AddWithValue("bid", binding.Id);
            await using var r = await auditCmd.ExecuteReaderAsync();
            (await r.ReadAsync()).Should().BeTrue();
            r.GetString(0).Should().Be("dpo.admin@clinicez.test");
            var details = r.GetString(1);
            using (var doc = JsonDocument.Parse(details))
            {
                doc.RootElement.GetProperty("reason").GetString().Should().Be("Verifying patient email change before cutover");
                doc.RootElement.GetProperty("mfaVerified").GetBoolean().Should().BeTrue();
                doc.RootElement.GetProperty("clinicalNotesRedactedByPolicy").GetBoolean().Should().BeFalse();
            }
            details.Should().NotContain("maria.santos@example.test");
            details.Should().NotContain("maria.new@example.test");
            details.Should().NotContain("Maria");
        }

        // 3. Hash-drift detection: mutate live v2 row -> HasV2HashDrift = true, IsStale = true
        await using (var v2 = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""UPDATE public.patients SET email = 'drifted.v2@example.test' WHERE id = @id""", v2))
        {
            cmd.Parameters.AddWithValue("id", v2Pid);
            await cmd.ExecuteNonQueryAsync();
        }

        var drifted = await service.GetConflictDetailAsync(
            conflict.Id, revealValues: false, reason: null, actor: "admin@clinicez.test", mfaVerified: false, CancellationToken.None);
        drifted.IsStale.Should().BeTrue();
        drifted.HasV2HashDrift.Should().BeTrue();
        drifted.HasV1HashDrift.Should().BeFalse();
        drifted.StaleReasons.Should().Contain(s => s.Contains("Clinic EZ v2 record changed", StringComparison.OrdinalIgnoreCase));

        // 4. Zero-PHI Conflict Review Report (JSON + CSV)
        var report = await service.BuildReviewReportAsync(binding.Id, SyncConflictStatus.Open, CancellationToken.None);
        report.TotalConflicts.Should().Be(1);
        report.Items.Should().ContainSingle();
        report.Items[0].IsStale.Should().BeTrue();
        report.Items[0].FieldClassifications.Should().Contain(fc => fc.FieldName == "email" && fc.Classification == FieldDiffClassification.Modified);

        var reportJson = JsonSerializer.Serialize(report);
        var reportCsv = ConflictDiffService.FormatReportCsv(report);
        reportJson.Should().NotContain("drifted.v2@example.test");
        reportJson.Should().NotContain("Maria");
        reportCsv.Should().NotContain("drifted.v2@example.test");
        reportCsv.Should().NotContain("Maria");
        reportCsv.Should().Contain("PatientAccount");
        reportCsv.Should().Contain("email:MODIFIED");
    }

    [Fact]
    public async Task Track1_Patient_PatientVitals_And_Track2_SocialHistory_InspectCorrectlyIncludingClinicalNoteRedactionAndDeletedEdgeCases()
    {
        await EnsureExtendedDiffTablesAsync();
        var service = CreateService(allowBreakGlassClinicalNotes: false);

        var v2ClinicId = Guid.NewGuid();
        var t1Binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track1Clinic, "DiffInspectorTrack1", 77, null, "tenant-diff-t1", v2ClinicId),
            "test-admin");
        var t2Binding = await _fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, "DiffInspectorTrack2Social", null, null, null, null, SyncCohortMode.Global),
            "test-admin");

        const int uid = 9201;
        var v2ClinicPatientId = DeterministicUuid.ClinicPatientId(v2ClinicId, uid);
        var v2VitalId = DeterministicUuid.SharedVitalsId(v2ClinicId, 501);
        var v2SocialId = DeterministicUuid.Create(DeterministicUuid.PatientNamespace, $"v1_social_user:{uid}");

        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public."User" (id, "firstName", "lastName", gender, email, "isActive")
            VALUES (9201, 'Carlos', 'Reyes', 'MALE', 'carlos@example.test', true)
            ON CONFLICT (id) DO UPDATE SET "firstName" = 'Carlos', "deletedAt" = NULL, "isActive" = true;

            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId", "deletedAt")
            VALUES (9277, 77, 9201, NULL)
            ON CONFLICT (id) DO UPDATE SET "deletedAt" = NULL;

            INSERT INTO public."VitalSign" (id, "userId", "bpSystolic", "bpDiastolic", "pulseRate", temp, notes, "isActive")
            VALUES (501, 9201, 120, 80, 72, 36.60, 'V1 confidential clinical note text', true)
            ON CONFLICT (id) DO UPDATE SET "bpSystolic" = 120, notes = 'V1 confidential clinical note text', "deletedAt" = NULL, "isActive" = true;

            INSERT INTO public."PersonalHistory" (id, "userId", "smokingStatus", "numberOfPacksPerYear", "alcoholStatus", "illicitDrugUse", "sexuallyActive")
            VALUES (801, 9201, 'CURRENT', 5.0, 'OCCASIONAL', 'NO', 'YES')
            ON CONFLICT (id) DO UPDATE SET "smokingStatus" = 'CURRENT', "deletedAt" = NULL;
            """, v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        await _fx.Track1.ForceSyncEntityAsync(t1Binding, "Patient", uid.ToString(), v2ClinicPatientId, "seed", CancellationToken.None);

        // Seed v2 PatientVitals & PatientSocialHistory rows with edits
        await using (var v2c = await _fx.Connections.OpenClinicDbAsync())
        await using (var cmd = new NpgsqlCommand("""
            UPDATE public."Patients"
            SET "CustomFields" = jsonb_set(COALESCE("CustomFields", '{}'::jsonb), '{student_id}', '"2026-V2-EDIT"'::jsonb)
            WHERE "Id" = @pid;

            INSERT INTO public."PatientVitals" (
                "Id", "PatientId", "RecordedAt", "SystolicBp", "DiastolicBp", "HeartRateBpm",
                "TemperatureCelsius", "Notes", "TenantId", "ClinicId"
            ) VALUES (
                @vid, @pid, now(), 138, 86, 72, 36.60, 'V2 sensitive physician assessment note', 'tenant-diff-t1', @cid
            ) ON CONFLICT ("Id") DO UPDATE SET "SystolicBp" = 138, "Notes" = 'V2 sensitive physician assessment note';
            """, v2c))
        {
            cmd.Parameters.AddWithValue("pid", v2ClinicPatientId);
            cmd.Parameters.AddWithValue("vid", v2VitalId);
            cmd.Parameters.AddWithValue("cid", v2ClinicId);
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var v2p = await _fx.Connections.OpenPatientDbAsync())
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO public.patient_social_histories (
                id, client_id, patient_id, smoking_status, pack_years, alcohol_use, uses_substances, is_sexually_active
            ) VALUES (
                @sid, @sid, @pid, 'FormerSmoker', 5.0, 'Never', false, true
            ) ON CONFLICT (patient_id) DO UPDATE SET smoking_status = 'FormerSmoker', alcohol_use = 'Never';
            """, v2p))
        {
            cmd.Parameters.AddWithValue("sid", v2SocialId);
            cmd.Parameters.AddWithValue("pid", DeterministicUuid.PatientAccountId(uid));
            await cmd.ExecuteNonQueryAsync();
        }

        var t1RunId = await _fx.Ledger.StartRunAsync(t1Binding.Id, SyncRunMode.Incremental, 1, "test-admin");
        await _fx.Ledger.RecordConflictAsync(t1Binding.Id, t1RunId, "Patient", uid.ToString(), v2ClinicPatientId, SyncConflictType.V2Modified, ["customFields"]);
        await _fx.Ledger.RecordConflictAsync(t1Binding.Id, t1RunId, "PatientVitals", "vital:501", v2VitalId, SyncConflictType.V2Modified, ["systolicBp", "diastolicBp", "notes"]);
        await _fx.Ledger.RecordConflictAsync(t1Binding.Id, t1RunId, "UnmappedEntityType", "999", Guid.NewGuid(), SyncConflictType.V2Modified, ["someField"]);
        await _fx.Ledger.CompleteRunAsync(t1RunId, new SyncRunSummary { Track = SyncTrack.Track1Clinic, Mode = SyncRunMode.Incremental });

        var t2RunId = await _fx.Ledger.StartRunAsync(t2Binding.Id, SyncRunMode.Incremental, 1, "test-admin");
        await _fx.Ledger.RecordConflictAsync(t2Binding.Id, t2RunId, "PatientSocialHistory", "801", v2SocialId, SyncConflictType.V2Modified, ["smoking_status", "alcohol_use"]);
        await _fx.Ledger.CompleteRunAsync(t2RunId, new SyncRunSummary { Track = SyncTrack.Track2Patient, Mode = SyncRunMode.Incremental });

        var (t1Conflicts, _) = await _fx.Ledger.ListConflictsAsync(t1Binding.Id, SyncConflictStatus.Open);
        var patientConflict = t1Conflicts.Single(c => c.EntityType == "Patient");
        var vitalsConflict = t1Conflicts.Single(c => c.EntityType == "PatientVitals");
        var unmappedConflict = t1Conflicts.Single(c => c.EntityType == "UnmappedEntityType");

        var (t2Conflicts, _) = await _fx.Ledger.ListConflictsAsync(t2Binding.Id, SyncConflictStatus.Open);
        var socialConflict = t2Conflicts.Single(c => c.EntityType == "PatientSocialHistory");

        // 1. Track 1 Patient includes structured JSON sub-field diff for customFields without leaking raw value in Tier 1
        var patientDetail = await service.GetConflictDetailAsync(
            patientConflict.Id, revealValues: false, reason: null, actor: "admin", mfaVerified: false, CancellationToken.None);
        var cfField = patientDetail.Fields.Should().ContainSingle(f => f.FieldName == "customFields").Subject;
        cfField.Classification.Should().Be(FieldDiffClassification.Modified);
        cfField.SubFieldDiffs.Should().NotBeNull();
        cfField.SubFieldDiffs!.Should().ContainSingle(sf => sf.Key == "student_id" && sf.Classification == FieldDiffClassification.V2FilledEmpty);
        JsonSerializer.Serialize(patientDetail).Should().NotContain("2026-V2-EDIT");

        // 2. Track 1 PatientVitals: measurements revealed on Tier 2 break-glass, but clinical notes remain redacted by policy!
        var vitalsBreakGlass = await service.GetConflictDetailAsync(
            vitalsConflict.Id, revealValues: true, reason: "Checking BP discrepancy during clinic onboarding",
            actor: "dpo@clinicez.test", mfaVerified: true, CancellationToken.None);
        vitalsBreakGlass.ClinicalNotesRedactedByPolicy.Should().BeTrue();
        var sbpField = vitalsBreakGlass.Fields.Should().ContainSingle(f => f.FieldName == "systolicBp").Subject;
        sbpField.V1Value.Should().Be("120");
        sbpField.V2Value.Should().Be("138");
        var noteField = vitalsBreakGlass.Fields.Should().ContainSingle(f => f.FieldName == "notes").Subject;
        noteField.V1Value.Should().BeNull();
        noteField.V2Value.Should().BeNull();
        noteField.V1Preview.Should().Contain("Clinical note");
        JsonSerializer.Serialize(vitalsBreakGlass).Should().NotContain("confidential clinical note");
        JsonSerializer.Serialize(vitalsBreakGlass).Should().NotContain("physician assessment note");

        // 3. Track 2 PatientSocialHistory shows safe enum diffs directly in Tier 1
        var socialDetail = await service.GetConflictDetailAsync(
            socialConflict.Id, revealValues: false, reason: null, actor: "admin", mfaVerified: false, CancellationToken.None);
        var smokeField = socialDetail.Fields.Should().ContainSingle(f => f.FieldName == "smoking_status").Subject;
        smokeField.V1Preview.Should().Be("CurrentSmoker");
        smokeField.V2Preview.Should().Be("FormerSmoker");
        smokeField.Classification.Should().Be(FieldDiffClassification.Modified);

        // 4. Unmapped entity falls back cleanly to METADATA_ONLY
        var unmappedDetail = await service.GetConflictDetailAsync(
            unmappedConflict.Id, revealValues: false, reason: null, actor: "admin", mfaVerified: false, CancellationToken.None);
        unmappedDetail.InspectorMode.Should().Be(ConflictInspectorMode.MetadataOnly);
        unmappedDetail.Note.Should().Contain("UnmappedEntityType");
        unmappedDetail.Fields.Should().ContainSingle(f => f.FieldName == "someField");

        // 5. Soft-deleted v1 edge case flags V1RecordStatus = SOFT_DELETED and IsStale = true on V2_MODIFIED
        await using (var v1 = await _fx.Connections.OpenV1SourceAsync())
        await using (var cmd = new NpgsqlCommand("""UPDATE public."User" SET "deletedAt" = now(), "isActive" = false WHERE id = 9201""", v1))
        {
            await cmd.ExecuteNonQueryAsync();
        }
        var deletedV1Detail = await service.GetConflictDetailAsync(
            patientConflict.Id, revealValues: false, reason: null, actor: "admin", mfaVerified: false, CancellationToken.None);
        deletedV1Detail.V1RecordStatus.Should().Be(ConflictRecordStatus.SoftDeleted);
        deletedV1Detail.IsStale.Should().BeTrue();
        deletedV1Detail.StaleReasons.Should().Contain(r => r.Contains("soft-deleted", StringComparison.OrdinalIgnoreCase));
    }
}
