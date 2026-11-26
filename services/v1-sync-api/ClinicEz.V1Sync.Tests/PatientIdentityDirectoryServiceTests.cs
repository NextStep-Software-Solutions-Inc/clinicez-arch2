using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

[Collection("Pg17Integration")]
public sealed class PatientIdentityDirectoryServiceTests
{
    [Fact]
    public async Task ListAndReconcile_ComputesKpisFiltersDetectsDuplicatesAndWritesZeroPhiAuditLog()
    {
        await using var fx = new Pg17TestFixture();
        await fx.InitializeAsync();

        var pLinked = Guid.NewGuid();
        var pUnlinked = Guid.NewGuid();
        var pReclaimed = Guid.NewGuid();
        var pDup1 = Guid.NewGuid();
        var pDup2 = Guid.NewGuid();

        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
            ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS managed_by_patient_id UUID;

            INSERT INTO public.patients (id, client_id, clerk_user_id, clinic_ez_id, first_name, last_name, email, consent_to_share_info, created_by, updated_by)
            VALUES
                ('{pLinked}', '{pLinked}', 'user_clerk_100', 'CE-1000-AAAA', 'Synth', 'Linked', 'linked@example.test', true, 'System:V1Sync', 'System:V1Sync'),
                ('{pUnlinked}', '{pUnlinked}', NULL, 'CE-2000-BBBB', 'Synth', 'LegacyUnlinked', 'legacy.unlinked@example.test', true, 'System:V1Sync', 'System:V1Sync'),
                ('{pReclaimed}', '{pReclaimed}', 'user_reclaimed_300', 'CE-3000-CCCC', 'Synth', 'Reclaimed', 'reclaimed@example.test', true, 'System:V1Sync', 'System:ClerkEmailReclaim'),
                ('{pDup1}', '{pDup1}', NULL, 'CE-4000-DDDD', 'Synth', 'DupOne', 'shared.dup@example.test', true, 'System:V1Sync', 'System:V1Sync'),
                ('{pDup2}', '{pDup2}', NULL, 'CE-5000-EEEE', 'Synth', 'DupTwo', 'SHARED.DUP@example.test', true, 'System:V1Sync', 'System:V1Sync');
            """);

        // Record v1 -> v2 mapping in sync_id_map for pUnlinked
        var binding = await fx.Ledger.CreateBindingAsync(
            new CreateBindingRequest(SyncTrack.Track2Patient, "Identity Dir Test", 3, 1, "tnt-ustp", Guid.NewGuid(), SyncCohortMode.Scoped),
            "test-admin");
        await fx.Ledger.UpsertIdMapAndHashBatchAsync(
            binding.Id,
            "PatientAccount",
            new[] { ("42001", pUnlinked, "hash-1", "hash-1") },
            CancellationToken.None);

        var svc = new PatientIdentityDirectoryService(fx.Connections, fx.Ledger);

        // 1. List ALL & check KPI summary
        var all = await svc.ListAsync(search: null, statusFilter: "ALL", limit: 25, offset: 0);
        Assert.Equal(5, all.Summary.TotalPrimaryPatients);
        Assert.Equal(2, all.Summary.ClerkLinkedCount);
        Assert.Equal(3, all.Summary.UnlinkedCount);
        Assert.Equal(1, all.Summary.ReclaimedViaEmailCount);
        Assert.Equal(1, all.Summary.AmbiguousDuplicateEmailGroups);
        Assert.Equal(2, all.Summary.AmbiguousDuplicatePatientCount);
        Assert.Equal(5, all.TotalMatching);

        var unlinkedItem = Assert.Single(all.Items, x => x.PatientId == pUnlinked);
        Assert.Equal("Unlinked", unlinkedItem.IdentityStatus);
        Assert.Equal("42001", unlinkedItem.V1UserId);

        // 2. Filter AMBIGUOUS_EMAIL + search
        var ambiguous = await svc.ListAsync(search: "duptwo", statusFilter: "AMBIGUOUS_EMAIL", limit: 10, offset: 0);
        Assert.Equal(1, ambiguous.TotalMatching);
        Assert.Equal(pDup2, Assert.Single(ambiguous.Items).PatientId);

        // 3. Reject auth0|* and duplicate Clerk ID
        await Assert.ThrowsAsync<ArgumentException>(() =>
            svc.ReconcileClerkAsync(pUnlinked, new BindClerkIdentityRequest("BIND_CLERK", "auth0|nope"), "admin@test"));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            svc.ReconcileClerkAsync(pUnlinked, new BindClerkIdentityRequest("BIND_CLERK", "user_clerk_100"), "admin@test"));

        // 4. Valid BIND_CLERK updates patient row & writes zero-PHI audit log
        var bound = await svc.ReconcileClerkAsync(
            pUnlinked,
            new BindClerkIdentityRequest("BIND_CLERK", "user_bound_42001", "Manual verified match"),
            "admin@clinicez.ph");
        Assert.Equal("BIND_CLERK", bound.Action);
        Assert.Equal("user_bound_42001", bound.Item.ClerkUserId);
        Assert.Equal("ClerkLinked", bound.Item.IdentityStatus);
        Assert.Equal("42001", bound.Item.V1UserId);

        // Verify zero-PHI audit log entry in sync_audit_logs
        await using (var syncConn = new NpgsqlConnection(fx.SyncConnectionString))
        {
            await syncConn.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                "SELECT action, actor, details_json::text FROM public.sync_audit_logs WHERE action = 'PATIENT_IDENTITY_BIND_CLERK'",
                syncConn);
            await using var r = await cmd.ExecuteReaderAsync();
            Assert.True(await r.ReadAsync());
            Assert.Equal("PATIENT_IDENTITY_BIND_CLERK", r.GetString(0));
            Assert.Equal("admin@clinicez.ph", r.GetString(1));
            var details = r.GetString(2);
            Assert.Contains("CE-2000-BBBB", details);
            Assert.DoesNotContain("LegacyUnlinked", details);
            Assert.DoesNotContain("legacy.unlinked@example.test", details);
        }

        // 5. UNBIND_CLERK reverts cleanly
        var unbound = await svc.ReconcileClerkAsync(
            pUnlinked,
            new BindClerkIdentityRequest("UNBIND_CLERK", null, "Reset binding"),
            "admin@clinicez.ph");
        Assert.Null(unbound.Item.ClerkUserId);
        Assert.Equal("Unlinked", unbound.Item.IdentityStatus);
    }
}
