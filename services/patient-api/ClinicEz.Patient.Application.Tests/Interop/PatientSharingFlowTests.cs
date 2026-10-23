using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareToken;
using ClinicEz.Patient.Application.Features.Sharing.Commands.RevokeAccessGrant;
using ClinicEz.Patient.Application.Features.Sharing.Interop;
using ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessGrants;
using ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessLog;
using ClinicEz.Patient.Application.Tests.Features.Sharing;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Tests.Interop;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

/// <summary>Patient-controlled sharing end to end: the token, redemption by a facility over the hub, grants, revocation and the audit log.</summary>
public sealed class PatientSharingFlowTests
{
    private static async Task<Guid> SeedPatientAsync(PatientInteropHarness h)
    {
        var patientId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId, ClerkUserId = "clerk_1", FirstName = "Juan", LastName = "Dela Cruz",
                Mobile = "+639171234567", Email = "juan@example.test", DateOfBirth = new DateOnly(1990, 1, 2), Sex = SexType.Male,
                Allergies = [new PatientAllergy { AllergenName = "Penicillin", Severity = AllergySeverity.Severe, Reaction = "Rash" }],
                Medications = [new PatientMedication { MedicationName = "Metformin", Dosage = "500 mg", IsCurrentlyTaking = true }],
                GovernmentIds = [new PatientGovernmentId { IdType = GovernmentIdType.PhilHealth, IdNumber = "123456789012" }]
            });
            db.VitalSigns.Add(new VitalSigns { PatientId = patientId, ClinicId = Guid.NewGuid(), RecordedAt = DateTime.UtcNow, SystolicBp = 120, DiastolicBp = 80 });
            await db.SaveChangesAsync();
        });
        return patientId;
    }

    private static string IssueToken(PatientInteropHarness h, Guid patientId, SharingScopes scopes)
    {
        using var scope = h.Provider.CreateScope();
        return scope.ServiceProvider.GetRequiredService<IShareTokenService>().Issue(patientId, scopes, "Consultation").Value;
    }

    private static InteropEnvelope Redeem(Party from, Guid patientId, string token) =>
        InteropEnvelope.Create(
            InteropTypes.PatientShareRedeem, from, PatientInteropHarness.Patient(patientId), Guid.NewGuid(),
            new PatientShareRedeemPayload { ShareToken = token });

    private static async Task<PatientShareSnapshotPayload> SingleSnapshotAsync(PatientInteropHarness h, InteropEnvelope request)
    {
        await h.Relay.RunOnceAsync(default);
        var reply = h.Hub.Sent.Should().ContainSingle(e => e.Type == InteropTypes.PatientShareSnapshot).Subject;
        reply.CorrelationId.Should().Be(request.CorrelationId);
        reply.To.Should().Be(request.From);
        return reply.GetPayload<PatientShareSnapshotPayload>();
    }

    [Fact]
    public async Task Redeeming_a_token_grants_the_facility_logs_it_and_answers_with_only_the_chosen_scopes()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var request = Redeem(PatientInteropHarness.Clinic(clinicId), patientId,
            IssueToken(h, patientId, SharingScopes.Demographics | SharingScopes.Allergies));

        await h.DeliverAsync(request);
        var snapshot = await SingleSnapshotAsync(h, request);

        snapshot.Granted.Should().BeTrue();
        snapshot.PatientId.Should().Be(patientId);
        snapshot.ClinicEzId.Should().MatchRegex("^CE-");
        snapshot.Scopes.Should().Be(SharingScopes.Demographics | SharingScopes.Allergies);
        snapshot.Demographics!.FullName.Should().Be("Juan Dela Cruz");
        snapshot.Demographics.FirstName.Should().Be("Juan");
        snapshot.Demographics.LastName.Should().Be("Dela Cruz");
        snapshot.Demographics.MiddleName.Should().BeNull();
        snapshot.Demographics.Suffix.Should().BeNull();
        snapshot.Demographics.PhilHealthPin.Should().Be("123456789012");
        snapshot.Items.Should().ContainSingle().Which.Should().Match<ShareItemDto>(i => i.Kind == "allergy" && i.Name == "Penicillin");

        var grant = await h.WithDbAsync(db => db.PatientAccessGrants.AsNoTracking().SingleAsync());
        snapshot.GrantId.Should().Be(grant.Id);
        grant.TenantId.Should().Be(PatientInteropHarness.TenantA);
        grant.FacilityId.Should().Be(clinicId);
        grant.Source.Should().Be(AccessGrantSource.Qr);
        grant.Scopes.Should().Be(AccessScopes.Demographics | AccessScopes.Allergies);
        grant.ExpiresAt.Should().BeCloseTo(DateTime.UtcNow.AddHours(24), TimeSpan.FromMinutes(1));
        snapshot.ExpiresAtUtc.Should().Be(grant.ExpiresAt);
        (await h.WithDbAsync(db => db.PatientAccessLogs.AsNoTracking().SingleAsync())).Should()
            .Match<PatientAccessLog>(l => l.GrantId == grant.Id && l.Action == "Redeemed" && l.Detail!.Contains("Allergies"));
    }

    [Fact]
    public async Task A_snapshot_never_contains_a_category_the_patient_did_not_tick()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var request = Redeem(PatientInteropHarness.Clinic(Guid.NewGuid()), patientId, IssueToken(h, patientId, SharingScopes.Vitals));

        await h.DeliverAsync(request);
        var snapshot = await SingleSnapshotAsync(h, request);

        snapshot.Demographics.Should().BeNull();
        snapshot.Items.Should().ContainSingle().Which.Kind.Should().Be("vital");
        snapshot.Items.Select(i => i.Kind).Should().NotContain(new[] { "allergy", "medication" });
    }

    [Fact]
    public async Task A_token_can_be_redeemed_only_once()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var token = IssueToken(h, patientId, SharingScopes.All);
        var first = Redeem(PatientInteropHarness.Clinic(Guid.NewGuid()), patientId, token);
        var replay = Redeem(PatientInteropHarness.Clinic(Guid.NewGuid()), patientId, token);

        await h.DeliverAsync(first);
        await h.DeliverAsync(replay);
        await h.Relay.RunOnceAsync(default);

        var replies = h.Hub.Sent.Where(e => e.Type == InteropTypes.PatientShareSnapshot).ToList();
        replies.Should().HaveCount(2);
        var denied = replies.Single(e => e.CorrelationId == replay.CorrelationId).GetPayload<PatientShareSnapshotPayload>();
        denied.Granted.Should().BeFalse();
        denied.DenialReason.Should().Contain("already used");
        denied.Items.Should().BeEmpty();
        denied.Demographics.Should().BeNull();
        (await h.WithDbAsync(db => db.PatientAccessGrants.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task Redelivery_of_the_same_redeem_message_answers_again_without_a_second_grant()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var request = Redeem(PatientInteropHarness.Clinic(Guid.NewGuid()), patientId, IssueToken(h, patientId, SharingScopes.Allergies));
        var context = new InteropMessageContext(request);
        var payload = request.GetPayload<PatientShareRedeemPayload>();

        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var scope = h.Provider.CreateScope();
            await scope.ServiceProvider.GetRequiredService<PatientShareRedeemInteropHandler>().HandleAsync(payload, context, default);
        }

        await h.Relay.RunOnceAsync(default);
        var replies = h.Hub.Sent.Where(e => e.Type == InteropTypes.PatientShareSnapshot).Select(e => e.GetPayload<PatientShareSnapshotPayload>()).ToList();
        replies.Should().OnlyContain(r => r.Granted);
        replies.Select(r => r.GrantId).Distinct().Should().ContainSingle();
        (await h.WithDbAsync(db => db.PatientAccessGrants.CountAsync())).Should().Be(1);
        (await h.WithDbAsync(db => db.PatientAccessLogs.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task An_expired_token_is_denied_and_creates_no_grant()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var past = new ShareTokenService(
            Options.Create(new SharingOptions { SigningKey = PatientInteropHarness.SigningKey, ShareTokenTtlSeconds = 60 }),
            new ManualTimeProvider(DateTimeOffset.UtcNow.AddHours(-1)));
        var request = Redeem(PatientInteropHarness.Clinic(Guid.NewGuid()), patientId, past.Issue(patientId, SharingScopes.All, "Consultation").Value);

        await h.DeliverAsync(request);
        var snapshot = await SingleSnapshotAsync(h, request);

        snapshot.Granted.Should().BeFalse();
        snapshot.DenialReason.Should().Contain("expired");
        (await h.WithDbAsync(db => db.PatientAccessGrants.CountAsync())).Should().Be(0);
    }

    [Theory]
    [InlineData("garbage")]
    [InlineData("a.b")]
    public async Task A_forged_or_malformed_token_is_denied(string token)
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var request = Redeem(PatientInteropHarness.Clinic(Guid.NewGuid()), patientId, token);

        await h.DeliverAsync(request);
        var snapshot = await SingleSnapshotAsync(h, request);

        snapshot.Granted.Should().BeFalse();
        snapshot.Items.Should().BeEmpty();
        (await h.WithDbAsync(db => db.PatientAccessGrants.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task A_token_for_a_patient_that_no_longer_exists_is_denied()
    {
        using var h = new PatientInteropHarness();
        var ghost = Guid.NewGuid();
        var request = Redeem(PatientInteropHarness.Clinic(Guid.NewGuid()), ghost, IssueToken(h, ghost, SharingScopes.All));

        await h.DeliverAsync(request);
        var snapshot = await SingleSnapshotAsync(h, request);

        snapshot.Granted.Should().BeFalse();
    }

    public static TheoryData<Party> SendersThatCannotBeAnswered => new()
    {
        Party.ForPatient(Guid.NewGuid().ToString()),
        Party.Portal,
        new Party { Kind = PartyKind.Facility, TenantId = PatientInteropHarness.TenantA, FacilityId = "not-a-guid", FacilityType = FacilityType.Clinic },
        new Party { Kind = PartyKind.Facility, TenantId = PatientInteropHarness.TenantA, FacilityId = Guid.NewGuid().ToString() }
    };

    [Theory]
    [MemberData(nameof(SendersThatCannotBeAnswered))]
    public async Task A_sender_that_is_not_an_answerable_facility_is_ignored_and_the_token_stays_unspent(Party sender)
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var request = Redeem(sender, patientId, IssueToken(h, patientId, SharingScopes.All));

        await h.DeliverAsync(request);
        await h.Relay.RunOnceAsync(default);

        h.Hub.Sent.Should().NotContain(e => e.Type == InteropTypes.PatientShareSnapshot);
        (await h.WithDbAsync(db => db.PatientAccessGrants.CountAsync())).Should().Be(0);
        (await h.WithDbAsync(db => db.ShareTokenUses.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Lab_results_and_prescriptions_are_shared_with_their_verification_state()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        await h.WithDbAsync(async db =>
        {
            var report = new LabResultReport
            {
                PatientId = patientId, ReportId = Guid.NewGuid(), LaboratoryName = "MediLab", Title = "CBC", ResultedAt = DateTime.UtcNow,
                Source = ResultProvenance.PatientUploaded, Verification = ResultVerification.Unverified
            };
            db.LabResultReports.Add(report);
            db.LabResults.Add(new LabResult { PatientId = patientId, ClinicId = Guid.NewGuid(), LabResultReportId = report.Id, TestName = "Hemoglobin", Result = "9.1", Unit = "g/dL", Flag = "Low" });
            await db.SaveChangesAsync();
        });
        var request = Redeem(PatientInteropHarness.Clinic(Guid.NewGuid()), patientId, IssueToken(h, patientId, SharingScopes.LabResults));

        await h.DeliverAsync(request);
        var snapshot = await SingleSnapshotAsync(h, request);

        var item = snapshot.Items.Should().ContainSingle().Subject;
        item.Kind.Should().Be("labResult");
        item.Name.Should().Be("CBC");
        item.Detail.Should().Contain("unverified").And.Contain("Hemoglobin 9.1 g/dL (Low)");
    }

    [Fact]
    public async Task The_patient_can_mint_a_token_only_for_known_scopes()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        using var scope = h.Provider.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();

        var issued = await sender.Send(new CreateShareTokenCommand(patientId, ["Allergies", "LabResults"], null));
        var valid = scope.ServiceProvider.GetRequiredService<IShareTokenService>().Validate(issued.Token);
        var empty = () => sender.Send(new CreateShareTokenCommand(patientId, [], null));
        var unknown = () => sender.Send(new CreateShareTokenCommand(patientId, ["allergies", "bank"], null));

        issued.Scopes.Should().Equal("Allergies", "LabResults");
        issued.TtlSeconds.Should().Be(120);
        issued.ClinicEzId.Should().MatchRegex("^CE-");
        issued.Purpose.Should().Be("Consultation");
        valid.Claims!.Scopes.Should().Be(SharingScopes.Allergies | SharingScopes.LabResults);
        await empty.Should().ThrowAsync<Exception>();
        await unknown.Should().ThrowAsync<Exception>();
    }

    [Fact]
    public async Task Revoking_a_grant_marks_it_revoked_and_logs_it_and_another_patient_cannot_revoke_it()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var intruderId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var request = Redeem(PatientInteropHarness.Clinic(clinicId), patientId, IssueToken(h, patientId, SharingScopes.Allergies));
        await h.DeliverAsync(request);
        var grantId = (await h.WithDbAsync(db => db.PatientAccessGrants.AsNoTracking().SingleAsync())).Id;
        using var scope = h.Provider.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();

        var intrusion = () => sender.Send(new RevokeAccessGrantCommand(intruderId, grantId));
        await intrusion.Should().ThrowAsync<NotFoundException>();
        await sender.Send(new RevokeAccessGrantCommand(patientId, grantId));
        await sender.Send(new RevokeAccessGrantCommand(patientId, grantId));

        var grants = await sender.Send(new GetAccessGrantsQuery(patientId));
        grants.Should().ContainSingle().Which.Should().Match<AccessGrantDto>(g => g.Status == "Revoked" && g.RevokedAt != null && g.Source == "Qr");
        var log = await sender.Send(new GetAccessLogQuery(patientId, grantId, 0, 50));
        log.Items.Select(i => i.Action).Should().BeEquivalentTo("Redeemed", RevokeAccessGrantCommandHandler.RevokedAction);
        (await sender.Send(new GetAccessLogQuery(intruderId, null, 0, 50))).TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task Grants_are_listed_newest_first_with_the_facility_name()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Clinics.Add(new Clinic { Id = clinicId, Name = "City Health", TenantId = PatientInteropHarness.TenantA });
            await db.SaveChangesAsync();
        });
        await h.DeliverAsync(Redeem(PatientInteropHarness.Clinic(clinicId), patientId, IssueToken(h, patientId, SharingScopes.Allergies)));
        using var scope = h.Provider.CreateScope();

        var grants = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new GetAccessGrantsQuery(patientId));

        grants.Should().ContainSingle().Which.Should().Match<AccessGrantDto>(g =>
            g.FacilityName == "City Health" && g.Status == "Active" && g.Scopes.Count == 1 && g.Scopes[0] == "Allergies");
    }

    [Fact]
    public async Task Redeeming_a_token_for_patient_with_compound_given_name_and_suffix_populates_discrete_demographics()
    {
        using var h = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId,
                ClerkUserId = "clerk_ely",
                FirstName = "Ely An",
                MiddleName = "Dela",
                LastName = "Maureal",
                Suffix = "Jr.",
                Mobile = "+639171234567",
                Email = "ely@example.test",
                DateOfBirth = new DateOnly(1994, 8, 20),
                Sex = SexType.Male,
                GovernmentIds = [new PatientGovernmentId { IdType = GovernmentIdType.PhilHealth, IdNumber = "123456789012" }]
            });
            await db.SaveChangesAsync();
        });

        var clinicId = Guid.NewGuid();
        var request = Redeem(PatientInteropHarness.Clinic(clinicId), patientId, IssueToken(h, patientId, SharingScopes.Demographics));
        await h.DeliverAsync(request);
        var snapshot = await SingleSnapshotAsync(h, request);

        snapshot.Granted.Should().BeTrue();
        snapshot.Demographics.Should().NotBeNull();
        snapshot.Demographics!.FirstName.Should().Be("Ely An");
        snapshot.Demographics.MiddleName.Should().Be("Dela");
        snapshot.Demographics.LastName.Should().Be("Maureal");
        snapshot.Demographics.Suffix.Should().Be("Jr.");
        snapshot.Demographics.FullName.Should().Be("Ely An Dela Maureal Jr.");
        snapshot.Demographics.DateOfBirth.Should().Be("1994-08-20");
        snapshot.Demographics.Sex.Should().Be("Male");
    }
}
