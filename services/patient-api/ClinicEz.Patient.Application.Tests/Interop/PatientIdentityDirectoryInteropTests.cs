using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientByClerkId;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMe;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Patient.Infrastructure.Services.Home;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Interop;

public sealed class PatientIdentityDirectoryInteropTests
{
    [Fact]
    public async Task DirectoryRequest_FromPortal_ReturnsAccurateKpisFiltersAndExcludesDependentsAndDeleted()
    {
        using var harness = new PatientInteropHarness();

        var pClerk = NewPatient("CE-1111-AAAA", "user_clerk_1", "Ana", "Reyes", "ana@example.test", "System:V1Sync");
        var pUnlinked = NewPatient("CE-2222-BBBB", null, "Ben", "Santos", "ben@example.test", "System:V1Sync");
        var pReclaimed = NewPatient("CE-3333-CCCC", "user_reclaimed_3", "Cara", "Cruz", "cara@example.test", "System:ClerkEmailReclaim");
        var pDup1 = NewPatient("CE-4444-DDDD", null, "Dan", "Lopez", "dup@example.test", "System:V1Sync");
        var pDup2 = NewPatient("CE-5555-EEEE", null, "Dana", "Lopez", "DUP@example.test", "System:V1Sync");
        var pDependent = NewPatient("CE-6666-FFFF", null, "Child", "Reyes", "child@example.test", "user_clerk_1");
        pDependent.ManagedByPatientId = pClerk.Id;
        var pDeleted = NewPatient("CE-7777-GGGG", null, "Gone", "User", "gone@example.test", "System:V1Sync");
        pDeleted.IsDeleted = true;

        await harness.WithDbAsync(async db =>
        {
            db.Patients.AddRange(pClerk, pUnlinked, pReclaimed, pDup1, pDup2, pDependent, pDeleted);
            await db.SaveChangesAsync();
        });

        var corrId = Guid.NewGuid();
        var req = InteropEnvelope.Create(
            InteropTypes.PatientIdentityDirectoryRequested,
            Party.Portal,
            Party.PatientPlane,
            corrId,
            new PatientIdentityDirectoryRequestedPayload { StatusFilter = PatientIdentityFilter.All, Limit = 25, Offset = 0 });

        await harness.DeliverAsync(req);
        await harness.Relay.RunOnceAsync(default);

        var replyEnv = harness.Hub.Sent
            .Should().ContainSingle(e => e.Type == InteropTypes.PatientIdentityDirectoryResponded && e.CorrelationId == corrId)
            .Subject;

        var reply = replyEnv.GetPayload<PatientIdentityDirectoryRespondedPayload>();
        reply.Succeeded.Should().BeTrue();
        reply.Summary.TotalPrimaryPatients.Should().Be(5);
        reply.Summary.ClerkLinkedCount.Should().Be(2);
        reply.Summary.UnlinkedCount.Should().Be(3);
        reply.Summary.ReclaimedViaEmailCount.Should().Be(1);
        reply.Summary.AmbiguousDuplicateEmailGroups.Should().Be(1);
        reply.Summary.AmbiguousDuplicatePatientCount.Should().Be(2);
        reply.TotalMatching.Should().Be(5);
        reply.Items.Should().HaveCount(5);

        reply.Items.Single(x => x.PatientId == pClerk.Id).IdentityStatus.Should().Be(PatientIdentityStatus.ClerkLinked);
        reply.Items.Single(x => x.PatientId == pUnlinked.Id).IdentityStatus.Should().Be(PatientIdentityStatus.Unlinked);
        reply.Items.Single(x => x.PatientId == pReclaimed.Id).IdentityStatus.Should().Be(PatientIdentityStatus.Reclaimed);
        reply.Items.Single(x => x.PatientId == pDup1.Id).IdentityStatus.Should().Be(PatientIdentityStatus.AmbiguousEmail);
        reply.Items.Single(x => x.PatientId == pDup2.Id).DuplicateEmailCount.Should().Be(2);

        // Filter by AMBIGUOUS_EMAIL + search
        var corrId2 = Guid.NewGuid();
        await harness.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PatientIdentityDirectoryRequested,
            Party.Portal,
            Party.PatientPlane,
            corrId2,
            new PatientIdentityDirectoryRequestedPayload
            {
                StatusFilter = PatientIdentityFilter.AmbiguousEmail,
                Search = "dana",
                Limit = 10,
                Offset = 0
            }));
        await harness.Relay.RunOnceAsync(default);

        var reply2 = harness.Hub.Sent
            .Single(e => e.Type == InteropTypes.PatientIdentityDirectoryResponded && e.CorrelationId == corrId2)
            .GetPayload<PatientIdentityDirectoryRespondedPayload>();

        reply2.TotalMatching.Should().Be(1);
        reply2.Items.Should().ContainSingle().Which.PatientId.Should().Be(pDup2.Id);
    }

    [Fact]
    public async Task DirectoryAndReconcile_FromNonPortalSender_AreRejectedUnauthorized()
    {
        using var harness = new PatientInteropHarness();
        var patient = NewPatient("CE-8888-HHHH", null, "Test", "Patient", "test@example.test", "System:V1Sync");
        await harness.WithDbAsync(async db =>
        {
            db.Patients.Add(patient);
            await db.SaveChangesAsync();
        });

        var rogueClinic = PatientInteropHarness.Clinic(Guid.NewGuid());
        var corrDir = Guid.NewGuid();
        await harness.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PatientIdentityDirectoryRequested,
            rogueClinic,
            Party.PatientPlane,
            corrDir,
            new PatientIdentityDirectoryRequestedPayload()));
        await harness.Relay.RunOnceAsync(default);

        var dirReply = harness.Hub.Sent
            .Single(e => e.Type == InteropTypes.PatientIdentityDirectoryResponded && e.CorrelationId == corrDir)
            .GetPayload<PatientIdentityDirectoryRespondedPayload>();
        dirReply.Succeeded.Should().BeFalse();
        dirReply.ErrorCode.Should().Be("UNAUTHORIZED");
        dirReply.Items.Should().BeEmpty();

        var corrRec = Guid.NewGuid();
        await harness.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PatientIdentityReconcileRequested,
            rogueClinic,
            Party.PatientPlane,
            corrRec,
            new PatientIdentityReconcileRequestedPayload
            {
                PatientId = patient.Id,
                Action = PatientIdentityReconcileAction.BindClerk,
                ClerkUserId = "user_rogue_bind",
                Actor = "attacker"
            }));
        await harness.Relay.RunOnceAsync(default);

        var recReply = harness.Hub.Sent
            .Single(e => e.Type == InteropTypes.PatientIdentityReconcileResponded && e.CorrelationId == corrRec)
            .GetPayload<PatientIdentityReconcileRespondedPayload>();
        recReply.Succeeded.Should().BeFalse();
        recReply.ErrorCode.Should().Be("UNAUTHORIZED");

        await harness.WithDbAsync(async db =>
        {
            var stored = await db.Patients.AsNoTracking().SingleAsync(p => p.Id == patient.Id);
            stored.ClerkUserId.Should().BeNull();
        });
    }

    [Fact]
    public async Task Reconcile_BindAndUnbindClerk_EnforcesPrefixUniquenessAndAtomicPersistence()
    {
        using var harness = new PatientInteropHarness();
        var existingLinked = NewPatient("CE-9001-AAAA", "user_taken_1", "Taken", "One", "taken@example.test", "seed");
        var unlinked = NewPatient("CE-9002-BBBB", null, "Legacy", "Two", "legacy@example.test", "System:V1Sync");

        await harness.WithDbAsync(async db =>
        {
            db.Patients.AddRange(existingLinked, unlinked);
            await db.SaveChangesAsync();
        });

        // 1. Reject auth0|* identifier
        var corrInvalid = Guid.NewGuid();
        await harness.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PatientIdentityReconcileRequested,
            Party.Portal,
            Party.PatientPlane,
            corrInvalid,
            new PatientIdentityReconcileRequestedPayload
            {
                PatientId = unlinked.Id,
                Action = PatientIdentityReconcileAction.BindClerk,
                ClerkUserId = "auth0|forbidden",
                Actor = "admin@clinicez.ph"
            }));
        await harness.Relay.RunOnceAsync(default);
        harness.Hub.Sent
            .Single(e => e.Type == InteropTypes.PatientIdentityReconcileResponded && e.CorrelationId == corrInvalid)
            .GetPayload<PatientIdentityReconcileRespondedPayload>()
            .ErrorCode.Should().Be("VALIDATION_ERROR");

        // 2. Reject duplicate Clerk ID already held by another patient
        var corrConflict = Guid.NewGuid();
        await harness.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PatientIdentityReconcileRequested,
            Party.Portal,
            Party.PatientPlane,
            corrConflict,
            new PatientIdentityReconcileRequestedPayload
            {
                PatientId = unlinked.Id,
                Action = PatientIdentityReconcileAction.BindClerk,
                ClerkUserId = "user_taken_1",
                Actor = "admin@clinicez.ph"
            }));
        await harness.Relay.RunOnceAsync(default);
        harness.Hub.Sent
            .Single(e => e.Type == InteropTypes.PatientIdentityReconcileResponded && e.CorrelationId == corrConflict)
            .GetPayload<PatientIdentityReconcileRespondedPayload>()
            .ErrorCode.Should().Be("CONFLICT");

        // 3. Valid BIND_CLERK succeeds and commits atomically
        var corrBind = Guid.NewGuid();
        await harness.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PatientIdentityReconcileRequested,
            Party.Portal,
            Party.PatientPlane,
            corrBind,
            new PatientIdentityReconcileRequestedPayload
            {
                PatientId = unlinked.Id,
                Action = PatientIdentityReconcileAction.BindClerk,
                ClerkUserId = "user_verified_9002",
                Actor = "admin@clinicez.ph",
                Reason = "Verified legacy student ID"
            }));
        await harness.Relay.RunOnceAsync(default);

        var bindReply = harness.Hub.Sent
            .Single(e => e.Type == InteropTypes.PatientIdentityReconcileResponded && e.CorrelationId == corrBind)
            .GetPayload<PatientIdentityReconcileRespondedPayload>();
        bindReply.Succeeded.Should().BeTrue();
        bindReply.Item!.ClerkUserId.Should().Be("user_verified_9002");
        bindReply.Item.IdentityStatus.Should().Be(PatientIdentityStatus.ClerkLinked);
        bindReply.Item.UpdatedBy.Should().StartWith("AdminReconcile:admin@clinicez.ph");

        // 4. UNBIND_CLERK clears ClerkUserId cleanly
        var corrUnbind = Guid.NewGuid();
        await harness.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PatientIdentityReconcileRequested,
            Party.Portal,
            Party.PatientPlane,
            corrUnbind,
            new PatientIdentityReconcileRequestedPayload
            {
                PatientId = unlinked.Id,
                Action = PatientIdentityReconcileAction.UnbindClerk,
                Actor = "admin@clinicez.ph",
                Reason = "Re-linking to corrected Clerk account"
            }));
        await harness.Relay.RunOnceAsync(default);

        var unbindReply = harness.Hub.Sent
            .Single(e => e.Type == InteropTypes.PatientIdentityReconcileResponded && e.CorrelationId == corrUnbind)
            .GetPayload<PatientIdentityReconcileRespondedPayload>();
        unbindReply.Succeeded.Should().BeTrue();
        unbindReply.Item!.ClerkUserId.Should().BeNull();
        unbindReply.Item.IdentityStatus.Should().Be(PatientIdentityStatus.Unlinked);
    }

    [Fact]
    public async Task ReclaimedLegacyAccount_SetsIsLegacyAccountReclaimedAcrossByClerkIdMeAndHomeDashboard()
    {
        using var harness = new PatientInteropHarness();
        var legacy = NewPatient("CE-9100-RECL", null, "Maria", "Legacy", "maria.legacy@ustp.edu.ph", "System:V1Sync");
        var normal = NewPatient("CE-9101-NORM", "user_normal_1", "Jose", "Normal", "jose.normal@ustp.edu.ph", "user_normal_1");

        await harness.WithDbAsync(async db =>
        {
            db.Patients.AddRange(legacy, normal);
            await db.SaveChangesAsync();
        });

        using var scope = harness.Provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var repo = new PatientRepository(db);
        var uow = new UnitOfWork(db);

        // First sign-in via verified email reclaims legacy account and surfaces IsLegacyAccountReclaimed == true
        var byClerkHandler = new GetPatientByClerkIdQueryHandler(repo, uow);
        var reclaimedSummary = await byClerkHandler.Handle(
            new GetPatientByClerkIdQuery("user_new_maria", new[] { "maria.legacy@ustp.edu.ph" }),
            CancellationToken.None);

        reclaimedSummary.Should().NotBeNull();
        reclaimedSummary!.Id.Should().Be(legacy.Id);
        reclaimedSummary.IsLegacyAccountReclaimed.Should().BeTrue();

        var normalSummary = await byClerkHandler.Handle(
            new GetPatientByClerkIdQuery("user_normal_1"),
            CancellationToken.None);
        normalSummary!.IsLegacyAccountReclaimed.Should().BeFalse();

        var meHandler = new GetPatientMeQueryHandler(repo, uow);
        var meDto = await meHandler.Handle(new GetPatientMeQuery("user_new_maria"), CancellationToken.None);
        meDto!.IsLegacyAccountReclaimed.Should().BeTrue();

        var homeService = new PatientHomeService(db, TimeProvider.System);
        var legacyHome = await homeService.GetHomeDashboardAsync(legacy.Id, CancellationToken.None);
        legacyHome.HealthPass.IsLegacyAccountReclaimed.Should().BeTrue();

        var normalHome = await homeService.GetHomeDashboardAsync(normal.Id, CancellationToken.None);
        normalHome.HealthPass.IsLegacyAccountReclaimed.Should().BeFalse();
    }

    private static Domain.Entities.Patient NewPatient(
        string clinicEzId,
        string? clerkUserId,
        string firstName,
        string lastName,
        string? email,
        string updatedBy) => new()
        {
            Id = Guid.NewGuid(),
            ClientId = Guid.NewGuid(),
            ClinicEzId = clinicEzId,
            ClerkUserId = clerkUserId,
            FirstName = firstName,
            LastName = lastName,
            Email = email,
            ConsentToShareInfo = true,
            CreatedAt = DateTime.UtcNow.AddDays(-5),
            CreatedBy = "System:V1Sync",
            UpdatedAt = DateTime.UtcNow.AddDays(-1),
            UpdatedBy = updatedBy
        };
}
