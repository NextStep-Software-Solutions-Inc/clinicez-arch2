using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.DirectoryVerification;

public sealed class DirectoryVerificationSyncAndEnrichmentTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 11, 19, 10, 0, 0, TimeSpan.Zero));
    private readonly RecordingEmailSender _emailSender = new();
    private readonly Tenant _tenant;
    private readonly Branch _branch;
    private readonly Facility _facility;

    public DirectoryVerificationSyncAndEnrichmentTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "gamma-care",
            Name = "Gamma Care Network",
            OwnerId = "user_3KGownerGamma123",
            FirstName = "Gabriel",
            LastName = "Reyes",
            Email = "owner@gammacare.ph",
            PhoneNumber = "+639171112233"
        };

        _branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Main Branch",
            Code = "MAIN-01",
            ContactNumber = "+63288887777",
            ContactEmail = "branch@gammacare.ph",
            PhilHealthAccreditationNumber = "PHIC-BRANCH-001",
            IsPhilHealthAccredited = true,
            IsActive = true
        };

        _facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            BranchId = _branch.Id,
            Name = "Gamma Main Clinic",
            Slug = "gamma-main",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = true,
            City = "Quezon City",
            Province = "Metro Manila"
        };

        _context.Tenants.Add(_tenant);
        _context.Branches.Add(_branch);
        _context.Facilities.Add(_facility);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private DirectoryVerificationPendingUpdater CreateUpdater(TestNotificationService? notifications = null) =>
        new(
            _context,
            _clock,
            NullLogger<DirectoryVerificationPendingUpdater>.Instance,
            notifications,
            new FixedFrontendUrl("https://portal.clinicez.test"));

    private TestNotificationService NewNotifications() =>
        new(new ClinicEz.Portal.Infrastructure.Notifications.EmailDispatchJob(
            new ClinicEz.Portal.Application.Features.Notifications.EmailTemplateRenderer(),
            _emailSender,
            NullLogger<ClinicEz.Portal.Infrastructure.Notifications.EmailDispatchJob>.Instance));

    private Party FacilityParty() =>
        Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic);

    private static BundledPractitionerSubmissionDto BundledDoctor(
        Guid staffId,
        string firstName = "Juan",
        string lastName = "Dela Cruz",
        string prc = "0123456",
        string specialty = "Internal Medicine",
        string? proofKey = null) => new()
    {
        ClinicStaffMemberId = staffId,
        ProfessionKind = "Doctor",
        FirstName = firstName,
        LastName = lastName,
        Title = "Dr.",
        SubmittedPrcLicenseNo = prc,
        NormalizedPrcLicenseNo = PractitionerIdentity.NormalizePrc(prc) ?? prc,
        PrcExpiryDate = new DateOnly(2028, 12, 31),
        PrcEvidenceObjectKey = proofKey ?? $"verification/prc/{staffId:N}.pdf",
        VerificationContact = "juan@gammacare.ph",
        Specialty = specialty,
        PublicBio = "Experienced physician.",
        Availabilities = [new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "17:00", 30)]
    };

    [Fact]
    public async Task FacilityUpdateResponder_UpdatesPendingInPlaceReconcilesChildrenAndRejectsSpoofedOrNonPending()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        var staffKeepId = Guid.NewGuid();
        var staffRemoveId = Guid.NewGuid();
        var staffApprovedId = Guid.NewGuid();
        var staffNewId = Guid.NewGuid();
        var reqId = Guid.NewGuid();

        var initialPayload = new FacilityVerificationRequestedPayload
        {
            RequestId = reqId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            FacilitySlug = _facility.Slug,
            Classification = "Primary Care Clinic",
            DohLtoNumber = "DOH-LTO-001",
            DohLtoExpiryDate = new DateOnly(2027, 1, 15),
            LtoEvidenceObjectKey = "lto/v1.pdf",
            Address = "100 Commonwealth Ave, QC",
            ContactNumber = "09170000001",
            ContactEmail = "v1@gammacare.ph",
            OperatingHours = "Mon-Fri 08:00-17:00",
            PhilHealthAccreditationNumber = "PHIC-001",
            IsPhilHealthAccredited = true,
            SupportsInPerson = true,
            SupportsTeleconsult = false,
            RequestKind = "Initial",
            SubmittedByClinicUserId = "user_submitter_1",
            SubmittedByDisplayName = "Dr. Gab Reyes",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Services = [new ClinicServiceDto(Guid.NewGuid(), "General Consultation", "Consultation", 500m)],
            Practitioners =
            [
                BundledDoctor(staffKeepId, "Juan", "Dela Cruz", "0111111"),
                BundledDoctor(staffRemoveId, "Pedro", "Penduko", "0222222"),
                BundledDoctor(staffApprovedId, "Ana", "Santos", "0333333")
            ]
        };

        await reqHandler.HandleAsync(
            initialPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, reqId, initialPayload)),
            CancellationToken.None);

        // Pre-approve staffApprovedId so we verify reviewed children remain immutable during facility update
        var approvedChild = await _context.PractitionerVerificationRequests
            .SingleAsync(r => r.FacilityVerificationRequestId == reqId && r.ClinicStaffMemberId == staffApprovedId);
        approvedChild.Status = "Approved";
        approvedChild.ReviewedAtUtc = _clock.GetUtcNow().UtcDateTime;

        // Also seed a standalone pending row for staffNewId so we verify bundling supersedes it
        var standaloneId = Guid.NewGuid();
        _context.PractitionerVerificationRequests.Add(new PractitionerVerificationRequest
        {
            Id = standaloneId,
            TenantId = _tenant.Id,
            FacilityId = _facility.Id,
            ClinicStaffMemberId = staffNewId,
            SubmissionNumber = 1,
            CorrelationId = standaloneId.ToString(),
            RequestKind = "Initial",
            ProfessionKind = "Doctor",
            SubmittedPrcLicenseNo = "0444444",
            NormalizedPrcLicenseNo = "0444444",
            SubmittedSnapshotJson = "{}",
            Status = "PendingReview",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        });
        await _context.SaveChangesAsync();

        var updater = CreateUpdater();
        var responder = new FacilityVerificationUpdateRequestedResponder(
            updater, NullLogger<FacilityVerificationUpdateRequestedResponder>.Instance);

        // 1. Spoofed sender rejected without conflict flag
        var spoofParty = Party.ForFacility(Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), FacilityType.Clinic);
        var updatePayload = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = "Gamma Main Updated",
            FacilitySlug = "gamma-main",
            Classification = "Ambulatory Surgical Clinic",
            DohLtoNumber = "DOH-LTO-002",
            DohLtoExpiryDate = new DateOnly(2028, 6, 30),
            LtoEvidenceObjectKey = "lto/v2.pdf",
            Address = "200 Commonwealth Ave, QC",
            ContactNumber = "09179998888",
            ContactEmail = "v2@gammacare.ph",
            OperatingHours = "Mon-Sat 08:00-19:00",
            IsOnlineBookingPaused = false,
            PhilHealthAccreditationNumber = "PHIC-002",
            IsPhilHealthAccredited = true,
            SupportsInPerson = true,
            SupportsTeleconsult = true,
            SubmittedByClinicUserId = "user_submitter_1",
            SubmittedByDisplayName = "Dr. Gab Reyes",
            ExpectedRequestId = reqId,
            ExpectedStatus = "PendingReview",
            Services =
            [
                new ClinicServiceDto(Guid.NewGuid(), "General Consultation", "Consultation", 600m),
                new ClinicServiceDto(Guid.NewGuid(), "Teleconsultation", "Telehealth", 450m)
            ],
            Practitioners =
            [
                BundledDoctor(staffKeepId, "Juan", "Dela Cruz", "0111111", "Cardiology", "verification/prc/juan-v2.pdf"),
                BundledDoctor(staffNewId, "Elena", "Bautista", "0444444", "Pediatrics")
            ]
        };

        var spoofRes = await responder.RespondAsync(
            updatePayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, spoofParty, Party.Portal, Guid.NewGuid(), updatePayload)),
            CancellationToken.None);
        Assert.False(spoofRes.Succeeded);
        Assert.False(spoofRes.Conflict);
        Assert.Equal("unauthorized_sender", spoofRes.ErrorCode);

        // 2. Valid in-place update
        _clock.Advance(TimeSpan.FromMinutes(15));
        var updateRes = await responder.RespondAsync(
            updatePayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), updatePayload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.True(updateRes.Succeeded);
        Assert.False(updateRes.Conflict);
        Assert.Equal(reqId, updateRes.RequestId);
        Assert.Equal("PendingReview", updateRes.CurrentStatus);
        Assert.Equal(_clock.GetUtcNow().UtcDateTime, updateRes.UpdatedAtUtc);

        // Zero duplicate facility requests created
        var allFacReqs = await _context.FacilityVerificationRequests.Where(r => r.FacilityId == _facility.Id).ToListAsync();
        var storedFacReq = Assert.Single(allFacReqs);
        Assert.Equal(1, storedFacReq.SubmissionNumber);
        Assert.Equal("PendingReview", storedFacReq.Status);
        Assert.Equal("lto/v2.pdf", storedFacReq.LtoEvidenceObjectKey);
        Assert.Equal(_clock.GetUtcNow().UtcDateTime, storedFacReq.UpdatedAt);

        var updatedFacility = await _context.Facilities.FindAsync(_facility.Id);
        Assert.Equal(new DateOnly(2028, 6, 30), updatedFacility!.LtoExpiryDate);
        Assert.Equal("PHIC-002", updatedFacility.PhilHealthAccreditationNumber);
        Assert.Equal("lto/v2.pdf", updatedFacility.LtoEvidenceObjectKey);

        var snap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(storedFacReq.SubmittedSnapshotJson)!;
        Assert.True(snap.SupportsTeleconsult);
        Assert.Equal(2, snap.Services.Count);

        // Reconciled children: kept updated, removed withdrawn, approved untouched, new created + standalone superseded
        var keepChild = await _context.PractitionerVerificationRequests
            .SingleAsync(r => r.FacilityVerificationRequestId == reqId && r.ClinicStaffMemberId == staffKeepId);
        Assert.Equal("PendingReview", keepChild.Status);
        Assert.Equal("verification/prc/juan-v2.pdf", keepChild.PrcEvidenceObjectKey);

        var removedChild = await _context.PractitionerVerificationRequests
            .SingleAsync(r => r.FacilityVerificationRequestId == reqId && r.ClinicStaffMemberId == staffRemoveId);
        Assert.Equal("Withdrawn", removedChild.Status);

        var stillApprovedChild = await _context.PractitionerVerificationRequests.FindAsync(approvedChild.Id);
        Assert.Equal("Approved", stillApprovedChild!.Status);

        var supersededStandalone = await _context.PractitionerVerificationRequests.FindAsync(standaloneId);
        Assert.Equal("Superseded", supersededStandalone!.Status);

        var newChild = await _context.PractitionerVerificationRequests
            .SingleAsync(r => r.FacilityVerificationRequestId == reqId && r.ClinicStaffMemberId == staffNewId);
        Assert.Equal("PendingReview", newChild.Status);
        Assert.Equal(2, newChild.SubmissionNumber);

        // 3. Once Approved (or Rejected/Withdrawn/Superseded), update returns Conflict = true without mutating snapshot
        storedFacReq.Status = "Approved";
        await _context.SaveChangesAsync();

        var afterApprovedPayload = updatePayload with { FacilityName = "Should Not Overwrite" };
        var conflictRes = await responder.RespondAsync(
            afterApprovedPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), afterApprovedPayload)),
            CancellationToken.None);

        Assert.False(conflictRes.Succeeded);
        Assert.True(conflictRes.Conflict);
        Assert.Equal("verification_request_not_pending", conflictRes.ErrorCode);
        Assert.Equal("Approved", conflictRes.CurrentStatus);

        var reloadedSnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(storedFacReq.SubmittedSnapshotJson)!;
        Assert.Equal("Gamma Main Updated", reloadedSnap.FacilityName);
    }

    [Fact]
    public async Task PractitionerUpdateResponder_PreservesAwaitingOtpOnBioEditReEvaluatesOnPrcChangeAndRefreshesParentSnapshot()
    {
        // Seed verified canonical practitioner for AwaitingOtp test
        var verifiedPrac = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0777888",
            DisplayPrcLicenseNo = "0777888",
            FirstName = "Clara",
            LastName = "Mendoza",
            Title = "Dr.",
            PrimarySpecialty = "Pediatrics",
            VerificationContact = "clara@gammacare.ph",
            VerificationStatus = PractitionerVerificationLevel.Verified,
            VerifiedAtUtc = _clock.GetUtcNow().UtcDateTime.AddDays(-5)
        };
        _context.Practitioners.Add(verifiedPrac);

        // Parent pending facility request with bundled practitioner
        var staffId = Guid.NewGuid();
        var facReqId = Guid.NewGuid();
        var childReqId = Guid.NewGuid();
        var parentPayload = new FacilityVerificationRequestedPayload
        {
            RequestId = facReqId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [BundledDoctor(staffId, "Clara", "Mendoza", "0777888", "Pediatrics")]
        };
        _context.FacilityVerificationRequests.Add(new FacilityVerificationRequest
        {
            Id = facReqId,
            TenantId = _tenant.Id,
            FacilityId = _facility.Id,
            SubmissionNumber = 1,
            CorrelationId = facReqId.ToString(),
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            SubmittedSnapshotJson = JsonSerializer.Serialize(parentPayload, InteropJson.Options),
            Status = "PendingReview"
        });

        var initialChildSnap = new PractitionerRequestSnapshot(
            childReqId,
            _facility.Id,
            _facility.Name,
            staffId,
            "Initial",
            "Doctor",
            "Clara",
            "Mendoza",
            "Dr.",
            "0777888",
            "0777888",
            new DateOnly(2028, 10, 1),
            "verification/prc/clara-v1.pdf",
            "clara@gammacare.ph",
            "Pediatrics",
            "Original bio",
            null,
            [new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "17:00", 30)],
            "user_owner_1",
            _clock.GetUtcNow().UtcDateTime,
            MatchedPractitionerId: verifiedPrac.Id,
            MatchedPractitionerName: "Dr. Clara Mendoza",
            OtpCodeHash: "hash-otp-1",
            SubmittedByDisplayName: "Owner Reyes");

        var existingAff = new PractitionerAffiliation
        {
            Id = Guid.NewGuid(),
            PractitionerId = verifiedPrac.Id,
            FacilityId = _facility.Id,
            TenantId = _tenant.Id,
            ClinicStaffMemberId = staffId,
            Role = "Doctor",
            AffiliationStatus = "AwaitingConfirmation",
            OptedInAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        _context.PractitionerAffiliations.Add(existingAff);

        _context.PractitionerVerificationRequests.Add(new PractitionerVerificationRequest
        {
            Id = childReqId,
            FacilityVerificationRequestId = facReqId,
            TenantId = _tenant.Id,
            FacilityId = _facility.Id,
            ClinicStaffMemberId = staffId,
            PractitionerId = verifiedPrac.Id,
            AffiliationId = existingAff.Id,
            SubmissionNumber = 1,
            CorrelationId = facReqId.ToString(),
            RequestKind = "Initial",
            ProfessionKind = "Doctor",
            SubmittedPrcLicenseNo = "0777888",
            NormalizedPrcLicenseNo = "0777888",
            PrcExpiryDate = new DateOnly(2028, 10, 1),
            SubmittedSnapshotJson = JsonSerializer.Serialize(initialChildSnap, InteropJson.Options),
            PrcEvidenceObjectKey = "verification/prc/clara-v1.pdf",
            VerificationContact = "clara@gammacare.ph",
            SubmittedByClinicUserId = "user_owner_1",
            SubmittedByDisplayName = "Owner Reyes",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            OtpTokenHash = "token-hash-1",
            OtpExpiresAtUtc = _clock.GetUtcNow().UtcDateTime.AddHours(72),
            Status = "AwaitingOtp"
        });
        await _context.SaveChangesAsync();

        var notifications = NewNotifications();
        var responder = new PractitionerVerificationUpdateRequestedResponder(
            CreateUpdater(notifications),
            NullLogger<PractitionerVerificationUpdateRequestedResponder>.Instance);

        // 1. Bio + schedule + PRC proof update while AwaitingOtp with ExpectedStatus = "PendingReview"
        _clock.Advance(TimeSpan.FromMinutes(10));
        var bioUpdate = new PractitionerVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            ClinicStaffMemberId = staffId,
            ProfessionKind = "Doctor",
            FirstName = "Clara",
            LastName = "Mendoza",
            Title = "Dr.",
            SubmittedPrcLicenseNo = "0777888",
            NormalizedPrcLicenseNo = "0777888",
            PrcExpiryDate = new DateOnly(2029, 10, 1),
            PrcEvidenceObjectKey = "verification/prc/clara-v2.pdf",
            VerificationContact = "clara@gammacare.ph",
            Specialty = "Pediatric Cardiology",
            PublicBio = "Updated bio text.",
            Availabilities = [new ProviderAvailabilityWindowDto(DayOfWeek.Tuesday, "10:00", "16:00", 30)],
            SubmittedByClinicUserId = "user_owner_1",
            SubmittedByDisplayName = "Owner Reyes",
            ExpectedRequestId = childReqId,
            ExpectedStatus = "PendingReview"
        };

        var res1 = await responder.RespondAsync(
            bioUpdate,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), bioUpdate)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.True(res1.Succeeded);
        Assert.False(res1.Conflict);
        Assert.Equal("AwaitingOtp", res1.CurrentStatus);
        Assert.Empty(_emailSender.Sent); // No duplicate OTP email on bio/proof-only edit

        var updatedChild = await _context.PractitionerVerificationRequests.FindAsync(childReqId);
        Assert.Equal("AwaitingOtp", updatedChild!.Status);
        Assert.Equal("token-hash-1", updatedChild.OtpTokenHash);
        Assert.Equal("verification/prc/clara-v2.pdf", updatedChild.PrcEvidenceObjectKey);

        // Parent facility snapshot was refreshed with the updated child practitioner
        var parentReq = await _context.FacilityVerificationRequests.FindAsync(facReqId);
        var refreshedParentSnap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(parentReq!.SubmittedSnapshotJson)!;
        var bundledItem = Assert.Single(refreshedParentSnap.Practitioners);
        Assert.Equal("Pediatric Cardiology", bundledItem.Specialty);
        Assert.Equal("verification/prc/clara-v2.pdf", bundledItem.PrcEvidenceObjectKey);

        // 2. Changing PRC number to an unverified PRC transitions back to PendingReview and withdraws AwaitingConfirmation affiliation
        _clock.Advance(TimeSpan.FromMinutes(10));
        var prcChange = bioUpdate with
        {
            SubmittedPrcLicenseNo = "0999000",
            NormalizedPrcLicenseNo = "0999000",
            ExpectedStatus = null
        };
        var res2 = await responder.RespondAsync(
            prcChange,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), prcChange)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.True(res2.Succeeded);
        Assert.Equal("PendingReview", res2.CurrentStatus);
        Assert.Null(updatedChild.OtpTokenHash);
        var withdrawnAff = await _context.PractitionerAffiliations.FindAsync(existingAff.Id);
        Assert.Equal("Withdrawn", withdrawnAff!.AffiliationStatus);

        // 3. Rejected practitioner request returns Conflict = true
        updatedChild.Status = "Rejected";
        await _context.SaveChangesAsync();

        var res3 = await responder.RespondAsync(
            prcChange,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), prcChange)),
            CancellationToken.None);
        Assert.False(res3.Succeeded);
        Assert.True(res3.Conflict);
        Assert.Equal("verification_request_not_pending", res3.ErrorCode);
        Assert.Equal("Rejected", res3.CurrentStatus);
    }

    [Fact]
    public async Task Queries_ResolveNamesEmailsFallbacksAndResubmissionDiffs()
    {
        var verifier = new AdminUser
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_3KGreviewer001",
            Email = "maria.reviewer@clinicez.ph",
            FullName = "Dr. Maria Reviewer",
            RoleId = Guid.Parse("67777777-7777-7777-7777-777777777777"),
            IsActive = true,
            Status = AdminUserStatus.Active
        };
        _context.AdminUsers.Add(verifier);

        var memberId = Guid.NewGuid();
        _context.WorkspaceMembers.Add(new WorkspaceMember
        {
            Id = memberId,
            TenantId = _tenant.Id,
            UserId = "user_3KGmember002",
            Email = "member@gammacare.ph",
            FullName = "Nurse Carla Member",
            Role = WorkspaceMemberRole.Admin,
            Status = MemberStatus.Active
        });

        _context.WorkspaceTeleconsultBillings.Add(new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            IsEnabled = true,
            CurrentPeriodYearMonth = "2026-11"
        });

        // Legacy facility submission #1 (Rejected, missing new #217 JSON keys and ReviewedByDisplayName)
        var facReq1Id = Guid.NewGuid();
        var staffA = Guid.NewGuid();
        var staffB = Guid.NewGuid();
        var child1AId = Guid.NewGuid();
        var child1BId = Guid.NewGuid();
        var legacyJson1 = JsonSerializer.Serialize(new
        {
            requestId = facReq1Id,
            tenantId = _tenant.Id.ToString(),
            facilityId = _facility.Id,
            facilityName = "Gamma Main Clinic",
            dohLtoNumber = "LTO-OLD-1",
            requestKind = "Initial",
            submittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddDays(-3),
            services = Enumerable.Range(1, 10).Select(i => new
            {
                serviceId = Guid.Parse($"00000000-0000-0000-0000-{i:D12}"),
                name = $"Service {i}",
                category = "General",
                standardPrice = 100m * i,
                isActive = true
            }).ToArray()
        });

        _facility.LtoExpiryDate = new DateOnly(2027, 5, 1);

        _context.FacilityVerificationRequests.Add(new FacilityVerificationRequest
        {
            Id = facReq1Id,
            TenantId = _tenant.Id,
            FacilityId = _facility.Id,
            SubmissionNumber = 1,
            CorrelationId = facReq1Id.ToString(),
            RequestKind = "Initial",
            SubmittedByClinicUserId = "user_3KGmember002",
            SubmittedByDisplayName = null,
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddDays(-3),
            SubmittedSnapshotJson = legacyJson1,
            LtoEvidenceObjectKey = "lto/sub1.pdf",
            Status = "Rejected",
            ReviewedByAdminUserId = "user_3KGreviewer001",
            ReviewedAtUtc = _clock.GetUtcNow().UtcDateTime.AddDays(-2),
            ReviewerNotes = "Blurry LTO scan and incomplete services"
        });

        _context.PractitionerVerificationRequests.AddRange(
            new PractitionerVerificationRequest
            {
                Id = child1AId,
                FacilityVerificationRequestId = facReq1Id,
                TenantId = _tenant.Id,
                FacilityId = _facility.Id,
                ClinicStaffMemberId = staffA,
                SubmissionNumber = 1,
                CorrelationId = facReq1Id.ToString(),
                RequestKind = "Initial",
                ProfessionKind = "Doctor",
                SubmittedPrcLicenseNo = "0111222",
                NormalizedPrcLicenseNo = "0111222",
                PrcEvidenceObjectKey = "prc/staffA-v1.pdf",
                SubmittedSnapshotJson = JsonSerializer.Serialize(new PractitionerRequestSnapshot(
                    child1AId, _facility.Id, _facility.Name, staffA, "Initial", "Doctor",
                    "Juan", "Dela Cruz", "Dr.", "0111222", "0111222", new DateOnly(2027, 1, 1),
                    "prc/staffA-v1.pdf", "juan@gammacare.ph", "General Medicine", null, null,
                    Array.Empty<ProviderAvailabilityWindowDto>(), "user_3KGmember002", _clock.GetUtcNow().UtcDateTime.AddDays(-3)), InteropJson.Options),
                Status = "Rejected",
                SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddDays(-3)
            },
            new PractitionerVerificationRequest
            {
                Id = child1BId,
                FacilityVerificationRequestId = facReq1Id,
                TenantId = _tenant.Id,
                FacilityId = _facility.Id,
                ClinicStaffMemberId = staffB,
                SubmissionNumber = 1,
                CorrelationId = facReq1Id.ToString(),
                RequestKind = "Initial",
                ProfessionKind = "Nurse",
                SubmittedPrcLicenseNo = "0333444",
                NormalizedPrcLicenseNo = "0333444",
                SubmittedSnapshotJson = JsonSerializer.Serialize(new PractitionerRequestSnapshot(
                    child1BId, _facility.Id, _facility.Name, staffB, "Initial", "Nurse",
                    "Removed", "Nurse", "RN", "0333444", "0333444", null,
                    null, null, null, null, null,
                    Array.Empty<ProviderAvailabilityWindowDto>(), "user_3KGmember002", _clock.GetUtcNow().UtcDateTime.AddDays(-3)), InteropJson.Options),
                Status = "Rejected",
                SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddDays(-3)
            });

        // Facility resubmission #2 (explicit SupportsTeleconsult = false should override WorkspaceTeleconsultBilling.IsEnabled = true)
        var facReq2Id = Guid.NewGuid();
        var child2AId = Guid.NewGuid();
        var snap2 = new FacilityVerificationRequestedPayload
        {
            RequestId = facReq2Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = "Gamma Main Clinic",
            DohLtoNumber = "LTO-NEW-2",
            DohLtoExpiryDate = new DateOnly(2028, 12, 31),
            LtoEvidenceObjectKey = "lto/sub2.pdf",
            ContactNumber = "+639175556666",
            PhilHealthAccreditationNumber = "PHIC-NEW-2",
            IsPhilHealthAccredited = false,
            SupportsInPerson = true,
            SupportsTeleconsult = false,
            RequestKind = "Resubmission",
            SubmittedByClinicUserId = "user_3KGunknown999",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Services = Enumerable.Range(1, 19).Select(i => new ClinicServiceDto(
                Guid.Parse($"00000000-0000-0000-0000-{i:D12}"),
                $"Service {i}",
                "General",
                100m * i)).ToList()
        };

        _context.FacilityVerificationRequests.Add(new FacilityVerificationRequest
        {
            Id = facReq2Id,
            TenantId = _tenant.Id,
            FacilityId = _facility.Id,
            SubmissionNumber = 2,
            CorrelationId = facReq2Id.ToString(),
            RequestKind = "Resubmission",
            SubmittedByClinicUserId = "user_3KGunknown999",
            SubmittedByDisplayName = null,
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            UpdatedAt = _clock.GetUtcNow().UtcDateTime.AddMinutes(5),
            SubmittedSnapshotJson = JsonSerializer.Serialize(snap2, InteropJson.Options),
            LtoEvidenceObjectKey = "lto/sub2.pdf",
            Status = "PendingReview"
        });

        _context.PractitionerVerificationRequests.Add(new PractitionerVerificationRequest
        {
            Id = child2AId,
            FacilityVerificationRequestId = facReq2Id,
            TenantId = _tenant.Id,
            FacilityId = _facility.Id,
            ClinicStaffMemberId = staffA,
            SubmissionNumber = 2,
            CorrelationId = facReq2Id.ToString(),
            RequestKind = "Resubmission",
            ProfessionKind = "Doctor",
            SubmittedPrcLicenseNo = "0111222",
            NormalizedPrcLicenseNo = "0111222",
            PrcExpiryDate = new DateOnly(2029, 1, 1),
            PrcEvidenceObjectKey = "prc/staffA-v2.pdf",
            SubmittedSnapshotJson = JsonSerializer.Serialize(new PractitionerRequestSnapshot(
                child2AId, _facility.Id, _facility.Name, staffA, "Resubmission", "Doctor",
                "Juan", "Dela Cruz", "Dr.", "0111222", "0111222", new DateOnly(2029, 1, 1),
                "prc/staffA-v2.pdf", "juan@gammacare.ph", "Cardiology", null, null,
                Array.Empty<ProviderAvailabilityWindowDto>(), "user_3KGunknown999", _clock.GetUtcNow().UtcDateTime), InteropJson.Options),
            Status = "PendingReview",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        });

        // Standalone practitioner OTP-confirmed row + resubmission
        var selfStaffId = Guid.NewGuid();
        var pracOtpId = Guid.NewGuid();
        _context.PractitionerVerificationRequests.Add(new PractitionerVerificationRequest
        {
            Id = pracOtpId,
            TenantId = _tenant.Id,
            FacilityId = _facility.Id,
            ClinicStaffMemberId = selfStaffId,
            SubmissionNumber = 1,
            CorrelationId = pracOtpId.ToString(),
            RequestKind = "Affiliation",
            ProfessionKind = "Doctor",
            SubmittedPrcLicenseNo = "0888999",
            NormalizedPrcLicenseNo = "0888999",
            SubmittedByClinicUserId = selfStaffId.ToString(),
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddHours(-2),
            ReviewedByAdminUserId = "practitioner-otp",
            ReviewedAtUtc = _clock.GetUtcNow().UtcDateTime.AddHours(-1),
            Status = "Approved",
            SubmittedSnapshotJson = JsonSerializer.Serialize(new PractitionerRequestSnapshot(
                pracOtpId, _facility.Id, _facility.Name, selfStaffId, "Affiliation", "Doctor",
                "Liza", "Soberano", "Dr.", "0888999", "0888999", null, null,
                "liza@gammacare.ph", "Dermatology", null, null,
                Array.Empty<ProviderAvailabilityWindowDto>(), selfStaffId.ToString(), _clock.GetUtcNow().UtcDateTime.AddHours(-2)), InteropJson.Options)
        });

        await _context.SaveChangesAsync();

        // Verify Queue
        var queue = await new GetVerificationQueueQueryHandler(_context)
            .Handle(new GetVerificationQueueQuery(), CancellationToken.None);

        var qFac1 = queue.Items.Single(i => i.Id == facReq1Id);
        Assert.Equal("Nurse Carla Member", qFac1.SubmittedByDisplayName);
        Assert.Equal("Dr. Maria Reviewer", qFac1.ReviewedByDisplayName);
        Assert.Equal("maria.reviewer@clinicez.ph", qFac1.ReviewedByEmail);
        Assert.Equal(new DateOnly(2027, 5, 1), qFac1.DohLtoExpiryDate);

        var qFac2 = queue.Items.Single(i => i.Id == facReq2Id);
        Assert.Null(qFac2.SubmittedByDisplayName); // raw user_3KGunknown999 is never leaked
        Assert.Equal(new DateOnly(2028, 12, 31), qFac2.DohLtoExpiryDate);
        Assert.NotNull(qFac2.UpdatedAtUtc);

        var qPracOtp = queue.Items.Single(i => i.Id == pracOtpId);
        Assert.Equal("Dr. Liza Soberano", qPracOtp.SubmittedByDisplayName); // self-submitted ClinicStaffMemberId resolved
        Assert.Equal("Practitioner (OTP Confirmation)", qPracOtp.ReviewedByDisplayName);

        // Verify Legacy Facility Detail (Submission #1): fallbacks apply, ResubmissionDiff is null
        var detail1 = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(facReq1Id), CancellationToken.None);
        Assert.NotNull(detail1);
        Assert.Null(detail1.ResubmissionDiff);
        Assert.Equal(new DateOnly(2027, 5, 1), detail1.DohLtoExpiryDate);
        Assert.Equal("+63288887777", detail1.ClinicContactNumber); // Branch fallback
        Assert.Equal("branch@gammacare.ph", detail1.ClinicContactEmail); // Branch fallback
        Assert.Equal("PHIC-BRANCH-001", detail1.PhilHealthAccreditationNumber);
        Assert.True(detail1.IsPhilHealthAccredited);
        Assert.True(detail1.SupportsInPerson);
        Assert.True(detail1.SupportsTeleconsult); // WorkspaceTeleconsultBillings fallback
        Assert.Equal("Dr. Maria Reviewer", detail1.ReviewedByDisplayName);

        // Verify Resubmitted Facility Detail (Submission #2): explicit false honored + ResubmissionDiff computed
        var detail2 = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(facReq2Id), CancellationToken.None);
        Assert.NotNull(detail2);
        Assert.False(detail2.IsPhilHealthAccredited); // explicit JSON false honored
        Assert.False(detail2.SupportsTeleconsult); // explicit JSON false honored despite billing enabled
        Assert.Equal("+639175556666", detail2.ClinicContactNumber);
        Assert.NotNull(detail2.ResubmissionDiff);
        Assert.Equal(facReq1Id, detail2.ResubmissionDiff.PreviousRequestId);
        Assert.Equal(1, detail2.ResubmissionDiff.PreviousSubmissionNumber);
        Assert.Equal("Rejected", detail2.ResubmissionDiff.PreviousStatus);
        Assert.Equal("Blurry LTO scan and incomplete services", detail2.ResubmissionDiff.PreviousReason);
        Assert.True(detail2.ResubmissionDiff.LtoProofUpdated);
        Assert.True(detail2.ResubmissionDiff.PrcProofUpdated);
        Assert.Contains(child2AId, detail2.ResubmissionDiff.UpdatedChildPractitionerIds);
        Assert.Contains(child2AId, detail2.ResubmissionDiff.UpdatedChildPrcProofIds);
        Assert.Contains(detail2.ResubmissionDiff.ChangedFields, f => f.FieldKey == "dohLtoNumber" && f.ChangeKind == "Modified");
        Assert.Contains(detail2.ResubmissionDiff.ChangedFields, f => f.FieldKey == "services" && f.ChangeKind == "Modified");
        Assert.Contains(detail2.ResubmissionDiff.ChangedFields, f => f.FieldKey == $"practitioner:{staffB}" && f.ChangeKind == "Removed");
        // Legacy Submission #1 had no isPhilHealthAccredited/supportsTeleconsult JSON keys and Submission #2 has false -> no spurious diff
        Assert.DoesNotContain(detail2.ResubmissionDiff.ChangedFields, f => f.FieldKey == "supportsTeleconsult");

        // Verify GetFacilitiesQuery exposes LtoExpiryDate
        var facilities = await new GetFacilitiesQueryHandler(_context, new ConfigurationBuilder().Build())
            .Handle(new GetFacilitiesQuery(_tenant.TenantSlug), CancellationToken.None);
        var facDto = Assert.Single(facilities);
        Assert.Equal(new DateOnly(2027, 5, 1), facDto.LtoExpiryDate);
    }

    [Fact]
    public async Task ComputeFacilityDiff_ResubmissionAfterWithdrawn_UnchangedBundledPractitionersNotFlaggedAsAddedAndRemovedDetected()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);
        var withdrawnHandler = new FacilityVerificationWithdrawnHandler(
            _context, _clock, NullLogger<FacilityVerificationWithdrawnHandler>.Instance);
        var responder = new FacilityVerificationUpdateRequestedResponder(
            CreateUpdater(), NullLogger<FacilityVerificationUpdateRequestedResponder>.Instance);

        var staffKeepId = Guid.NewGuid();
        var staffRemovedWhilePendingId = Guid.NewGuid();
        var staffModId = Guid.NewGuid();
        var req1Id = Guid.NewGuid();

        var docKeep = BundledDoctor(staffKeepId, "Juan", "Dela Cruz", "0111111", "Internal Medicine", "prc/keep.pdf");
        var docRemovedWhilePending = BundledDoctor(staffRemovedWhilePendingId, "Pedro", "Penduko", "0222222", "Surgery", "prc/removed.pdf");
        var docMod = BundledDoctor(staffModId, "Ana", "Santos", "0333333", "Pediatrics", "prc/mod-v1.pdf");

        var payload1 = new FacilityVerificationRequestedPayload
        {
            RequestId = req1Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [docKeep, docRemovedWhilePending, docMod]
        };

        await reqHandler.HandleAsync(
            payload1,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req1Id, payload1)),
            CancellationToken.None);

        // Remove staffRemovedWhilePendingId via in-place pending update (sets WithdrawalReason = "Removed from pending facility submission.")
        _clock.Advance(TimeSpan.FromMinutes(5));
        var pendingUpdate = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            ExpectedRequestId = req1Id,
            ExpectedStatus = "PendingReview",
            Practitioners = [docKeep, docMod]
        };
        var updateRes = await responder.RespondAsync(
            pendingUpdate,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), pendingUpdate)),
            CancellationToken.None);
        Assert.True(updateRes.Succeeded);
        await _context.SaveChangesAsync();

        // Withdraw the facility submission (marks docKeep and docMod as Status = "Withdrawn")
        _clock.Advance(TimeSpan.FromMinutes(5));
        var withdrawPayload = new FacilityVerificationWithdrawnPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            WithdrawnByActor = "user_owner_1",
            Reason = "Need to revise clinic hours",
            WithdrawnAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        await withdrawnHandler.HandleAsync(
            withdrawPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationWithdrawn, FacilityParty(), Party.Portal, Guid.NewGuid(), withdrawPayload)),
            CancellationToken.None);

        // Resubmit #2 with completely unchanged practitioners (docKeep and docMod unchanged)
        _clock.Advance(TimeSpan.FromMinutes(10));
        var req2Id = Guid.NewGuid();
        var payload2 = new FacilityVerificationRequestedPayload
        {
            RequestId = req2Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            OperatingHours = "Mon-Sat 08:00-18:00",
            RequestKind = "Resubmission",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [docKeep, docMod]
        };
        await reqHandler.HandleAsync(
            payload2,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req2Id, payload2)),
            CancellationToken.None);

        var detail2 = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(req2Id), CancellationToken.None);

        Assert.NotNull(detail2);
        Assert.NotNull(detail2.ResubmissionDiff);
        Assert.Equal("Withdrawn", detail2.ResubmissionDiff.PreviousStatus);
        Assert.False(detail2.ResubmissionDiff.PrcProofUpdated);
        Assert.Empty(detail2.ResubmissionDiff.UpdatedChildPractitionerIds);
        Assert.Empty(detail2.ResubmissionDiff.UpdatedChildPrcProofIds);
        Assert.DoesNotContain(detail2.ResubmissionDiff.ChangedFields, f => f.ChangeKind == "Added" && f.FieldKey.StartsWith("practitioner:", StringComparison.Ordinal));
        // Practitioner removed earlier during pending update was already gone from req1 before withdrawal -> not falsely emitted as Removed
        Assert.DoesNotContain(detail2.ResubmissionDiff.ChangedFields, f => f.FieldKey == $"practitioner:{staffRemovedWhilePendingId}");

        // Resubmit #3 removing docMod and modifying docKeep's specialty (without changing PRC proof) -> detects genuine Removal and Modification
        _clock.Advance(TimeSpan.FromMinutes(10));
        await withdrawnHandler.HandleAsync(
            withdrawPayload with { WithdrawnAtUtc = _clock.GetUtcNow().UtcDateTime },
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationWithdrawn, FacilityParty(), Party.Portal, Guid.NewGuid(), withdrawPayload)),
            CancellationToken.None);

        _clock.Advance(TimeSpan.FromMinutes(5));
        var req3Id = Guid.NewGuid();
        var docKeepModified = docKeep with { Specialty = "Cardiology" };
        var payload3 = payload2 with
        {
            RequestId = req3Id,
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [docKeepModified]
        };
        await reqHandler.HandleAsync(
            payload3,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req3Id, payload3)),
            CancellationToken.None);

        var detail3 = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(req3Id), CancellationToken.None);

        Assert.NotNull(detail3?.ResubmissionDiff);
        Assert.False(detail3.ResubmissionDiff.PrcProofUpdated);
        Assert.Empty(detail3.ResubmissionDiff.UpdatedChildPrcProofIds);
        var keptReq3Child = detail3.ChildPractitionerRequests.Single(c => c.ClinicStaffMemberId == staffKeepId);
        Assert.Equal([keptReq3Child.Id], detail3.ResubmissionDiff.UpdatedChildPractitionerIds);
        Assert.Contains(detail3.ResubmissionDiff.ChangedFields, f => f.FieldKey == $"practitioner:{staffModId}" && f.ChangeKind == "Removed");
        Assert.DoesNotContain(detail3.ResubmissionDiff.ChangedFields, f => f.ChangeKind == "Added" && f.FieldKey.StartsWith("practitioner:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task ComputeFacilityDiff_ResubmissionAfterSuperseded_UnchangedBundledPractitionersNotFlaggedAsAdded()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);
        var responder = new FacilityVerificationUpdateRequestedResponder(
            CreateUpdater(), NullLogger<FacilityVerificationUpdateRequestedResponder>.Instance);

        var staffKeepId = Guid.NewGuid();
        var staffDroppedBeforeSupersedeId = Guid.NewGuid();
        var docKeep = BundledDoctor(staffKeepId, "Clara", "Mendoza", "0444555", "Dermatology", "prc/clara.pdf");
        var docDropped = BundledDoctor(staffDroppedBeforeSupersedeId, "Marco", "Polo", "0666777", "ENT", "prc/marco.pdf");

        var req1Id = Guid.NewGuid();
        var payload1 = new FacilityVerificationRequestedPayload
        {
            RequestId = req1Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [docKeep, docDropped]
        };
        await reqHandler.HandleAsync(
            payload1,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req1Id, payload1)),
            CancellationToken.None);

        // Remove docDropped while req1 is still PendingReview (so docDropped is Withdrawn before req1 is superseded)
        _clock.Advance(TimeSpan.FromMinutes(5));
        var pendingUpdate = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            ExpectedRequestId = req1Id,
            ExpectedStatus = "PendingReview",
            Practitioners = [docKeep]
        };
        await responder.RespondAsync(
            pendingUpdate,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), pendingUpdate)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        // Submit req2 (supersedes req1 and marks docKeep of req1 as Status = "Superseded")
        _clock.Advance(TimeSpan.FromMinutes(5));
        var req2Id = Guid.NewGuid();
        var payload2 = payload1 with
        {
            RequestId = req2Id,
            RequestKind = "Resubmission",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [docKeep]
        };
        await reqHandler.HandleAsync(
            payload2,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req2Id, payload2)),
            CancellationToken.None);

        // Submit req3 (supersedes req2, leaving req2 in Status = "Superseded" too)
        _clock.Advance(TimeSpan.FromMinutes(5));
        var req3Id = Guid.NewGuid();
        var payload3 = payload2 with
        {
            RequestId = req3Id,
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [docKeep]
        };
        await reqHandler.HandleAsync(
            payload3,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req3Id, payload3)),
            CancellationToken.None);

        var detail3 = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(req3Id), CancellationToken.None);

        Assert.NotNull(detail3?.ResubmissionDiff);
        Assert.Equal("Superseded", detail3.ResubmissionDiff.PreviousStatus);
        Assert.False(detail3.ResubmissionDiff.PrcProofUpdated);
        Assert.Empty(detail3.ResubmissionDiff.UpdatedChildPractitionerIds);
        Assert.Empty(detail3.ResubmissionDiff.UpdatedChildPrcProofIds);
        Assert.DoesNotContain(detail3.ResubmissionDiff.ChangedFields, f => f.ChangeKind == "Added" && f.FieldKey.StartsWith("practitioner:", StringComparison.Ordinal));

        // Inspecting a Superseded request itself (req2 vs req1) must also retain req2's Superseded child and req1's Superseded child (and exclude req1's earlier Withdrawn child)
        var detail2 = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(req2Id), CancellationToken.None);

        Assert.NotNull(detail2?.ResubmissionDiff);
        Assert.Equal("Superseded", detail2.ResubmissionDiff.PreviousStatus);
        Assert.False(detail2.ResubmissionDiff.PrcProofUpdated);
        Assert.Empty(detail2.ResubmissionDiff.UpdatedChildPractitionerIds);
        Assert.Empty(detail2.ResubmissionDiff.UpdatedChildPrcProofIds);
        Assert.DoesNotContain(detail2.ResubmissionDiff.ChangedFields, f => f.FieldKey.StartsWith("practitioner:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task GetVerificationRequestDetail_PartialSchemaJsonWithExplicitBooleans_DoesNotThrowNullReferenceException()
    {
        _context.WorkspaceTeleconsultBillings.Add(new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            IsEnabled = true,
            CurrentPeriodYearMonth = "2026-11"
        });

        var reqExplicitFalseId = Guid.NewGuid();
        // Valid JSON with explicit false booleans + invalid DateOnly format so DeserializeFacilitySnapshot returns null
        const string partialSchemaJson = """
            {
              "facilityName": "Gamma Main Clinic",
              "dohLtoExpiryDate": "not-a-valid-date",
              "isPhilHealthAccredited": false,
              "supportsInPerson": false,
              "supportsTeleconsult": false
            }
            """;

        var reqNonBoolTypesId = Guid.NewGuid();
        // Valid JSON where boolean keys exist but have non-boolean values and typed deserialization fails -> falls back safely to DB defaults
        const string nonBoolTypesJson = """
            {
              "facilityName": "Gamma Main Clinic",
              "isPhilHealthAccredited": "invalid-bool",
              "supportsInPerson": "invalid-bool",
              "supportsTeleconsult": 123
            }
            """;

        _context.FacilityVerificationRequests.AddRange(
            new FacilityVerificationRequest
            {
                Id = reqExplicitFalseId,
                TenantId = _tenant.Id,
                FacilityId = _facility.Id,
                SubmissionNumber = 1,
                CorrelationId = reqExplicitFalseId.ToString(),
                RequestKind = "Initial",
                SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
                SubmittedSnapshotJson = partialSchemaJson,
                Status = "PendingReview"
            },
            new FacilityVerificationRequest
            {
                Id = reqNonBoolTypesId,
                TenantId = _tenant.Id,
                FacilityId = _facility.Id,
                SubmissionNumber = 2,
                CorrelationId = reqNonBoolTypesId.ToString(),
                RequestKind = "Resubmission",
                SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddMinutes(5),
                SubmittedSnapshotJson = nonBoolTypesJson,
                Status = "PendingReview"
            });
        await _context.SaveChangesAsync();

        var handler = new GetVerificationRequestDetailQueryHandler(_context);

        var detailFalse = await handler.Handle(new GetVerificationRequestDetailQuery(reqExplicitFalseId), CancellationToken.None);
        Assert.NotNull(detailFalse);
        Assert.False(detailFalse.IsPhilHealthAccredited);
        Assert.False(detailFalse.SupportsInPerson);
        Assert.False(detailFalse.SupportsTeleconsult);

        var detailFallback = await handler.Handle(new GetVerificationRequestDetailQuery(reqNonBoolTypesId), CancellationToken.None);
        Assert.NotNull(detailFallback);
        Assert.True(detailFallback.IsPhilHealthAccredited); // Branch IsPhilHealthAccredited = true fallback
        Assert.True(detailFallback.SupportsInPerson);       // Default true fallback
        Assert.True(detailFallback.SupportsTeleconsult);    // WorkspaceTeleconsultBilling.IsEnabled = true fallback
    }

    [Fact]
    public async Task Queries_ResolveReviewer_CaseInsensitiveAdminEmailMatch()
    {
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            ClerkUserId = null,
            Email = "case.reviewer@clinicez.ph",
            FullName = "Dr. Case Reviewer",
            RoleId = Guid.Parse("67777777-7777-7777-7777-777777777777"),
            IsActive = true,
            Status = AdminUserStatus.Active
        };
        _context.AdminUsers.Add(admin);

        var reqId = Guid.NewGuid();
        _context.FacilityVerificationRequests.Add(new FacilityVerificationRequest
        {
            Id = reqId,
            TenantId = _tenant.Id,
            FacilityId = _facility.Id,
            SubmissionNumber = 1,
            CorrelationId = reqId.ToString(),
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            SubmittedSnapshotJson = "{}",
            ReviewedByAdminUserId = "CASE.REVIEWER@CLINICEZ.PH",
            ReviewedAtUtc = _clock.GetUtcNow().UtcDateTime.AddMinutes(5),
            Status = "Approved"
        });
        await _context.SaveChangesAsync();

        var queue = await new GetVerificationQueueQueryHandler(_context)
            .Handle(new GetVerificationQueueQuery(), CancellationToken.None);
        var queueItem = queue.Items.Single(i => i.Id == reqId);
        Assert.Equal("Dr. Case Reviewer", queueItem.ReviewedByDisplayName);
        Assert.Equal("case.reviewer@clinicez.ph", queueItem.ReviewedByEmail);

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(reqId), CancellationToken.None);
        Assert.NotNull(detail);
        Assert.Equal("Dr. Case Reviewer", detail.ReviewedByDisplayName);
        Assert.Equal("case.reviewer@clinicez.ph", detail.ReviewedByEmail);
    }

    [Fact]
    public async Task FacilityUpdateResponder_ClearsLtoExpiryDate_WhilePreservingLegacyFallback()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        var reqId = Guid.NewGuid();
        var initialPayload = new FacilityVerificationRequestedPayload
        {
            RequestId = reqId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            FacilitySlug = _facility.Slug,
            DohLtoNumber = "DOH-LTO-001",
            DohLtoExpiryDate = new DateOnly(2029, 6, 30),
            LtoEvidenceObjectKey = "lto/v1.pdf",
            RequestKind = "Initial",
            SubmittedByClinicUserId = "user_submitter_1",
            SubmittedByDisplayName = "Dr. Gab Reyes",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        await reqHandler.HandleAsync(
            initialPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, reqId, initialPayload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.Equal(new DateOnly(2029, 6, 30), _facility.LtoExpiryDate);

        var responder = new FacilityVerificationUpdateRequestedResponder(
            CreateUpdater(), NullLogger<FacilityVerificationUpdateRequestedResponder>.Instance);

        var clearPayload = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            FacilitySlug = _facility.Slug,
            DohLtoNumber = "DOH-LTO-001",
            DohLtoExpiryDate = null,
            LtoEvidenceObjectKey = "lto/v1.pdf",
            SubmittedByClinicUserId = "user_submitter_1",
            SubmittedByDisplayName = "Dr. Gab Reyes",
            ExpectedRequestId = reqId,
            ExpectedStatus = "PendingReview"
        };

        var res = await responder.RespondAsync(
            clearPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), clearPayload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();
        Assert.True(res.Succeeded);

        Assert.Null(_facility.LtoExpiryDate);
        var updatedReq = await _context.FacilityVerificationRequests.SingleAsync(r => r.Id == reqId);
        Assert.Contains("\"dohLtoExpiryDate\":null", updatedReq.SubmittedSnapshotJson, StringComparison.Ordinal);

        var queue = await new GetVerificationQueueQueryHandler(_context)
            .Handle(new GetVerificationQueueQuery(), CancellationToken.None);
        Assert.Null(queue.Items.Single(i => i.Id == reqId).DohLtoExpiryDate);

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(reqId), CancellationToken.None);
        Assert.NotNull(detail);
        Assert.Null(detail.DohLtoExpiryDate);

        // Second facility with non-null LtoExpiryDate verifies legacy snapshot fallback vs explicit-null current snapshot
        var fac2 = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            BranchId = _branch.Id,
            Name = "Legacy Fallback Clinic",
            Slug = "legacy-fallback",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            LtoExpiryDate = new DateOnly(2028, 12, 31)
        };
        _context.Facilities.Add(fac2);

        var legacyReqId = Guid.NewGuid();
        var explicitNullReqId = Guid.NewGuid();
        _context.FacilityVerificationRequests.AddRange(
            new FacilityVerificationRequest
            {
                Id = legacyReqId,
                TenantId = _tenant.Id,
                FacilityId = fac2.Id,
                SubmissionNumber = 1,
                CorrelationId = legacyReqId.ToString(),
                RequestKind = "Initial",
                SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddMinutes(-10),
                SubmittedSnapshotJson = """{"facilityName":"Legacy Fallback Clinic"}""",
                Status = "Rejected"
            },
            new FacilityVerificationRequest
            {
                Id = explicitNullReqId,
                TenantId = _tenant.Id,
                FacilityId = fac2.Id,
                SubmissionNumber = 2,
                CorrelationId = explicitNullReqId.ToString(),
                RequestKind = "Resubmission",
                SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
                SubmittedSnapshotJson = """{"facilityName":"Legacy Fallback Clinic","dohLtoExpiryDate":null}""",
                Status = "PendingReview"
            });
        await _context.SaveChangesAsync();

        var queue2 = await new GetVerificationQueueQueryHandler(_context)
            .Handle(new GetVerificationQueueQuery(), CancellationToken.None);
        Assert.Equal(new DateOnly(2028, 12, 31), queue2.Items.Single(i => i.Id == legacyReqId).DohLtoExpiryDate);
        Assert.Null(queue2.Items.Single(i => i.Id == explicitNullReqId).DohLtoExpiryDate);

        var legacyDetail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(legacyReqId), CancellationToken.None);
        Assert.Equal(new DateOnly(2028, 12, 31), legacyDetail!.DohLtoExpiryDate);

        var explicitNullDetail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(explicitNullReqId), CancellationToken.None);
        Assert.Null(explicitNullDetail!.DohLtoExpiryDate);
    }

    [Fact]
    public async Task Resubmission_WithClearedDohLtoExpiryDate_ShowsRemovedInDiffAndClearsFacilityOnApprove()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        var sub1Id = Guid.NewGuid();
        var sub1Payload = new FacilityVerificationRequestedPayload
        {
            RequestId = sub1Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            FacilitySlug = _facility.Slug,
            DohLtoNumber = "DOH-LTO-100",
            DohLtoExpiryDate = new DateOnly(2029, 6, 30),
            LtoEvidenceObjectKey = "lto/sub1.pdf",
            RequestKind = "Initial",
            SubmittedByClinicUserId = "user_submitter_1",
            SubmittedByDisplayName = "Dr. Gab Reyes",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddHours(-2)
        };

        await reqHandler.HandleAsync(
            sub1Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, sub1Id, sub1Payload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        var rejectHandler = new RejectVerificationRequestCommandHandler(
            _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock);
        await rejectHandler.Handle(
            new RejectVerificationRequestCommand(sub1Id, "admin_1", "Verifier One", "Remove invalid expiry"),
            CancellationToken.None);

        var sub2Id = Guid.NewGuid();
        var sub2Payload = sub1Payload with
        {
            RequestId = sub2Id,
            DohLtoExpiryDate = null,
            RequestKind = "Resubmission",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        await reqHandler.HandleAsync(
            sub2Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, sub2Id, sub2Payload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        var queue = await new GetVerificationQueueQueryHandler(_context)
            .Handle(new GetVerificationQueueQuery(), CancellationToken.None);
        Assert.Null(queue.Items.Single(i => i.Id == sub2Id).DohLtoExpiryDate);

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(sub2Id), CancellationToken.None);
        Assert.NotNull(detail);
        Assert.Null(detail.DohLtoExpiryDate);
        Assert.NotNull(detail.ResubmissionDiff);
        var ltoChange = Assert.Single(detail.ResubmissionDiff.ChangedFields, c => c.FieldKey == "dohLtoExpiryDate");
        Assert.Equal("Removed", ltoChange.ChangeKind);
        Assert.Equal("2029-06-30", ltoChange.PreviousValue);
        Assert.Null(ltoChange.CurrentValue);

        var approveHandler = new ApproveVerificationRequestCommandHandler(
            _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock);
        await approveHandler.Handle(
            new ApproveVerificationRequestCommand(sub2Id, "admin_1", "Verifier One", "Approved without LTO expiry"),
            CancellationToken.None);

        var facility = await _context.Facilities.FindAsync(_facility.Id);
        Assert.Null(facility!.LtoExpiryDate);
    }

    [Fact]
    public async Task SyncPendingFacilityFromPortal_PreservePendingFlag_KeepsExplicitNull_WhilePreservingLegacyFallback()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        var sub1Id = Guid.NewGuid();
        var sub1Payload = new FacilityVerificationRequestedPayload
        {
            RequestId = sub1Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            FacilitySlug = _facility.Slug,
            DohLtoNumber = "DOH-LTO-100",
            DohLtoExpiryDate = new DateOnly(2029, 6, 30),
            LtoEvidenceObjectKey = "lto/sub1.pdf",
            RequestKind = "Initial",
            SubmittedByClinicUserId = "user_submitter_1",
            SubmittedByDisplayName = "Dr. Gab Reyes",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddHours(-2)
        };

        await reqHandler.HandleAsync(
            sub1Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, sub1Id, sub1Payload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        var rejectHandler = new RejectVerificationRequestCommandHandler(
            _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock);
        await rejectHandler.Handle(
            new RejectVerificationRequestCommand(sub1Id, "admin_1", "Verifier One", "Remove invalid expiry"),
            CancellationToken.None);

        var sub2Id = Guid.NewGuid();
        var sub2Payload = sub1Payload with
        {
            RequestId = sub2Id,
            DohLtoExpiryDate = null,
            RequestKind = "Resubmission",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        await reqHandler.HandleAsync(
            sub2Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, sub2Id, sub2Payload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.Equal(new DateOnly(2029, 6, 30), _facility.LtoExpiryDate);

        var updater = CreateUpdater();
        _facility.LtoEvidenceObjectKey = "lto/sub2-proof.pdf";
        var synced = await updater.SyncPendingFacilityFromPortalAsync(
            _facility,
            _tenant,
            "user_submitter_1",
            "Dr. Gab Reyes",
            "Owner",
            "lto-proof-pending-synced",
            clearLtoExpiryDate: false,
            preservePendingDohLtoExpiryDate: true);
        Assert.True(synced);
        await _context.SaveChangesAsync();

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(sub2Id), CancellationToken.None);
        Assert.NotNull(detail);
        Assert.Null(detail.DohLtoExpiryDate);
        Assert.Equal("lto/sub2-proof.pdf", detail.LtoEvidenceObjectKey);

        // Legacy snapshot lacking "dohLtoExpiryDate" key still falls back to Facility.LtoExpiryDate even with preservePendingDohLtoExpiryDate = true
        var legacyFac = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            BranchId = _branch.Id,
            Name = "Legacy Portal Sync Clinic",
            Slug = "legacy-portal-sync",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            LtoExpiryDate = new DateOnly(2028, 12, 31)
        };
        var legacyReqId = Guid.NewGuid();
        _context.Facilities.Add(legacyFac);
        _context.FacilityVerificationRequests.Add(new FacilityVerificationRequest
        {
            Id = legacyReqId,
            TenantId = _tenant.Id,
            FacilityId = legacyFac.Id,
            SubmissionNumber = 1,
            CorrelationId = legacyReqId.ToString(),
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            SubmittedSnapshotJson = """{"facilityName":"Legacy Portal Sync Clinic"}""",
            Status = "PendingReview"
        });
        await _context.SaveChangesAsync();

        var legacySynced = await updater.SyncPendingFacilityFromPortalAsync(
            legacyFac,
            _tenant,
            "user_submitter_1",
            "Dr. Gab Reyes",
            "Owner",
            "lto-proof-pending-synced",
            clearLtoExpiryDate: false,
            preservePendingDohLtoExpiryDate: true);
        Assert.True(legacySynced);
        await _context.SaveChangesAsync();

        var legacyDetail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(legacyReqId), CancellationToken.None);
        Assert.Equal(new DateOnly(2028, 12, 31), legacyDetail!.DohLtoExpiryDate);
    }

    [Fact]
    public async Task GetVerificationRequestDetail_ExplicitNotPhilHealthAccredited_DoesNotLeakBranchAccreditationNumber()
    {
        var isolatedBranch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Accredited Branch",
            Code = "BR-999",
            IsPhilHealthAccredited = true,
            PhilHealthAccreditationNumber = "BR-PHIC-999",
            IsActive = true
        };
        var overriddenFacility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            BranchId = isolatedBranch.Id,
            Name = "Non-Accredited Override Clinic",
            Slug = "non-accred-override",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            PhilHealthAccreditationNumber = "BR-PHIC-999"
        };
        _context.Branches.Add(isolatedBranch);
        _context.Facilities.Add(overriddenFacility);
        await _context.SaveChangesAsync();

        var reqId = Guid.NewGuid();
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);
        var party = Party.ForFacility(_tenant.Id.ToString(), overriddenFacility.Id.ToString(), FacilityType.Clinic);

        var submitPayload = new FacilityVerificationRequestedPayload
        {
            RequestId = reqId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = overriddenFacility.Id,
            FacilityName = overriddenFacility.Name,
            FacilitySlug = overriddenFacility.Slug,
            DohLtoNumber = "DOH-LTO-OV-1",
            PhilHealthAccreditationNumber = null,
            IsPhilHealthAccredited = false,
            RequestKind = "Initial",
            SubmittedByClinicUserId = "user_ov_1",
            SubmittedByDisplayName = "Dr. Override Admin",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        await reqHandler.HandleAsync(
            submitPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, party, Party.Portal, reqId, submitPayload)),
            CancellationToken.None);

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(reqId), CancellationToken.None);

        Assert.NotNull(detail);
        Assert.False(detail.IsPhilHealthAccredited);
        Assert.Null(detail.PhilHealthAccreditationNumber);
        Assert.Null((await _context.Facilities.FindAsync(overriddenFacility.Id))!.PhilHealthAccreditationNumber);

        // Also verify in-place update from accredited -> overridden not-accredited clears Facility.PhilHealthAccreditationNumber
        var responder = new FacilityVerificationUpdateRequestedResponder(
            CreateUpdater(), NullLogger<FacilityVerificationUpdateRequestedResponder>.Instance);

        var accredUpdate = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = overriddenFacility.Id,
            FacilityName = overriddenFacility.Name,
            PhilHealthAccreditationNumber = "CLINIC-PHIC-100",
            IsPhilHealthAccredited = true,
            ExpectedRequestId = reqId,
            ExpectedStatus = "PendingReview"
        };
        await responder.RespondAsync(
            accredUpdate,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, party, Party.Portal, Guid.NewGuid(), accredUpdate)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.Equal("CLINIC-PHIC-100", (await _context.Facilities.FindAsync(overriddenFacility.Id))!.PhilHealthAccreditationNumber);

        var revertToNonAccred = accredUpdate with
        {
            PhilHealthAccreditationNumber = null,
            IsPhilHealthAccredited = false
        };
        await responder.RespondAsync(
            revertToNonAccred,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, party, Party.Portal, Guid.NewGuid(), revertToNonAccred)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        var detailAfterRevert = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(reqId), CancellationToken.None);
        Assert.False(detailAfterRevert!.IsPhilHealthAccredited);
        Assert.Null(detailAfterRevert.PhilHealthAccreditationNumber);
        Assert.Null((await _context.Facilities.FindAsync(overriddenFacility.Id))!.PhilHealthAccreditationNumber);
    }

    [Fact]
    public async Task PractitionerUpdateResponder_NameChange_TransitionsBetweenAwaitingOtpAndPendingReview()
    {
        var canonical = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0555666",
            DisplayPrcLicenseNo = "0555666",
            FirstName = "Clara",
            LastName = "Mendoza",
            Title = "Dr.",
            PrimarySpecialty = "Family Medicine",
            VerificationContact = "clara@canon.ph",
            VerificationStatus = PractitionerVerificationLevel.Verified
        };
        _context.Practitioners.Add(canonical);
        await _context.SaveChangesAsync();

        var staffId = Guid.NewGuid();
        var reqId = Guid.NewGuid();
        var notifications = NewNotifications();
        var pracHandler = new PractitionerVerificationRequestedHandler(
            _context,
            _clock,
            NullLogger<PractitionerVerificationRequestedHandler>.Instance,
            notifications,
            new FixedFrontendUrl("https://portal.clinicez.test"));

        var initialPayload = new PractitionerVerificationRequestedPayload
        {
            RequestId = reqId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            ClinicStaffMemberId = staffId,
            RequestKind = "Affiliation",
            ProfessionKind = "Doctor",
            FirstName = "Clara",
            LastName = "Mendoza",
            Title = "Dr.",
            SubmittedPrcLicenseNo = "0555666",
            NormalizedPrcLicenseNo = "0555666",
            PrcExpiryDate = new DateOnly(2028, 12, 31),
            PrcEvidenceObjectKey = "prc/clara.pdf",
            VerificationContact = "clara@gammacare.ph",
            Specialty = "Family Medicine",
            SubmittedByClinicUserId = "user_admin_1",
            SubmittedByDisplayName = "Clinic Admin",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        await pracHandler.HandleAsync(
            initialPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationRequested, FacilityParty(), Party.Portal, reqId, initialPayload)),
            CancellationToken.None);

        var initialReq = await _context.PractitionerVerificationRequests.SingleAsync(r => r.Id == reqId);
        Assert.Equal("AwaitingOtp", initialReq.Status);
        var initialAff = await _context.PractitionerAffiliations.SingleAsync(a => a.FacilityId == _facility.Id && a.ClinicStaffMemberId == staffId);
        Assert.Equal("AwaitingConfirmation", initialAff.AffiliationStatus);
        var initialEmailCount = _emailSender.Sent.Count;
        Assert.True(initialEmailCount > 0);

        var responder = new PractitionerVerificationUpdateRequestedResponder(
            CreateUpdater(notifications),
            NullLogger<PractitionerVerificationUpdateRequestedResponder>.Instance);

        // 1. Change FirstName to incompatible "Maria" -> transitions to PendingReview, clears OTP, withdraws affiliation
        _clock.Advance(TimeSpan.FromMinutes(10));
        var mismatchPayload = new PractitionerVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            ClinicStaffMemberId = staffId,
            ProfessionKind = "Doctor",
            FirstName = "Maria",
            LastName = "Mendoza",
            Title = "Dr.",
            SubmittedPrcLicenseNo = "0555666",
            NormalizedPrcLicenseNo = "0555666",
            PrcExpiryDate = new DateOnly(2028, 12, 31),
            PrcEvidenceObjectKey = "prc/clara.pdf",
            VerificationContact = "clara@gammacare.ph",
            Specialty = "Family Medicine",
            ExpectedRequestId = reqId,
            ExpectedStatus = "PendingReview"
        };

        var mismatchRes = await responder.RespondAsync(
            mismatchPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), mismatchPayload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.True(mismatchRes.Succeeded);
        Assert.Equal(reqId, mismatchRes.RequestId);
        Assert.Equal("PendingReview", mismatchRes.CurrentStatus);

        var afterMismatchReq = await _context.PractitionerVerificationRequests.SingleAsync(r => r.Id == reqId);
        Assert.Equal("PendingReview", afterMismatchReq.Status);
        Assert.Null(afterMismatchReq.OtpTokenHash);
        Assert.Null(afterMismatchReq.OtpExpiresAtUtc);
        Assert.True(DirectoryVerificationHelper.DeserializePractitionerSnapshot(afterMismatchReq.SubmittedSnapshotJson)!.HasNameMismatch);
        var afterMismatchAff = await _context.PractitionerAffiliations.SingleAsync(a => a.FacilityId == _facility.Id && a.ClinicStaffMemberId == staffId);
        Assert.Equal("Withdrawn", afterMismatchAff.AffiliationStatus);

        // 2. Change FirstName back to "Clara" -> transitions back to AwaitingOtp, re-creates AwaitingConfirmation affiliation, sends fresh OTP
        _clock.Advance(TimeSpan.FromMinutes(10));
        var restorePayload = mismatchPayload with { FirstName = "Clara" };
        var restoreRes = await responder.RespondAsync(
            restorePayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), restorePayload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.True(restoreRes.Succeeded);
        Assert.Equal(reqId, restoreRes.RequestId);
        Assert.Equal("AwaitingOtp", restoreRes.CurrentStatus);

        var afterRestoreReq = await _context.PractitionerVerificationRequests.SingleAsync(r => r.Id == reqId);
        Assert.Equal("AwaitingOtp", afterRestoreReq.Status);
        Assert.False(string.IsNullOrWhiteSpace(afterRestoreReq.OtpTokenHash));
        Assert.False(DirectoryVerificationHelper.DeserializePractitionerSnapshot(afterRestoreReq.SubmittedSnapshotJson)!.HasNameMismatch);
        var afterRestoreAff = await _context.PractitionerAffiliations.SingleAsync(a => a.FacilityId == _facility.Id && a.ClinicStaffMemberId == staffId);
        Assert.Equal("AwaitingConfirmation", afterRestoreAff.AffiliationStatus);
        Assert.Null(afterRestoreAff.WithdrawnAtUtc);
        Assert.Equal(initialEmailCount + 1, _emailSender.Sent.Count);
    }

    [Fact]
    public async Task PractitionerUpdateResponder_OnBundledResubmission_RefreshesParentResubmissionDiffAndSnapshot()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        var staffId = Guid.NewGuid();
        var sub1Id = Guid.NewGuid();
        var sub1Payload = new FacilityVerificationRequestedPayload
        {
            RequestId = sub1Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            DohLtoNumber = "LTO-DIFF-1",
            LtoEvidenceObjectKey = "lto/v1.pdf",
            RequestKind = "Initial",
            SubmittedByClinicUserId = "user_1",
            SubmittedByDisplayName = "Clinic Admin",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [BundledDoctor(staffId, "Juan", "Dela Cruz", "0123456", "GP", "prc-v1.pdf")]
        };

        await reqHandler.HandleAsync(
            sub1Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, sub1Id, sub1Payload)),
            CancellationToken.None);

        await new RejectVerificationRequestCommandHandler(
                _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock)
            .Handle(new RejectVerificationRequestCommand(sub1Id, "admin_1", "Admin One", "Unclear PRC scan"), CancellationToken.None);

        _clock.Advance(TimeSpan.FromHours(1));
        var sub2Id = Guid.NewGuid();
        var sub2Payload = sub1Payload with
        {
            RequestId = sub2Id,
            RequestKind = "Resubmission",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        await reqHandler.HandleAsync(
            sub2Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, sub2Id, sub2Payload)),
            CancellationToken.None);

        var child2 = await _context.PractitionerVerificationRequests
            .SingleAsync(r => r.FacilityVerificationRequestId == sub2Id && r.ClinicStaffMemberId == staffId);

        // Update bundled child #2 in place via PractitionerVerificationUpdateRequested
        _clock.Advance(TimeSpan.FromMinutes(15));
        var responder = new PractitionerVerificationUpdateRequestedResponder(
            CreateUpdater(), NullLogger<PractitionerVerificationUpdateRequestedResponder>.Instance);

        var pracUpdate = new PractitionerVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            ClinicStaffMemberId = staffId,
            ProfessionKind = "Doctor",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Title = "Dr.",
            SubmittedPrcLicenseNo = "0123456",
            NormalizedPrcLicenseNo = "0123456",
            PrcExpiryDate = new DateOnly(2028, 12, 31),
            PrcEvidenceObjectKey = "prc-v2.pdf",
            VerificationContact = "juan@gammacare.ph",
            Specialty = "Cardiology",
            PublicBio = "Experienced physician.",
            Availabilities = [new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "17:00", 30)],
            ExpectedRequestId = child2.Id,
            ExpectedStatus = "PendingReview"
        };

        var updateRes = await responder.RespondAsync(
            pracUpdate,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), pracUpdate)),
            CancellationToken.None);
        await _context.SaveChangesAsync();
        Assert.True(updateRes.Succeeded);

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(sub2Id), CancellationToken.None);
        Assert.NotNull(detail?.ResubmissionDiff);
        Assert.True(detail.ResubmissionDiff.PrcProofUpdated);
        Assert.Equal([child2.Id], detail.ResubmissionDiff.UpdatedChildPrcProofIds);
        Assert.Equal([child2.Id], detail.ResubmissionDiff.UpdatedChildPractitionerIds);

        var practitionersJson = detail.Snapshot!.Value.GetProperty("practitioners");
        Assert.Equal(1, practitionersJson.GetArrayLength());
        Assert.Equal("Cardiology", practitionersJson[0].GetProperty("specialty").GetString());
        Assert.Equal("prc-v2.pdf", practitionersJson[0].GetProperty("prcEvidenceObjectKey").GetString());
    }

    [Fact]
    public async Task FacilityUpdateResponder_RemovingAwaitingOtpChildAndSupersedingStandaloneAwaitingOtp_WithdrawsAffiliations()
    {
        var canonA = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0777111",
            DisplayPrcLicenseNo = "0777111",
            FirstName = "Alice",
            LastName = "Reyes",
            Title = "Dr.",
            PrimarySpecialty = "Pediatrics",
            VerificationContact = "alice@canon.ph",
            VerificationStatus = PractitionerVerificationLevel.Verified
        };
        var canonB = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0777222",
            DisplayPrcLicenseNo = "0777222",
            FirstName = "Bruno",
            LastName = "Cruz",
            Title = "Dr.",
            PrimarySpecialty = "Surgery",
            VerificationContact = "bruno@canon.ph",
            VerificationStatus = PractitionerVerificationLevel.Verified
        };
        _context.Practitioners.AddRange(canonA, canonB);
        await _context.SaveChangesAsync();

        var staffA = Guid.NewGuid();
        var staffB = Guid.NewGuid();
        var facReqId = Guid.NewGuid();
        var standaloneReqId = Guid.NewGuid();

        var facHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);
        var pracHandler = new PractitionerVerificationRequestedHandler(
            _context, _clock, NullLogger<PractitionerVerificationRequestedHandler>.Instance);

        // (a) Facility request with bundled AwaitingOtp child for staffA
        var facPayload = new FacilityVerificationRequestedPayload
        {
            RequestId = facReqId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            DohLtoNumber = "LTO-OTP-1",
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Practitioners = [BundledDoctor(staffA, "Alice", "Reyes", "0777111", "Pediatrics")]
        };
        await facHandler.HandleAsync(
            facPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, facReqId, facPayload)),
            CancellationToken.None);

        // (b) Standalone AwaitingOtp request for staffB
        var standalonePayload = new PractitionerVerificationRequestedPayload
        {
            RequestId = standaloneReqId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            ClinicStaffMemberId = staffB,
            RequestKind = "Affiliation",
            ProfessionKind = "Doctor",
            FirstName = "Bruno",
            LastName = "Cruz",
            Title = "Dr.",
            SubmittedPrcLicenseNo = "0777222",
            NormalizedPrcLicenseNo = "0777222",
            VerificationContact = "bruno@gammacare.ph",
            Specialty = "Surgery",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        await pracHandler.HandleAsync(
            standalonePayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationRequested, FacilityParty(), Party.Portal, standaloneReqId, standalonePayload)),
            CancellationToken.None);

        var childA = await _context.PractitionerVerificationRequests.SingleAsync(r => r.FacilityVerificationRequestId == facReqId && r.ClinicStaffMemberId == staffA);
        var standaloneB = await _context.PractitionerVerificationRequests.SingleAsync(r => r.Id == standaloneReqId);
        Assert.Equal("AwaitingOtp", childA.Status);
        Assert.Equal("AwaitingOtp", standaloneB.Status);

        // Apply facility update: remove staffA, bundle staffB with changed unverified PRC 0999888
        _clock.Advance(TimeSpan.FromMinutes(10));
        var responder = new FacilityVerificationUpdateRequestedResponder(
            CreateUpdater(), NullLogger<FacilityVerificationUpdateRequestedResponder>.Instance);

        var updatePayload = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            DohLtoNumber = "LTO-OTP-1",
            ExpectedRequestId = facReqId,
            ExpectedStatus = "PendingReview",
            Practitioners = [BundledDoctor(staffB, "Bruno", "Cruz", "0999888", "Surgery")]
        };
        var updateRes = await responder.RespondAsync(
            updatePayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), updatePayload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();
        Assert.True(updateRes.Succeeded);

        var reloadedChildA = await _context.PractitionerVerificationRequests.SingleAsync(r => r.Id == childA.Id);
        Assert.Equal("Withdrawn", reloadedChildA.Status);
        Assert.Null(reloadedChildA.OtpTokenHash);
        Assert.Null(reloadedChildA.OtpExpiresAtUtc);
        var affA = await _context.PractitionerAffiliations.SingleAsync(a => a.FacilityId == _facility.Id && a.ClinicStaffMemberId == staffA);
        Assert.Equal("Withdrawn", affA.AffiliationStatus);

        var reloadedStandaloneB = await _context.PractitionerVerificationRequests.SingleAsync(r => r.Id == standaloneReqId);
        Assert.Equal("Superseded", reloadedStandaloneB.Status);
        Assert.Null(reloadedStandaloneB.OtpTokenHash);
        Assert.Null(reloadedStandaloneB.OtpExpiresAtUtc);
        var affB = await _context.PractitionerAffiliations.SingleAsync(a => a.FacilityId == _facility.Id && a.ClinicStaffMemberId == staffB);
        Assert.Equal("Withdrawn", affB.AffiliationStatus);

        var newChildB = await _context.PractitionerVerificationRequests
            .SingleAsync(r => r.FacilityVerificationRequestId == facReqId && r.ClinicStaffMemberId == staffB);
        Assert.Equal("PendingReview", newChildB.Status);
    }

    [Fact]
    public async Task ResubmissionDiff_NormalizesWhitespaceAndScheduleOrder_AndHandlesMalformedSnapshotJson()
    {
        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        var staffId = Guid.NewGuid();
        var sub1Id = Guid.NewGuid();
        var monday = new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "17:00", 30);
        var wednesday = new ProviderAvailabilityWindowDto(DayOfWeek.Wednesday, "10:00", "15:00", 30);

        var sub1Payload = new FacilityVerificationRequestedPayload
        {
            RequestId = sub1Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = "Gamma Main Clinic",
            FacilitySlug = "gamma-main",
            Classification = "Primary Care Clinic",
            DohLtoNumber = "DOH-LTO-NORM-1",
            DohLtoExpiryDate = new DateOnly(2028, 6, 30),
            LtoEvidenceObjectKey = "lto/norm-1.pdf",
            Address = "100 Commonwealth Ave",
            ContactNumber = "+639171110000",
            OperatingHours = "Mon-Fri 08:00-17:00",
            PhilHealthAccreditationNumber = "PHIC-NORM-1",
            IsPhilHealthAccredited = true,
            SupportsInPerson = true,
            SupportsTeleconsult = false,
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Services = [new ClinicServiceDto(Guid.Parse("11111111-1111-1111-1111-111111111111"), "Consultation", "General", 500m)],
            Practitioners =
            [
                new BundledPractitionerSubmissionDto
                {
                    ClinicStaffMemberId = staffId,
                    ProfessionKind = "Doctor",
                    FirstName = "Juan",
                    LastName = "Dela Cruz",
                    Title = "Dr.",
                    SubmittedPrcLicenseNo = "0123456",
                    NormalizedPrcLicenseNo = "0123456",
                    PrcExpiryDate = new DateOnly(2029, 1, 1),
                    PrcEvidenceObjectKey = "prc/norm-1.pdf",
                    VerificationContact = "juan@gammacare.ph",
                    Specialty = "Internal Medicine",
                    PublicBio = "Experienced physician.",
                    Availabilities = [monday, wednesday]
                }
            ]
        };

        await reqHandler.HandleAsync(
            sub1Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, sub1Id, sub1Payload)),
            CancellationToken.None);

        await new RejectVerificationRequestCommandHandler(
                _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock)
            .Handle(new RejectVerificationRequestCommand(sub1Id, "admin_1", "Admin One", "Please re-submit"), CancellationToken.None);

        // Sub #2 with leading/trailing whitespace and reversed Availabilities order
        _clock.Advance(TimeSpan.FromHours(1));
        var sub2Id = Guid.NewGuid();
        var sub2Payload = sub1Payload with
        {
            RequestId = sub2Id,
            FacilityName = "  Gamma Main Clinic  ",
            DohLtoNumber = "  DOH-LTO-NORM-1  ",
            Address = "  100 Commonwealth Ave  ",
            ContactNumber = "  +639171110000  ",
            OperatingHours = "  Mon-Fri 08:00-17:00  ",
            RequestKind = "Resubmission",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            Services = [new ClinicServiceDto(Guid.Parse("11111111-1111-1111-1111-111111111111"), "  Consultation  ", "  General  ", 500m)],
            Practitioners =
            [
                sub1Payload.Practitioners[0] with
                {
                    FirstName = "  Juan  ",
                    LastName = "  Dela Cruz  ",
                    Specialty = "  Internal Medicine  ",
                    PublicBio = "  Experienced physician.  ",
                    Availabilities = [wednesday, monday]
                }
            ]
        };

        await reqHandler.HandleAsync(
            sub2Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, sub2Id, sub2Payload)),
            CancellationToken.None);

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(sub2Id), CancellationToken.None);
        Assert.NotNull(detail?.ResubmissionDiff);
        Assert.Empty(detail.ResubmissionDiff.ChangedFields);
        Assert.Empty(detail.ResubmissionDiff.UpdatedChildPractitionerIds);
        Assert.False(detail.ResubmissionDiff.LtoProofUpdated);
        Assert.False(detail.ResubmissionDiff.PrcProofUpdated);

        // Verify clearing ContactNumber in pending update clears Facility.ContactNumber and ClinicContactNumber when branch/tenant have none
        _branch.ContactNumber = null;
        _tenant.PhoneNumber = null;
        await _context.SaveChangesAsync();

        var clearContactResponder = new FacilityVerificationUpdateRequestedResponder(
            CreateUpdater(), NullLogger<FacilityVerificationUpdateRequestedResponder>.Instance);
        var clearContactPayload = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = "Gamma Main Clinic",
            DohLtoNumber = "DOH-LTO-NORM-1",
            ContactNumber = null,
            ExpectedRequestId = sub2Id,
            ExpectedStatus = "PendingReview"
        };
        await clearContactResponder.RespondAsync(
            clearContactPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), clearContactPayload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        var clearedDetail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(sub2Id), CancellationToken.None);
        Assert.Null(clearedDetail!.ClinicContactNumber);
        Assert.Null((await _context.Facilities.FindAsync(_facility.Id))!.ContactNumber);

        // Malformed SubmittedSnapshotJson resilience
        var malformedFacility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            BranchId = _branch.Id,
            Name = "Malformed Snapshot Clinic",
            Slug = "malformed-snapshot",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            LicenseToOperate = "LTO-FALLBACK-99",
            LtoExpiryDate = new DateOnly(2030, 3, 15)
        };
        var malformedReqId = Guid.NewGuid();
        _context.Facilities.Add(malformedFacility);
        _context.FacilityVerificationRequests.Add(new FacilityVerificationRequest
        {
            Id = malformedReqId,
            TenantId = _tenant.Id,
            FacilityId = malformedFacility.Id,
            SubmissionNumber = 1,
            CorrelationId = malformedReqId.ToString(),
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            SubmittedSnapshotJson = "{not-json",
            Status = "PendingReview"
        });
        await _context.SaveChangesAsync();

        var malformedDetail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(malformedReqId), CancellationToken.None);
        Assert.NotNull(malformedDetail);
        Assert.Null(malformedDetail.Snapshot);
        Assert.Equal("LTO-FALLBACK-99", malformedDetail.DohLtoNumber);
        Assert.Equal(new DateOnly(2030, 3, 15), malformedDetail.DohLtoExpiryDate);
    }

    [Fact]
    public async Task FacilityUpdateResponder_AndApprove_PreservePortalConfiguredContactEmailWhenClinicSendsNull_AndAllowPortalClear()
    {
        _facility.ContactEmail = "desk@emailclinic.ph";
        await _context.SaveChangesAsync();

        var reqHandler = new FacilityVerificationRequestedHandler(
            _context, _clock, NullLogger<FacilityVerificationRequestedHandler>.Instance);

        // 1. Clinic submits initial verification with ContactEmail = null
        var req1Id = Guid.NewGuid();
        var sub1Payload = new FacilityVerificationRequestedPayload
        {
            RequestId = req1Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            FacilitySlug = _facility.Slug,
            DohLtoNumber = "DOH-LTO-EMAIL-1",
            ContactEmail = null,
            RequestKind = "Initial",
            SubmittedByClinicUserId = "user_1",
            SubmittedByDisplayName = "Clinic Admin",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        await reqHandler.HandleAsync(
            sub1Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req1Id, sub1Payload)),
            CancellationToken.None);

        // Portal updates Facility.ContactEmail via PUT /facilities/{id}/settings -> SyncPendingFacilityFromPortalAsync
        _facility.ContactEmail = "portal@emailclinic.ph";
        await CreateUpdater().SyncPendingFacilityFromPortalAsync(
            _facility, _tenant, "user_owner", "Owner Reyes", "Owner", "facility-pending-updated");
        await _context.SaveChangesAsync();

        // 2. Clinic sends pending update with ContactEmail = null -> Portal-configured ContactEmail must be preserved
        var responder = new FacilityVerificationUpdateRequestedResponder(
            CreateUpdater(), NullLogger<FacilityVerificationUpdateRequestedResponder>.Instance);
        var clinicUpdatePayload = new FacilityVerificationUpdateRequestedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = "Updated Clinic Name",
            FacilitySlug = _facility.Slug,
            DohLtoNumber = "DOH-LTO-EMAIL-1",
            ContactEmail = null,
            ExpectedRequestId = req1Id,
            ExpectedStatus = "PendingReview"
        };
        var updateRes = await responder.RespondAsync(
            clinicUpdatePayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), clinicUpdatePayload)),
            CancellationToken.None);
        await _context.SaveChangesAsync();
        Assert.True(updateRes.Succeeded);

        var reloadedFac = await _context.Facilities.FindAsync(_facility.Id);
        Assert.Equal("portal@emailclinic.ph", reloadedFac!.ContactEmail);
        var req1 = await _context.FacilityVerificationRequests.FindAsync(req1Id);
        var req1Snap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(req1!.SubmittedSnapshotJson)!;
        Assert.Equal("portal@emailclinic.ph", req1Snap.ContactEmail);
        var detail1 = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(req1Id), CancellationToken.None);
        Assert.Equal("portal@emailclinic.ph", detail1!.ClinicContactEmail);

        // 3. Reject and resubmit from Clinic with ContactEmail = null, then Approve -> ContactEmail still preserved
        await new RejectVerificationRequestCommandHandler(
                _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock)
            .Handle(new RejectVerificationRequestCommand(req1Id, "admin_1", "Admin One", "Resubmit"), CancellationToken.None);

        _clock.Advance(TimeSpan.FromMinutes(10));
        var req2Id = Guid.NewGuid();
        var sub2Payload = sub1Payload with
        {
            RequestId = req2Id,
            RequestKind = "Resubmission",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        await reqHandler.HandleAsync(
            sub2Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req2Id, sub2Payload)),
            CancellationToken.None);

        await new ApproveVerificationRequestCommandHandler(
                _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock)
            .Handle(new ApproveVerificationRequestCommand(req2Id, "admin_1", "Admin One", "Approved"), CancellationToken.None);

        Assert.Equal("portal@emailclinic.ph", (await _context.Facilities.FindAsync(_facility.Id))!.ContactEmail);
        var req2Snap = DirectoryVerificationHelper.DeserializeFacilitySnapshot(
            (await _context.FacilityVerificationRequests.FindAsync(req2Id))!.SubmittedSnapshotJson)!;
        Assert.Equal("portal@emailclinic.ph", req2Snap.ContactEmail);

        // 4. Portal explicitly clears ContactEmail ("") while pending, Clinic sends update (null), then Approve -> Facility.ContactEmail cleared to null
        _branch.ContactEmail = null;
        _tenant.Email = "owner@gammacare.ph";
        _facility.PlatformVerificationStatus = PlatformVerificationStatus.PendingReview;
        var req3Id = Guid.NewGuid();
        var sub3Payload = sub1Payload with
        {
            RequestId = req3Id,
            RequestKind = "Resubmission",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime.AddMinutes(5)
        };
        await reqHandler.HandleAsync(
            sub3Payload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationRequested, FacilityParty(), Party.Portal, req3Id, sub3Payload)),
            CancellationToken.None);

        _facility.ContactEmail = "";
        await CreateUpdater().SyncPendingFacilityFromPortalAsync(
            _facility, _tenant, "user_owner", "Owner Reyes", "Owner", "facility-pending-updated");
        await _context.SaveChangesAsync();

        var clinicUpdate3 = clinicUpdatePayload with { ExpectedRequestId = req3Id };
        await responder.RespondAsync(
            clinicUpdate3,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityVerificationUpdateRequested, FacilityParty(), Party.Portal, Guid.NewGuid(), clinicUpdate3)),
            CancellationToken.None);
        await _context.SaveChangesAsync();

        await new ApproveVerificationRequestCommandHandler(
                _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock)
            .Handle(new ApproveVerificationRequestCommand(req3Id, "admin_1", "Admin One", "Approved cleared"), CancellationToken.None);

        Assert.Null((await _context.Facilities.FindAsync(_facility.Id))!.ContactEmail);
    }

    [Fact]
    public async Task GetVerificationRequestDetail_Practitioner_SuppressesBranchPhilHealth_WhenFacilityOverrodeToNonAccredited()
    {
        var accreditedBranch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Accredited Branch",
            Code = "BR-PRAC-999",
            IsPhilHealthAccredited = true,
            PhilHealthAccreditationNumber = "BR-PHIC-999",
            IsActive = true
        };
        var fac = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            BranchId = accreditedBranch.Id,
            Name = "Non-Accredited Override Clinic",
            Slug = "non-accred-prac-override",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            PhilHealthAccreditationNumber = null
        };
        _context.Branches.Add(accreditedBranch);
        _context.Facilities.Add(fac);

        var facReqId = Guid.NewGuid();
        var facSnapshot = new FacilityVerificationRequestedPayload
        {
            RequestId = facReqId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = fac.Id,
            FacilityName = fac.Name,
            IsPhilHealthAccredited = false,
            PhilHealthAccreditationNumber = null,
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };
        _context.FacilityVerificationRequests.Add(new FacilityVerificationRequest
        {
            Id = facReqId,
            TenantId = _tenant.Id,
            FacilityId = fac.Id,
            SubmissionNumber = 1,
            CorrelationId = facReqId.ToString(),
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            SubmittedSnapshotJson = DirectoryVerificationHelper.SerializeFacilitySnapshot(facSnapshot),
            Status = "Approved"
        });

        var pracReqId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        _context.PractitionerVerificationRequests.Add(new PractitionerVerificationRequest
        {
            Id = pracReqId,
            TenantId = _tenant.Id,
            FacilityId = fac.Id,
            ClinicStaffMemberId = staffId,
            SubmissionNumber = 1,
            CorrelationId = pracReqId.ToString(),
            RequestKind = "Affiliation",
            ProfessionKind = "Doctor",
            SubmittedPrcLicenseNo = "0123456",
            NormalizedPrcLicenseNo = "0123456",
            SubmittedSnapshotJson = JsonSerializer.Serialize(new PractitionerRequestSnapshot(
                pracReqId, fac.Id, fac.Name, staffId, "Affiliation", "Doctor",
                "Juan", "Dela Cruz", "Dr.", "0123456", "0123456", null, null,
                "juan@gammacare.ph", "General Medicine", null, null,
                Array.Empty<ProviderAvailabilityWindowDto>(), "user_1", _clock.GetUtcNow().UtcDateTime), InteropJson.Options),
            Status = "PendingReview",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        });
        await _context.SaveChangesAsync();

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(pracReqId), CancellationToken.None);

        Assert.NotNull(detail);
        Assert.False(detail.IsPhilHealthAccredited);
        Assert.Null(detail.PhilHealthAccreditationNumber);
    }

    [Fact]
    public async Task GetVerificationRequestDetail_PascalCaseSnapshotKeys_HandledCaseInsensitively()
    {
        var accreditedBranch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "PascalCase Branch",
            Code = "BR-CASE-1",
            IsPhilHealthAccredited = true,
            PhilHealthAccreditationNumber = "BR-CASE-1",
            IsActive = true
        };
        var fac = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            BranchId = accreditedBranch.Id,
            Name = "PascalCase Snapshot Clinic",
            Slug = "pascal-case-clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            LtoExpiryDate = new DateOnly(2030, 1, 1),
            PhilHealthAccreditationNumber = "BR-CASE-1"
        };
        _context.Branches.Add(accreditedBranch);
        _context.Facilities.Add(fac);
        _context.WorkspaceTeleconsultBillings.Add(new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            IsEnabled = true,
            CurrentPeriodYearMonth = "2026-11"
        });

        const string pascalSnapshotJson = """
            {
              "FacilityName": "PascalCase Snapshot Clinic",
              "DohLtoExpiryDate": null,
              "IsPhilHealthAccredited": false,
              "PhilHealthAccreditationNumber": null,
              "SupportsInPerson": false,
              "SupportsTeleconsult": false
            }
            """;

        var facReqId = Guid.NewGuid();
        _context.FacilityVerificationRequests.Add(new FacilityVerificationRequest
        {
            Id = facReqId,
            TenantId = _tenant.Id,
            FacilityId = fac.Id,
            SubmissionNumber = 1,
            CorrelationId = facReqId.ToString(),
            RequestKind = "Initial",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime,
            SubmittedSnapshotJson = pascalSnapshotJson,
            Status = "PendingReview"
        });

        var pracReqId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        _context.PractitionerVerificationRequests.Add(new PractitionerVerificationRequest
        {
            Id = pracReqId,
            FacilityVerificationRequestId = facReqId,
            TenantId = _tenant.Id,
            FacilityId = fac.Id,
            ClinicStaffMemberId = staffId,
            SubmissionNumber = 1,
            CorrelationId = facReqId.ToString(),
            RequestKind = "Initial",
            ProfessionKind = "Doctor",
            SubmittedPrcLicenseNo = "0654321",
            NormalizedPrcLicenseNo = "0654321",
            SubmittedSnapshotJson = JsonSerializer.Serialize(new PractitionerRequestSnapshot(
                pracReqId, fac.Id, fac.Name, staffId, "Initial", "Doctor",
                "Maria", "Clara", "Dr.", "0654321", "0654321", null, null,
                "maria@gammacare.ph", "Pediatrics", null, null,
                Array.Empty<ProviderAvailabilityWindowDto>(), "user_1", _clock.GetUtcNow().UtcDateTime), InteropJson.Options),
            Status = "PendingReview",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        });
        await _context.SaveChangesAsync();

        var handler = new GetVerificationRequestDetailQueryHandler(_context);

        var facDetail = await handler.Handle(new GetVerificationRequestDetailQuery(facReqId), CancellationToken.None);
        Assert.NotNull(facDetail);
        Assert.Null(facDetail.DohLtoExpiryDate);
        Assert.False(facDetail.IsPhilHealthAccredited);
        Assert.Null(facDetail.PhilHealthAccreditationNumber);
        Assert.False(facDetail.SupportsInPerson);
        Assert.False(facDetail.SupportsTeleconsult);

        var pracDetail = await handler.Handle(new GetVerificationRequestDetailQuery(pracReqId), CancellationToken.None);
        Assert.NotNull(pracDetail);
        Assert.False(pracDetail.IsPhilHealthAccredited);
        Assert.Null(pracDetail.PhilHealthAccreditationNumber);
    }

    [Fact]
    public async Task PrcUpdateResubmission_OnApprovedPractitioner_CreatesPendingReviewResubmissionAndPreservesApprovedHistory()
    {
        var staffId = Guid.NewGuid();
        var sub3Id = Guid.NewGuid();
        var oldExpiry = new DateOnly(2028, 5, 1);
        const string oldProof = "tenants/t/clinics/c/verification/prc/doc/sub3-proof.pdf";

        var pracHandler = new PractitionerVerificationRequestedHandler(
            _context,
            _clock,
            NullLogger<PractitionerVerificationRequestedHandler>.Instance,
            NewNotifications(),
            new FixedFrontendUrl("https://portal.clinicez.test"));

        var initialPayload = new PractitionerVerificationRequestedPayload
        {
            RequestId = sub3Id,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            FacilityName = _facility.Name,
            ClinicStaffMemberId = staffId,
            RequestKind = "Initial",
            ProfessionKind = "Doctor",
            FirstName = "Justine Mae",
            LastName = "Tabasan",
            Title = "Dr.",
            SubmittedPrcLicenseNo = "0123456",
            NormalizedPrcLicenseNo = "0123456",
            PrcExpiryDate = oldExpiry,
            PrcEvidenceObjectKey = oldProof,
            VerificationContact = "justine@gammacare.ph",
            Specialty = "Family Medicine",
            SubmittedByClinicUserId = "user_admin_1",
            SubmittedByDisplayName = "Clinic Admin",
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        await pracHandler.HandleAsync(
            initialPayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationRequested, FacilityParty(), Party.Portal, sub3Id, initialPayload)),
            CancellationToken.None);

        await new ApproveVerificationRequestCommandHandler(
                _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock)
            .Handle(new ApproveVerificationRequestCommand(sub3Id, "admin_1", "Admin One", "Approved initial credentials"), CancellationToken.None);

        var emailsBeforeResubmit = _emailSender.Sent.Count;

        // Approved practitioner keeps same PRC # and name, but replaces PRC proof and expiry -> PrcUpdate
        _clock.Advance(TimeSpan.FromHours(2));
        var sub4Id = Guid.NewGuid();
        var newExpiry = new DateOnly(2031, 5, 1);
        const string newProof = "tenants/t/clinics/c/verification/prc/doc/sub4-proof.pdf";
        var updatePayload = initialPayload with
        {
            RequestId = sub4Id,
            RequestKind = "PrcUpdate",
            PrcExpiryDate = newExpiry,
            PrcEvidenceObjectKey = newProof,
            SubmittedAtUtc = _clock.GetUtcNow().UtcDateTime
        };

        await pracHandler.HandleAsync(
            updatePayload,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.PractitionerVerificationRequested, FacilityParty(), Party.Portal, sub4Id, updatePayload)),
            CancellationToken.None);

        Assert.Equal(emailsBeforeResubmit, _emailSender.Sent.Count);

        var allReqs = await _context.PractitionerVerificationRequests
            .Where(r => r.FacilityId == _facility.Id && r.ClinicStaffMemberId == staffId)
            .OrderBy(r => r.SubmissionNumber)
            .ToListAsync();
        Assert.Equal(2, allReqs.Count);

        // Submission #1 (prior approved) remains completely immutable
        Assert.Equal("Approved", allReqs[0].Status);
        Assert.Equal(oldProof, allReqs[0].PrcEvidenceObjectKey);
        Assert.Equal(oldExpiry, allReqs[0].PrcExpiryDate);
        Assert.Contains(oldProof, allReqs[0].SubmittedSnapshotJson);

        // New resubmission is PendingReview with RequestKind = "Resubmission" (NOT AwaitingOtp)
        Assert.Equal(2, allReqs[1].SubmissionNumber);
        Assert.Equal("Resubmission", allReqs[1].RequestKind);
        Assert.Equal("PendingReview", allReqs[1].Status);
        Assert.Null(allReqs[1].OtpTokenHash);
        Assert.Equal(newProof, allReqs[1].PrcEvidenceObjectKey);
        Assert.Equal(newExpiry, allReqs[1].PrcExpiryDate);

        var detail = await new GetVerificationRequestDetailQueryHandler(_context)
            .Handle(new GetVerificationRequestDetailQuery(sub4Id), CancellationToken.None);
        Assert.NotNull(detail);
        Assert.Equal("Resubmission", detail.RequestKind);
        Assert.Equal("PendingReview", detail.Status);
        Assert.Equal(2, detail.SubmissionHistory.Count);
        Assert.Contains(detail.SubmissionHistory, h => h.Id == sub3Id && h.Status == "Approved");
        Assert.Contains(detail.SubmissionHistory, h => h.Id == sub4Id && h.Status == "PendingReview" && h.RequestKind == "Resubmission");
        Assert.NotNull(detail.ResubmissionDiff);
        Assert.True(detail.ResubmissionDiff.PrcProofUpdated);
        Assert.Equal("Approved", detail.ResubmissionDiff.PreviousStatus);
        Assert.Contains(detail.ResubmissionDiff.ChangedFields, c => c.FieldKey == "prcExpiryDate");

        // Governance can approve the new resubmission cleanly
        var approval2 = await new ApproveVerificationRequestCommandHandler(
                _context, TestSupport.ProvisioningPublisher(_context), new InteropPublisher(_context), _clock)
            .Handle(new ApproveVerificationRequestCommand(sub4Id, "admin_1", "Admin One", "Approved renewed PRC proof"), CancellationToken.None);
        Assert.Equal("Approved", approval2.Status);

        var canonical = await _context.Practitioners.SingleAsync(p => p.NormalizedPrcLicenseNo == "0123456");
        Assert.Equal(newExpiry, canonical.PrcExpiryDate);
        Assert.Equal(sub4Id, canonical.LatestVerificationRequestId);
    }
}
