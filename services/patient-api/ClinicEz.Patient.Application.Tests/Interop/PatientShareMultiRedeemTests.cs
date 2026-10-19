using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareCode;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareToken;
using ClinicEz.Patient.Application.Features.Sharing.Commands.RevokeAccessGrant;
using ClinicEz.Patient.Application.Features.Sharing.Interop;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Patient.Application.Tests.Interop;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

/// <summary>QR tokens that allow several scans, and the manual one-time code: fresh snapshots, grant refresh, access log and throttling.</summary>
public sealed class PatientShareMultiRedeemTests
{
    private static async Task<(Guid Id, string ClinicEzId)> SeedPatientAsync(PatientInteropHarness h)
    {
        var patientId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId, ClerkUserId = "clerk_1", FirstName = "Juan", LastName = "Dela Cruz", Mobile = "+639171234567",
                Allergies = [new PatientAllergy { AllergenName = "Penicillin", Severity = AllergySeverity.Severe }]
            });
            await db.SaveChangesAsync();
        });
        var clinicEzId = await h.WithDbAsync(db => db.Patients.AsNoTracking().Where(p => p.Id == patientId).Select(p => p.ClinicEzId).SingleAsync());
        return (patientId, clinicEzId);
    }

    private static string IssueToken(PatientInteropHarness h, Guid patientId, SharingScopes scopes, int maxRedemptions)
    {
        using var scope = h.Provider.CreateScope();
        return scope.ServiceProvider.GetRequiredService<IShareTokenService>().Issue(patientId, scopes, "Consultation", maxRedemptions).Value;
    }

    private static InteropEnvelope RedeemToken(Party from, Guid patientId, string token) =>
        InteropEnvelope.Create(
            InteropTypes.PatientShareRedeem, from, PatientInteropHarness.Patient(patientId), Guid.NewGuid(),
            new PatientShareRedeemPayload { ShareToken = token });

    private static InteropEnvelope RedeemCode(Party from, string clinicEzId, string code) =>
        InteropEnvelope.Create(
            InteropTypes.PatientShareRedeem, from, Party.ForPatient(Guid.NewGuid().ToString()), Guid.NewGuid(),
            new PatientShareRedeemPayload { ClinicEzId = clinicEzId, Code = code });

    private static async Task<PatientShareSnapshotPayload> ReplyToAsync(PatientInteropHarness h, InteropEnvelope request)
    {
        await h.DeliverAsync(request);
        await h.Relay.RunOnceAsync(default);
        var reply = h.Hub.Sent.Single(e => e.Type == InteropTypes.PatientShareSnapshot && e.CorrelationId == request.CorrelationId);
        reply.To.Should().Be(request.From);
        return reply.GetPayload<PatientShareSnapshotPayload>();
    }

    private static async Task<ShareCodeDto> CreateCodeAsync(PatientInteropHarness h, Guid patientId, params string[] scopes)
    {
        using var scope = h.Provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ISender>().Send(new CreateShareCodeCommand(patientId, scopes, null));
    }

    private static Party Clinic(Guid? id = null) => PatientInteropHarness.Clinic(id ?? Guid.NewGuid());

    // ── multi-redeem ──────────────────────────────────────────────────────────

    [Fact]
    public async Task A_token_with_several_redemptions_gives_each_scan_a_fresh_snapshot_and_refreshes_the_same_grant()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);
        var clinic = Clinic();
        var token = IssueToken(h, patientId, SharingScopes.Allergies, maxRedemptions: 3);

        var first = await ReplyToAsync(h, RedeemToken(clinic, patientId, token));
        await h.WithDbAsync(async db =>
        {
            db.PatientAllergies.Add(new PatientAllergy { PatientId = patientId, AllergenName = "Peanuts", Severity = AllergySeverity.Mild });
            await db.SaveChangesAsync();
        });
        var second = await ReplyToAsync(h, RedeemToken(clinic, patientId, token));

        first.Granted.Should().BeTrue();
        first.RedemptionNumber.Should().Be(1);
        first.MaxRedemptions.Should().Be(3);
        first.IsRefresh.Should().BeFalse();
        first.Items.Select(i => i.Name).Should().Equal("Penicillin");

        second.Granted.Should().BeTrue();
        second.RedemptionNumber.Should().Be(2);
        second.IsRefresh.Should().BeTrue();
        second.GrantId.Should().Be(first.GrantId!.Value);
        second.Items.Select(i => i.Name).Should().BeEquivalentTo("Penicillin", "Peanuts");

        (await h.WithDbAsync(db => db.PatientAccessGrants.CountAsync())).Should().Be(1);
        var log = await h.WithDbAsync(db => db.PatientAccessLogs.AsNoTracking().OrderBy(l => l.CreatedAt).ToListAsync());
        log.Select(l => l.Action).Should().Equal("Redeemed", "Refreshed");
        log[1].Detail.Should().Contain("use 2 of 3");
    }

    [Fact]
    public async Task Different_facilities_each_get_their_own_grant_until_the_redemptions_run_out()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);
        var token = IssueToken(h, patientId, SharingScopes.Allergies, maxRedemptions: 2);

        var a = await ReplyToAsync(h, RedeemToken(Clinic(), patientId, token));
        var b = await ReplyToAsync(h, RedeemToken(Clinic(), patientId, token));
        var c = await ReplyToAsync(h, RedeemToken(Clinic(), patientId, token));

        a.GrantId.Should().NotBe(b.GrantId!.Value);
        b.RedemptionNumber.Should().Be(2);
        b.IsRefresh.Should().BeFalse();
        c.Granted.Should().BeFalse();
        c.DenialCode.Should().Be(ShareDenialCode.Exhausted);
        c.DenialReason.Should().Contain("2 times");
        c.Items.Should().BeEmpty();
        (await h.WithDbAsync(db => db.PatientAccessGrants.CountAsync())).Should().Be(2);
    }

    [Fact]
    public async Task A_single_redemption_token_is_denied_as_exhausted_the_second_time()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);
        var token = IssueToken(h, patientId, SharingScopes.Allergies, maxRedemptions: 1);
        var clinic = Clinic();

        await ReplyToAsync(h, RedeemToken(clinic, patientId, token));
        var again = await ReplyToAsync(h, RedeemToken(clinic, patientId, token));

        again.Granted.Should().BeFalse();
        again.DenialCode.Should().Be(ShareDenialCode.Exhausted);
        again.DenialReason.Should().Contain("already used");
    }

    [Fact]
    public async Task Once_the_patient_revokes_a_facility_it_cannot_refresh_from_the_same_token()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);
        var token = IssueToken(h, patientId, SharingScopes.Allergies, maxRedemptions: 3);
        var clinic = Clinic();
        var first = await ReplyToAsync(h, RedeemToken(clinic, patientId, token));
        using (var scope = h.Provider.CreateScope())
            await scope.ServiceProvider.GetRequiredService<ISender>().Send(new RevokeAccessGrantCommand(patientId, first.GrantId!.Value));

        var after = await ReplyToAsync(h, RedeemToken(clinic, patientId, token));
        var otherClinic = await ReplyToAsync(h, RedeemToken(Clinic(), patientId, token));

        after.Granted.Should().BeFalse();
        after.DenialCode.Should().Be(ShareDenialCode.Revoked);
        otherClinic.Granted.Should().BeTrue("another facility holds no revoked grant");
    }

    [Fact]
    public async Task Redelivery_of_the_same_message_does_not_use_up_a_redemption()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);
        var token = IssueToken(h, patientId, SharingScopes.Allergies, maxRedemptions: 2);
        var request = RedeemToken(Clinic(), patientId, token);
        var context = new InteropMessageContext(request);
        var payload = request.GetPayload<PatientShareRedeemPayload>();

        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var scope = h.Provider.CreateScope();
            await scope.ServiceProvider.GetRequiredService<PatientShareRedeemInteropHandler>().HandleAsync(payload, context, default);
        }

        var other = await ReplyToAsync(h, RedeemToken(Clinic(), patientId, token));

        other.Granted.Should().BeTrue();
        other.RedemptionNumber.Should().Be(2);
        (await h.WithDbAsync(db => db.ShareTokenUses.CountAsync())).Should().Be(2);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(11)]
    public async Task A_token_can_only_allow_one_to_the_configured_maximum_scans(int maxRedemptions)
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);
        using var scope = h.Provider.CreateScope();

        var act = () => scope.ServiceProvider.GetRequiredService<ISender>()
            .Send(new CreateShareTokenCommand(patientId, ["Allergies"], null, maxRedemptions));

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task The_issued_token_reports_and_carries_the_redemption_limit()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);
        using var scope = h.Provider.CreateScope();

        var defaulted = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new CreateShareTokenCommand(patientId, ["Allergies"], null));
        var five = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new CreateShareTokenCommand(patientId, ["Allergies"], null, 5));
        var tokens = scope.ServiceProvider.GetRequiredService<IShareTokenService>();

        defaulted.MaxRedemptions.Should().Be(1);
        five.MaxRedemptions.Should().Be(5);
        tokens.Validate(five.Token).Claims!.MaxRedemptions.Should().Be(5);
    }

    // ── manual one-time code ──────────────────────────────────────────────────

    [Fact]
    public async Task A_code_typed_with_the_clinic_ez_id_grants_a_manual_grant_with_a_snapshot_of_the_chosen_scopes()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicEzId) = await SeedPatientAsync(h);
        var code = await CreateCodeAsync(h, patientId, "Allergies");

        var snapshot = await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, code.Code));

        code.Code.Should().MatchRegex("^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$");
        code.TtlSeconds.Should().Be(600);
        code.ClinicEzId.Should().Be(clinicEzId);
        snapshot.Granted.Should().BeTrue();
        snapshot.PatientId.Should().Be(patientId);
        snapshot.Scopes.Should().Be(SharingScopes.Allergies);
        snapshot.MaxRedemptions.Should().Be(1);
        snapshot.Items.Should().ContainSingle().Which.Name.Should().Be("Penicillin");
        var grant = await h.WithDbAsync(db => db.PatientAccessGrants.AsNoTracking().SingleAsync());
        grant.Source.Should().Be(AccessGrantSource.Manual);
        (await h.WithDbAsync(db => db.PatientAccessLogs.AsNoTracking().SingleAsync())).Detail.Should().Contain("by code");
    }

    [Fact]
    public async Task A_code_is_accepted_in_any_case_and_without_the_hyphen_and_is_stored_only_as_a_hash()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicEzId) = await SeedPatientAsync(h);
        var code = await CreateCodeAsync(h, patientId, "Allergies");

        var snapshot = await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId.ToLowerInvariant(), code.Code.ToLowerInvariant().Replace("-", " ")));

        snapshot.Granted.Should().BeTrue();
        var stored = await h.WithDbAsync(db => db.ShareCodes.AsNoTracking().SingleAsync());
        stored.CodeHash.Should().NotContain(code.Code.Replace("-", string.Empty));
        stored.CodeHash.Should().HaveLength(64);
    }

    [Fact]
    public async Task A_code_works_only_once()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicEzId) = await SeedPatientAsync(h);
        var code = await CreateCodeAsync(h, patientId, "Allergies");

        await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, code.Code));
        var again = await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, code.Code));

        again.Granted.Should().BeFalse();
        again.DenialCode.Should().Be(ShareDenialCode.Exhausted);
    }

    [Fact]
    public async Task An_expired_code_is_denied()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicEzId) = await SeedPatientAsync(h);
        var code = await CreateCodeAsync(h, patientId, "Allergies");
        await h.WithDbAsync(async db =>
        {
            var stored = await db.ShareCodes.SingleAsync();
            stored.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        });

        var snapshot = await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, code.Code));

        snapshot.Granted.Should().BeFalse();
        snapshot.DenialCode.Should().Be(ShareDenialCode.Expired);
        (await h.WithDbAsync(db => db.PatientAccessGrants.CountAsync())).Should().Be(0);
    }

    [Theory]
    [InlineData("CE-0000-0000", "ABCD-EFGH")]
    [InlineData("", "")]
    public async Task A_wrong_code_or_unknown_id_is_denied_without_revealing_the_patient(string clinicEzId, string code)
    {
        using var h = new PatientInteropHarness();
        await SeedPatientAsync(h);

        var snapshot = await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, code));

        snapshot.Granted.Should().BeFalse();
        snapshot.DenialCode.Should().Be(ShareDenialCode.Invalid);
        snapshot.PatientId.Should().BeEmpty();
        snapshot.ClinicEzId.Should().BeEmpty();
    }

    [Fact]
    public async Task A_wrong_code_for_a_real_patient_looks_the_same_but_is_counted()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicEzId) = await SeedPatientAsync(h);
        await CreateCodeAsync(h, patientId, "Allergies");

        var snapshot = await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, "ABCD-EFGH"));

        snapshot.DenialCode.Should().Be(ShareDenialCode.Invalid);
        snapshot.PatientId.Should().BeEmpty();
        (await h.WithDbAsync(db => db.ShareCodeFailures.AsNoTracking().SingleAsync())).PatientId.Should().Be(patientId);
    }

    [Fact]
    public async Task A_facility_that_keeps_guessing_is_rate_limited_even_for_the_right_code()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicEzId) = await SeedPatientAsync(h);
        var code = await CreateCodeAsync(h, patientId, "Allergies");
        var guesser = Clinic();

        for (var attempt = 0; attempt < 5; attempt++)
            (await ReplyToAsync(h, RedeemCode(guesser, clinicEzId, "ABCD-EFGH"))).DenialCode.Should().Be(ShareDenialCode.Invalid);
        var blocked = await ReplyToAsync(h, RedeemCode(guesser, clinicEzId, code.Code));
        var otherFacility = await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, code.Code));

        blocked.Granted.Should().BeFalse();
        blocked.DenialCode.Should().Be(ShareDenialCode.RateLimited);
        otherFacility.Granted.Should().BeTrue("the throttle is per facility until the patient-wide limit is hit");
    }

    [Fact]
    public async Task Guessing_spread_over_many_facilities_is_throttled_per_patient()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicEzId) = await SeedPatientAsync(h);
        var code = await CreateCodeAsync(h, patientId, "Allergies");

        for (var attempt = 0; attempt < 15; attempt++)
            await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, "ABCD-EFGH"));
        var blocked = await ReplyToAsync(h, RedeemCode(Clinic(), clinicEzId, code.Code));

        blocked.DenialCode.Should().Be(ShareDenialCode.RateLimited);
    }

    [Fact]
    public async Task A_patient_cannot_hold_more_than_the_allowed_number_of_live_codes()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);
        for (var i = 0; i < 5; i++)
            await CreateCodeAsync(h, patientId, "Allergies");

        var act = () => CreateCodeAsync(h, patientId, "Allergies");

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_code_needs_known_scopes_and_an_existing_patient()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _) = await SeedPatientAsync(h);

        var empty = () => CreateCodeAsync(h, patientId);
        var unknown = () => CreateCodeAsync(h, patientId, "Allergies", "bank");
        var ghost = () => CreateCodeAsync(h, Guid.NewGuid(), "Allergies");

        await empty.Should().ThrowAsync<ValidationException>();
        await unknown.Should().ThrowAsync<ValidationException>();
        await ghost.Should().ThrowAsync<NotFoundException>();
    }
}
