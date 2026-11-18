using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Seeders;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.DirectoryVerification;

public sealed class DirectoryVerificationTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 11, 18, 9, 0, 0, TimeSpan.Zero));
    private readonly RecordingEmailSender _emailSender = new();
    private readonly Tenant _tenantA;
    private readonly Tenant _tenantB;
    private readonly Facility _clinicA;
    private readonly Facility _clinicB;

    public DirectoryVerificationTests()
    {
        _tenantA = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "alpha-health",
            Name = "Alpha Health Clinic",
            OwnerId = "owner_alpha",
            Email = "owner@alpha.ph",
            City = "Makati",
            Province = "Metro Manila"
        };
        _tenantB = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "beta-health",
            Name = "Beta Medical Center",
            OwnerId = "owner_beta",
            Email = "owner@beta.ph",
            City = "Taguig",
            Province = "Metro Manila"
        };

        _clinicA = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA.Id,
            Name = "Alpha Main Clinic",
            Slug = "alpha-main",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = true,
            City = "Makati",
            Province = "Metro Manila"
        };
        _clinicB = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantB.Id,
            Name = "Beta BGC Clinic",
            Slug = "beta-bgc",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = true,
            City = "Taguig",
            Province = "Metro Manila"
        };

        _context.Tenants.AddRange(_tenantA, _tenantB);
        _context.Facilities.AddRange(_clinicA, _clinicB);
        _context.SaveChanges();
        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private InteropPublisher NewInteropPublisher() => new(_context);

    private TestNotificationService NewNotifications() =>
        new(new ClinicEz.Portal.Infrastructure.Notifications.EmailDispatchJob(
            new ClinicEz.Portal.Application.Features.Notifications.EmailTemplateRenderer(),
            _emailSender,
            NullLogger<ClinicEz.Portal.Infrastructure.Notifications.EmailDispatchJob>.Instance));

    private static FacilityVerificationRequestedPayload BuildFacilityRequestPayload(
        Tenant tenant,
        Facility facility,
        Guid? requestId = null,
        string? ltoKey = "verification/lto/sample.pdf",
        params BundledPractitionerSubmissionDto[] practitioners) => new()
    {
        RequestId = requestId ?? Guid.NewGuid(),
        TenantId = tenant.Id.ToString(),
        FacilityId = facility.Id,
        FacilityName = facility.Name,
        FacilitySlug = facility.Slug,
        Classification = "Primary Care Clinic",
        DohLtoNumber = "DOH-LTO-2026-001",
        LtoEvidenceObjectKey = ltoKey,
        Address = "123 Ayala Ave, Makati",
        ContactNumber = "09171234567",
        ContactEmail = "desk@alpha.ph",
        OperatingHours = "Mon-Sat 08:00-17:00",
        RequestKind = "Initial",
        SubmittedByClinicUserId = "clinic_admin_1",
        SubmittedByDisplayName = "Dr. Alpha Admin",
        SubmittedAtUtc = new DateTime(2026, 11, 18, 8, 30, 0, DateTimeKind.Utc),
        Practitioners = practitioners
    };

    private static BundledPractitionerSubmissionDto BuildBundledDoctor(
        Guid staffId,
        string firstName = "Juan",
        string lastName = "Dela Cruz",
        string prc = "0123456",
        string? contact = "juan.cruz@alpha.ph") => new()
    {
        ClinicStaffMemberId = staffId,
        ProfessionKind = "Doctor",
        FirstName = firstName,
        LastName = lastName,
        Title = "Dr.",
        SubmittedPrcLicenseNo = prc,
        NormalizedPrcLicenseNo = PractitionerIdentity.NormalizePrc(prc) ?? prc,
        PrcExpiryDate = new DateOnly(2028, 12, 31),
        PrcEvidenceObjectKey = $"verification/prc/{staffId:N}.pdf",
        VerificationContact = contact,
        Specialty = "Internal Medicine",
        PublicBio = "Board-certified internist.",
        Availabilities = [new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "17:00", 30)]
    };

    [Fact]
    public async Task PermissionsAndRbacSeeder_AddsDirectoryPermissionsAndDirectoryVerifierRole()
    {
        Assert.Contains(Permissions.ViewVerifications, Permissions.All);
        Assert.Contains(Permissions.VerifyDirectory, Permissions.All);
        Assert.Contains(Permissions.RevokeDirectoryVerification, Permissions.All);
        Assert.Contains(Permissions.Definitions, d => d.Token == Permissions.ViewVerifications);
        Assert.Contains(Permissions.Definitions, d => d.Token == Permissions.VerifyDirectory);
        Assert.Contains(Permissions.Definitions, d => d.Token == Permissions.RevokeDirectoryVerification);

        var seeder = new AdminRBACSeeder(_context);
        await seeder.SeedAsync();

        var verifierRoleId = Guid.Parse("67777777-7777-7777-7777-777777777777");
        var verifierRole = await _context.AdminRoles.FindAsync(verifierRoleId);
        Assert.NotNull(verifierRole);
        Assert.Equal("Directory Verifier", verifierRole.Name);
        Assert.Equal(
            [Permissions.ViewAnalytics, Permissions.ViewTenants, Permissions.ViewVerifications, Permissions.VerifyDirectory],
            verifierRole.Permissions);
        Assert.DoesNotContain(Permissions.RevokeDirectoryVerification, verifierRole.Permissions);

        var verifierUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "clerk_verifier_1",
            Email = "verifier@clinicez.ph",
            FullName = "Directory Reviewer",
            RoleId = verifierRoleId,
            IsActive = true,
            Status = AdminUserStatus.Active
        };
        _context.AdminUsers.Add(verifierUser);
        await _context.SaveChangesAsync();

        var me = await new GetAdminMeQueryHandler(_context)
            .Handle(new GetAdminMeQuery("clerk_verifier_1", null), CancellationToken.None);

        Assert.NotNull(me);
        Assert.Equal("Directory Verifier", me.RoleName);
        Assert.Contains(Permissions.ViewVerifications, me.Permissions);
        Assert.Contains(Permissions.VerifyDirectory, me.Permissions);
        Assert.DoesNotContain(Permissions.RevokeDirectoryVerification, me.Permissions);
    }

    [Fact]
    public async Task FacilityVerificationRequestedHandler_CreatesRequestAndBundledPractitioners_SupersedesPriorAndLogsAudit()
    {
        var handler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        // Spoofed sender from clinic B claiming clinic A is dropped
        var spoofedPayload = BuildFacilityRequestPayload(_tenantA, _clinicA);
        var spoofEnvelope = InteropEnvelope.Create(
            InteropTypes.FacilityVerificationRequested,
            Party.ForFacility(_tenantB.Id.ToString(), _clinicB.Id.ToString(), FacilityType.Clinic),
            Party.Portal,
            spoofedPayload.RequestId,
            spoofedPayload);
        await handler.HandleAsync(spoofedPayload, new InteropMessageContext(spoofEnvelope), CancellationToken.None);
        Assert.Empty(_context.FacilityVerificationRequests);

        // First legitimate submission
        var staffId = Guid.NewGuid();
        var req1Id = Guid.NewGuid();
        var payload1 = BuildFacilityRequestPayload(_tenantA, _clinicA, req1Id, "lto/v1.pdf", BuildBundledDoctor(staffId));
        var validParty = Party.ForFacility(_tenantA.Id.ToString(), _clinicA.Id.ToString(), FacilityType.Clinic);
        await handler.HandleAsync(
            payload1,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, validParty, Party.Portal, req1Id, payload1)),
            CancellationToken.None);

        // Duplicate delivery of req1Id is ignored idempotently
        await handler.HandleAsync(
            payload1,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, validParty, Party.Portal, req1Id, payload1)),
            CancellationToken.None);

        Assert.Single(_context.FacilityVerificationRequests);
        var stored1 = await _context.FacilityVerificationRequests.Include(r => r.PractitionerRequests).SingleAsync();
        Assert.Equal(1, stored1.SubmissionNumber);
        Assert.Equal("PendingReview", stored1.Status);
        Assert.Single(stored1.PractitionerRequests);
        Assert.Equal("0123456", stored1.PractitionerRequests.Single().NormalizedPrcLicenseNo);

        var facility = await _context.Facilities.FindAsync(_clinicA.Id);
        Assert.Equal(PlatformVerificationStatus.PendingReview, facility!.PlatformVerificationStatus);
        Assert.Equal("lto/v1.pdf", facility.LtoEvidenceObjectKey);

        // Second submission supersedes first
        var req2Id = Guid.NewGuid();
        var payload2 = BuildFacilityRequestPayload(_tenantA, _clinicA, req2Id, "lto/v2.pdf", BuildBundledDoctor(staffId));
        await handler.HandleAsync(
            payload2,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, validParty, Party.Portal, req2Id, payload2)),
            CancellationToken.None);

        var reqs = await _context.FacilityVerificationRequests.OrderBy(r => r.SubmissionNumber).ToListAsync();
        Assert.Equal(2, reqs.Count);
        Assert.Equal("Superseded", reqs[0].Status);
        Assert.Equal(req2Id, reqs[0].SupersededByRequestId);
        Assert.Equal("PendingReview", reqs[1].Status);
        Assert.Equal(2, reqs[1].SubmissionNumber);

        var pracReqs = await _context.PractitionerVerificationRequests.OrderBy(p => p.SubmissionNumber).ToListAsync();
        Assert.Equal(2, pracReqs.Count);
        Assert.Equal("Superseded", pracReqs[0].Status);
        Assert.Equal("PendingReview", pracReqs[1].Status);

        var audits = await _context.WorkspaceAuditEntries
            .Where(a => a.TenantId == _tenantA.Id && a.Section == DirectoryVerificationHelper.AuditSection)
            .ToListAsync();
        Assert.Equal(2, audits.Count);
        Assert.All(audits, a => Assert.Equal("facility-submitted", a.Action));
    }

    [Fact]
    public async Task FacilityVerificationWithdrawnHandler_MarksRequestsWithdrawnWithoutDeleting_AndResetsUnverifiedFacility()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);
        var staffId = Guid.NewGuid();
        var reqId = Guid.NewGuid();
        var payload = BuildFacilityRequestPayload(_tenantA, _clinicA, reqId, "lto/v1.pdf", BuildBundledDoctor(staffId));
        var partyA = Party.ForFacility(_tenantA.Id.ToString(), _clinicA.Id.ToString(), FacilityType.Clinic);
        await reqHandler.HandleAsync(
            payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, partyA, Party.Portal, reqId, payload)),
            CancellationToken.None);

        var withdrawHandler = new FacilityVerificationWithdrawnHandler(
            _context, _clock, NullLogger<FacilityVerificationWithdrawnHandler>.Instance);
        var withdrawPayload = new FacilityVerificationWithdrawnPayload
        {
            TenantId = _tenantA.Id.ToString(),
            FacilityId = _clinicA.Id,
            WithdrawnByActor = "owner_alpha",
            Reason = "Updating LTO scan",
            WithdrawnAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        await withdrawHandler.HandleAsync(
            withdrawPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationWithdrawn, partyA, Party.Portal, Guid.NewGuid(), withdrawPayload)),
            CancellationToken.None);

        var req = await _context.FacilityVerificationRequests.SingleAsync(r => r.Id == reqId);
        Assert.Equal("Withdrawn", req.Status);
        Assert.Equal("owner_alpha", req.WithdrawnByActor);
        Assert.Equal("Updating LTO scan", req.WithdrawalReason);
        Assert.NotNull(req.WithdrawnAtUtc);

        var pracReq = await _context.PractitionerVerificationRequests.SingleAsync();
        Assert.Equal("Withdrawn", pracReq.Status);

        var facility = await _context.Facilities.FindAsync(_clinicA.Id);
        Assert.Equal(PlatformVerificationStatus.Unverified, facility!.PlatformVerificationStatus);

        Assert.Contains(_context.WorkspaceAuditEntries, a =>
            a.TenantId == _tenantA.Id
            && a.Section == DirectoryVerificationHelper.AuditSection
            && a.Action == "facility-withdrawn");
    }

    [Fact]
    public async Task PractitionerVerificationRequestedHandler_CleanPrcMatchSetsAwaitingOtpAndSendsEmail_NameConflictFlagsMismatch()
    {
        var verifiedPrac = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0123456",
            DisplayPrcLicenseNo = "0123456",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Title = "Dr.",
            PrimarySpecialty = "Internal Medicine",
            VerificationContact = "dr.juan@alpha.ph",
            VerificationStatus = PractitionerVerificationLevel.Verified,
            VerifiedAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        _context.Practitioners.Add(verifiedPrac);
        await _context.SaveChangesAsync();

        var notifications = NewNotifications();
        var handler = new PractitionerVerificationRequestedHandler(
            _context,
            _clock,
            NullLogger<PractitionerVerificationRequestedHandler>.Instance,
            notifications,
            new FixedFrontendUrl("https://portal.clinicez.test"));

        // 1. Clean compatible name match at Clinic B ("Dr. Juan" vs "Juan") -> AwaitingOtp + email with token + OTP
        var cleanStaffId = Guid.NewGuid();
        var cleanReqId = Guid.NewGuid();
        var cleanPayload = new PractitionerVerificationRequestedPayload
        {
            RequestId = cleanReqId,
            TenantId = _tenantB.Id.ToString(),
            FacilityId = _clinicB.Id,
            FacilityName = _clinicB.Name,
            ClinicStaffMemberId = cleanStaffId,
            RequestKind = "Affiliation",
            ProfessionKind = "Doctor",
            FirstName = "Dr. Juan",
            LastName = "Dela Cruz",
            SubmittedPrcLicenseNo = "PRC-123456",
            NormalizedPrcLicenseNo = "0123456",
            PrcExpiryDate = new DateOnly(2028, 12, 31),
            PrcEvidenceObjectKey = "prc/clean.pdf",
            VerificationContact = "dr.juan@alpha.ph",
            Specialty = "Cardiology",
            SubmittedByClinicUserId = "beta_admin",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        var partyB = Party.ForFacility(_tenantB.Id.ToString(), _clinicB.Id.ToString(), FacilityType.Clinic);
        await handler.HandleAsync(
            cleanPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationRequested, partyB, Party.Portal, cleanReqId, cleanPayload)),
            CancellationToken.None);

        var cleanReq = await _context.PractitionerVerificationRequests.SingleAsync(r => r.Id == cleanReqId);
        Assert.Equal("AwaitingOtp", cleanReq.Status);
        Assert.NotNull(cleanReq.OtpTokenHash);
        Assert.NotNull(cleanReq.OtpExpiresAtUtc);
        Assert.Equal(verifiedPrac.Id, cleanReq.PractitionerId);
        Assert.NotNull(cleanReq.AffiliationId);

        var pendingAff = await _context.PractitionerAffiliations.FindAsync(cleanReq.AffiliationId);
        Assert.NotNull(pendingAff);
        Assert.Equal("AwaitingConfirmation", pendingAff.AffiliationStatus);

        var mail = Assert.Single(_emailSender.Sent);
        Assert.Equal("dr.juan@alpha.ph", mail.To);
        Assert.Contains("/verify/practitioner?token=", mail.TextBody);
        Assert.Contains("/verify/practitioner?token=", mail.HtmlBody);
        Assert.DoesNotContain("/confirm-affiliation", mail.TextBody);
        Assert.DoesNotContain("/confirm-affiliation", mail.HtmlBody);
        var tokenMatch = Regex.Match(mail.TextBody, @"token=([a-f0-9]+)");
        Assert.True(tokenMatch.Success);
        var otpMatch = Regex.Match(mail.TextBody, @"Verification code:\s*(\d{6})");
        Assert.True(otpMatch.Success);

        // Confirm affiliation with wrong OTP fails; valid token + OTP succeeds and emits practitioner.identity.updated
        var confirmHandler = new ConfirmPractitionerAffiliationCommandHandler(_context, NewInteropPublisher(), _clock);
        await Assert.ThrowsAsync<ArgumentException>(() =>
            confirmHandler.Handle(new ConfirmPractitionerAffiliationCommand(tokenMatch.Groups[1].Value, "000000"), CancellationToken.None));

        var confirmResult = await confirmHandler.Handle(
            new ConfirmPractitionerAffiliationCommand(tokenMatch.Groups[1].Value, otpMatch.Groups[1].Value),
            CancellationToken.None);

        Assert.False(confirmResult.AlreadyConfirmed);
        Assert.Equal("Active", confirmResult.AffiliationStatus);
        var confirmedAff = await _context.PractitionerAffiliations.FindAsync(cleanReq.AffiliationId);
        Assert.Equal("Active", confirmedAff!.AffiliationStatus);
        Assert.NotNull(confirmedAff.ConfirmedViaOtpAtUtc);

        var identityMsgs = TestSupport.Outbox(_context, InteropTypes.PractitionerIdentityUpdated);
        Assert.Equal(2, identityMsgs.Count);
        Assert.Contains(identityMsgs, m => m.To.Service == InteropServices.Patient);
        Assert.Contains(identityMsgs, m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == _clinicB.Id.ToString());

        // 2. Conflicting name on same PRC ("Maria Santos" vs "Juan Dela Cruz") -> PendingReview + HasNameMismatch flagged
        var mismatchReqId = Guid.NewGuid();
        var mismatchPayload = cleanPayload with
        {
            RequestId = mismatchReqId,
            ClinicStaffMemberId = Guid.NewGuid(),
            FirstName = "Maria",
            LastName = "Santos",
            VerificationContact = "impostor@beta.ph"
        };
        await handler.HandleAsync(
            mismatchPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationRequested, partyB, Party.Portal, mismatchReqId, mismatchPayload)),
            CancellationToken.None);

        var mismatchReq = await _context.PractitionerVerificationRequests.SingleAsync(r => r.Id == mismatchReqId);
        Assert.Equal("PendingReview", mismatchReq.Status);
        Assert.Null(mismatchReq.OtpTokenHash);

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(mismatchReqId), CancellationToken.None);
        Assert.NotNull(detail);
        Assert.True(detail.HasNameMismatch);
        var candidate = Assert.Single(detail.PrcMatchCandidates);
        Assert.Equal(verifiedPrac.Id, candidate.PractitionerId);
        Assert.False(candidate.IsCompatibleNameMatch);
    }

    [Fact]
    public async Task ApproveRejectSuspendFlow_EmitsExpectedInteropEventsAndAudits()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        var staffId = Guid.NewGuid();
        var facReqId = Guid.NewGuid();
        var facPayload = BuildFacilityRequestPayload(_tenantA, _clinicA, facReqId, "lto/alpha.pdf", BuildBundledDoctor(staffId));
        var partyA = Party.ForFacility(_tenantA.Id.ToString(), _clinicA.Id.ToString(), FacilityType.Clinic);
        await reqHandler.HandleAsync(
            facPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, partyA, Party.Portal, facReqId, facPayload)),
            CancellationToken.None);

        // Approve facility + bundled practitioner
        var approveHandler = new ApproveVerificationRequestCommandHandler(
            _context, TestSupport.ProvisioningPublisher(_context), NewInteropPublisher(), _clock);
        var approved = await approveHandler.Handle(
            new ApproveVerificationRequestCommand(facReqId, "admin_1", "Reviewer One", "LTO and PRC verified."),
            CancellationToken.None);

        Assert.Equal("Approved", approved.Status);
        var approvedPracId = Assert.Single(approved.ApprovedPractitionerIds);

        var facility = await _context.Facilities.FindAsync(_clinicA.Id);
        Assert.Equal(PlatformVerificationStatus.Verified, facility!.PlatformVerificationStatus);
        Assert.NotNull(facility.VerifiedAtUtc);

        var dirOutbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, dirOutbox.Count);
        Assert.All(dirOutbox, m =>
        {
            var p = m.GetPayload<FacilityCreatedEvent>();
            Assert.True(p.IsPublic);
            Assert.True(p.IsPlatformVerified);
            Assert.Equal(DirectorySourceKind.PortalControlPlane, p.DirectorySource);
            Assert.False(p.ReplaceProvidersSnapshot);
        });

        var pracOutbox = TestSupport.Outbox(_context, InteropTypes.PractitionerIdentityUpdated);
        Assert.Equal(2, pracOutbox.Count);
        Assert.All(pracOutbox, m =>
        {
            var p = m.GetPayload<PractitionerIdentityUpdatedPayload>();
            Assert.Equal(approvedPracId, p.PractitionerId);
            Assert.Equal(PractitionerVerificationLevel.Verified, p.VerificationLevel);
            Assert.Equal("Active", p.AffiliationStatus);
        });

        // Suspend practitioner -> suspends practitioner & affiliations + emits practitioner.verification.revoked
        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        await _context.SaveChangesAsync();

        var suspendHandler = new SuspendPractitionerCommandHandler(_context, NewInteropPublisher(), _clock);
        var suspended = await suspendHandler.Handle(
            new SuspendPractitionerCommand(approvedPracId, "admin_1", "Reviewer One", "PRC disciplinary hold"),
            CancellationToken.None);

        Assert.Equal(PractitionerVerificationLevel.Suspended, suspended.Status);
        Assert.Equal(1, suspended.SuspendedAffiliationsCount);

        var revokedMsgs = TestSupport.Outbox(_context, InteropTypes.PractitionerVerificationRevoked);
        Assert.Equal(2, revokedMsgs.Count);
        Assert.All(revokedMsgs, m => Assert.Equal(PractitionerVerificationLevel.Suspended, m.GetPayload<PractitionerVerificationRevokedPayload>().NewStatus));

        // Reject facility request on Clinic B
        var facBReqId = Guid.NewGuid();
        var facBPayload = BuildFacilityRequestPayload(_tenantB, _clinicB, facBReqId, "lto/blurry.pdf");
        var partyB = Party.ForFacility(_tenantB.Id.ToString(), _clinicB.Id.ToString(), FacilityType.Clinic);
        await reqHandler.HandleAsync(
            facBPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, partyB, Party.Portal, facBReqId, facBPayload)),
            CancellationToken.None);

        var rejectHandler = new RejectVerificationRequestCommandHandler(
            _context, TestSupport.ProvisioningPublisher(_context), NewInteropPublisher(), _clock);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            rejectHandler.Handle(new RejectVerificationRequestCommand(facBReqId, "admin_1", "Reviewer One", "   "), CancellationToken.None));

        var rejected = await rejectHandler.Handle(
            new RejectVerificationRequestCommand(facBReqId, "admin_1", "Reviewer One", "DOH LTO document is illegible."),
            CancellationToken.None);

        Assert.Equal("Rejected", rejected.Status);
        var clinicB = await _context.Facilities.FindAsync(_clinicB.Id);
        Assert.Equal(PlatformVerificationStatus.Rejected, clinicB!.PlatformVerificationStatus);
        Assert.Equal("DOH LTO document is illegible.", clinicB.RejectionReason);

        var rejOutbox = TestSupport.Outbox(_context, InteropTypes.FacilityVerificationRejected);
        var rejMsg = Assert.Single(rejOutbox);
        Assert.Equal(_clinicB.Id.ToString(), rejMsg.To.FacilityId);
        Assert.Equal("DOH LTO document is illegible.", rejMsg.GetPayload<FacilityVerificationRejectedPayload>().Reason);

        // Verify audit entries recorded in WorkspaceAuditEntries
        Assert.Contains(_context.WorkspaceAuditEntries, a => a.TenantId == _tenantA.Id && a.Action == "facility-approved");
        Assert.Contains(_context.WorkspaceAuditEntries, a => a.TenantId == _tenantA.Id && a.Action == "practitioner-suspended");
        Assert.Contains(_context.WorkspaceAuditEntries, a => a.TenantId == _tenantB.Id && a.Action == "facility-rejected");
    }

    [Fact]
    public async Task PrcExpirySweeperJob_RevokesOnlyExpiredVerifiedPractitioners()
    {
        var expiredPrac = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0111111",
            DisplayPrcLicenseNo = "0111111",
            FirstName = "Expired",
            LastName = "Doctor",
            PrimarySpecialty = "General Practice",
            PrcExpiryDate = new DateOnly(2026, 11, 17), // yesterday relative to _clock (2026-11-18)
            VerificationStatus = PractitionerVerificationLevel.Verified,
            VerifiedAtUtc = _clock.GetUtcNow().UtcDateTime.AddMonths(-6)
        };
        var validPrac = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Nurse",
            NormalizedPrcLicenseNo = "0222222",
            DisplayPrcLicenseNo = "0222222",
            FirstName = "Valid",
            LastName = "Nurse",
            PrimarySpecialty = "Primary Care Nursing",
            PrcExpiryDate = new DateOnly(2026, 11, 18), // today, not expired yet
            VerificationStatus = PractitionerVerificationLevel.Verified,
            VerifiedAtUtc = _clock.GetUtcNow().UtcDateTime.AddMonths(-6)
        };
        var expiredAff = new PractitionerAffiliation
        {
            Id = Guid.NewGuid(),
            PractitionerId = expiredPrac.Id,
            FacilityId = _clinicA.Id,
            TenantId = _tenantA.Id,
            ClinicStaffMemberId = Guid.NewGuid(),
            Role = "Doctor",
            AffiliationStatus = "Active",
            OptedInAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        var validAff = new PractitionerAffiliation
        {
            Id = Guid.NewGuid(),
            PractitionerId = validPrac.Id,
            FacilityId = _clinicA.Id,
            TenantId = _tenantA.Id,
            ClinicStaffMemberId = Guid.NewGuid(),
            Role = "Nurse",
            AffiliationStatus = "Active",
            OptedInAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        _context.Practitioners.AddRange(expiredPrac, validPrac);
        _context.PractitionerAffiliations.AddRange(expiredAff, validAff);
        await _context.SaveChangesAsync();

        var sweeper = new PrcExpirySweeperJob(
            _context, NewInteropPublisher(), _clock, NullLogger<PrcExpirySweeperJob>.Instance);

        var count = await sweeper.SweepExpiredPrcLicensesAsync();
        Assert.Equal(1, count);

        var storedExpired = await _context.Practitioners.FindAsync(expiredPrac.Id);
        var storedValid = await _context.Practitioners.FindAsync(validPrac.Id);
        Assert.Equal(PractitionerVerificationLevel.Expired, storedExpired!.VerificationStatus);
        Assert.Equal(PractitionerVerificationLevel.Verified, storedValid!.VerificationStatus);

        var storedExpiredAff = await _context.PractitionerAffiliations.FindAsync(expiredAff.Id);
        Assert.Equal("Expired", storedExpiredAff!.AffiliationStatus);

        var revoked = TestSupport.Outbox(_context, InteropTypes.PractitionerVerificationRevoked);
        Assert.Equal(2, revoked.Count);
        Assert.All(revoked, m =>
        {
            var p = m.GetPayload<PractitionerVerificationRevokedPayload>();
            Assert.Equal(expiredPrac.Id, p.PractitionerId);
            Assert.Equal(PractitionerVerificationLevel.Expired, p.NewStatus);
        });
    }

    [Fact]
    public async Task FacilityProvisioningReconciliationJob_BatchThrottlesTo100FacilitiesPerRun()
    {
        await TestSupport.SeedSubscriptionAsync(_context, _tenantA.Id, SubscriptionStatus.Active, "pro");

        for (var i = 0; i < 105; i++)
        {
            _context.Facilities.Add(new Facility
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantA.Id,
                Name = $"Stuck Clinic {i:D3}",
                Slug = $"stuck-clinic-{i:D3}",
                FacilityType = FacilityType.Clinic,
                Status = FacilityStatus.Provisioning,
                CreatedAt = DateTime.UtcNow.AddMinutes(-10)
            });
        }
        await _context.SaveChangesAsync();
        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        await _context.SaveChangesAsync();

        var entitlements = TestSupport.Entitlements(_context);
        var allocations = new FacilityAllocationService(_context);
        var licenseIssuer = new LicenseIssuer(
            new FacilityLicenseSigner(),
            Options.Create(new LicenseOptions()),
            TimeProvider.System);
        var envMock = new Mock<IHostEnvironment>();
        envMock.Setup(e => e.EnvironmentName).Returns("Production");

        var job = new FacilityProvisioningReconciliationJob(
            _context,
            TestSupport.ProvisioningPublisher(_context),
            entitlements,
            allocations,
            licenseIssuer,
            new ConfigurationBuilder().Build(),
            envMock.Object,
            NullLogger<FacilityProvisioningReconciliationJob>.Instance);

        await job.ReconcileStuckFacilitiesAsync();

        var licenseEvents = TestSupport.Outbox(_context, InteropTypes.FacilityLicenseIssued)
            .Where(m => m.To.Service is null)
            .ToList();
        Assert.Equal(100, licenseEvents.Count);
    }

    [Fact]
    public async Task PublicDirectoryEndpoints_FiltersToVerifiedClinicsAndVerifiedActivePractitioners()
    {
        // Clinic A: verified + eligible -> visible; Clinic B: eligible but PendingReview -> hidden
        _clinicA.PlatformVerificationStatus = PlatformVerificationStatus.Verified;
        _clinicA.IsPatientDiscoveryEligible = true;
        _clinicB.PlatformVerificationStatus = PlatformVerificationStatus.PendingReview;
        _clinicB.IsPatientDiscoveryEligible = true;

        var verifiedPrac = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0998877",
            DisplayPrcLicenseNo = "0998877",
            FirstName = "Elena",
            LastName = "Reyes",
            Title = "Dr.",
            PrimarySpecialty = "Pediatrics",
            VerificationStatus = PractitionerVerificationLevel.Verified
        };
        var suspendedPrac = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0776655",
            DisplayPrcLicenseNo = "0776655",
            FirstName = "Suspended",
            LastName = "Doc",
            PrimarySpecialty = "Surgery",
            VerificationStatus = PractitionerVerificationLevel.Suspended
        };

        _context.Practitioners.AddRange(verifiedPrac, suspendedPrac);
        _context.PractitionerAffiliations.AddRange(
            new PractitionerAffiliation
            {
                Id = Guid.NewGuid(),
                PractitionerId = verifiedPrac.Id,
                FacilityId = _clinicA.Id,
                TenantId = _tenantA.Id,
                ClinicStaffMemberId = Guid.NewGuid(),
                Role = "Doctor",
                AffiliationStatus = "Active",
                OptedInAtUtc = DateTime.UtcNow
            },
            new PractitionerAffiliation
            {
                Id = Guid.NewGuid(),
                PractitionerId = verifiedPrac.Id,
                FacilityId = _clinicB.Id,
                TenantId = _tenantB.Id,
                ClinicStaffMemberId = Guid.NewGuid(),
                Role = "Doctor",
                AffiliationStatus = "Active",
                OptedInAtUtc = DateTime.UtcNow
            },
            new PractitionerAffiliation
            {
                Id = Guid.NewGuid(),
                PractitionerId = suspendedPrac.Id,
                FacilityId = _clinicA.Id,
                TenantId = _tenantA.Id,
                ClinicStaffMemberId = Guid.NewGuid(),
                Role = "Doctor",
                AffiliationStatus = "Suspended",
                OptedInAtUtc = DateTime.UtcNow
            });
        await _context.SaveChangesAsync();

        var clinicsRes = Assert.IsAssignableFrom<IValueHttpResult>(await PublicDirectoryEndpoints.GetClinicsAsync(_context));
        var clinics = Assert.IsType<ApiResponse<List<PublicDirectoryClinicDto>>>(clinicsRes.Value).Data!;
        var onlyClinic = Assert.Single(clinics);
        Assert.Equal(_clinicA.Id, onlyClinic.Id);
        Assert.Equal(1, onlyClinic.ProviderCount);

        var providersRes = Assert.IsAssignableFrom<IValueHttpResult>(await PublicDirectoryEndpoints.GetProvidersAsync(_context));
        var providers = Assert.IsType<ApiResponse<List<PublicDirectoryProviderDto>>>(providersRes.Value).Data!;
        var onlyProvider = Assert.Single(providers);
        Assert.Equal(verifiedPrac.Id, onlyProvider.Id);
        Assert.Equal("Dr. Elena Reyes", onlyProvider.Name);
        Assert.Equal(1, onlyProvider.FacilityCount); // only Clinic A is verified
    }

    [Fact]
    public async Task GetFacilitiesQuery_ReturnsVerificationMetadata()
    {
        _clinicA.PlatformVerificationStatus = PlatformVerificationStatus.Rejected;
        _clinicA.RejectionReason = "Expired LTO attachment";
        _clinicA.LtoEvidenceObjectKey = "verification/lto/doc.pdf";
        await _context.SaveChangesAsync();

        var dtos = await new GetFacilitiesQueryHandler(_context, new ConfigurationBuilder().Build())
            .Handle(new GetFacilitiesQuery(_tenantA.TenantSlug), CancellationToken.None);

        var dto = Assert.Single(dtos);
        Assert.Equal(PlatformVerificationStatus.Rejected, dto.PlatformVerificationStatus);
        Assert.Equal("Expired LTO attachment", dto.RejectionReason);
        Assert.Equal("verification/lto/doc.pdf", dto.LtoEvidenceObjectKey);
    }
}
