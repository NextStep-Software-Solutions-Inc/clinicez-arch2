using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.Templates;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public sealed class Phase1And1DRegressionTests
{
    private const string Tenant = "ustp-cdo";

    [Fact]
    public async Task AppointmentBookedHandler_WhenDobIsNull_DoesNotFabricate2000Jan01AndAlertsHistoricalChart()
    {
        await using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, Tenant);

        var historicalChartId = Guid.NewGuid();
        db.Patients.Add(new Patient
        {
            Id = historicalChartId,
            TenantId = Tenant,
            ClinicId = clinicId,
            PatientCode = "V1-HIST-001",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = null,
            Sex = BiologicalSex.Female,
            ContactNumber = "09170001111",
            Email = "maria.santos@example.com"
        });
        await db.SaveChangesAsync();

        var cloudPatientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var payload = new AppointmentBookedEvent
        {
            DraftId = draftId,
            ClinicId = clinicId,
            TenantId = Tenant,
            PatientId = cloudPatientId,
            PatientFirstName = "Maria",
            PatientLastName = "Santos",
            DateOfBirth = null,
            Email = "maria.santos@example.com",
            ContactNumber = "09170002222",
            PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            Reason = "Consultation"
        };

        var handler = new AppointmentBookedHandler(
            db,
            MessagingTestKit.Recipient(db),
            new InteropPublisher(db),
            NullLogger<AppointmentBookedHandler>.Instance);

        await handler.HandleAsync(
            payload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientAppointmentBooked,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                draftId,
                payload),
            CancellationToken.None);

        var newChart = await db.Patients.IgnoreQueryFilters()
            .SingleAsync(p => p.CloudPatientId == cloudPatientId);
        newChart.DateOfBirth.Should().BeNull("missing DOB must remain null rather than fabricating 2000-01-01");

        var historicalAlerts = await db.PatientAlerts.IgnoreQueryFilters()
            .Where(a => a.PatientId == historicalChartId)
            .ToListAsync();
        historicalAlerts.Should().ContainSingle(a =>
            a.CreatedBy == "System:BookingDuplicateGuard" &&
            a.Category == PatientAlertCategory.Administrative &&
            a.Status == PatientAlertStatus.Active);

        var newChartAlerts = await db.PatientAlerts.IgnoreQueryFilters()
            .Where(a => a.PatientId == newChart.Id)
            .ToListAsync();
        newChartAlerts.Should().ContainSingle(a => a.CreatedBy == "System:BookingDuplicateGuard");
    }

    [Fact]
    public async Task PatientShareSnapshotHandler_WhenDobIsMissing_DoesNotFabricate2000Jan01()
    {
        await using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, Tenant);

        var importId = Guid.NewGuid();
        var patientPlaneId = Guid.NewGuid();
        db.ShareImports.Add(new ShareImport
        {
            Id = importId,
            TenantId = Tenant,
            ClinicId = clinicId,
            Status = ShareImportStatus.Pending
        });
        await db.SaveChangesAsync();

        var payload = new PatientShareSnapshotPayload
        {
            Granted = true,
            GrantId = Guid.NewGuid(),
            PatientId = patientPlaneId,
            ClinicEzId = "CE-NULL-DOB",
            Scopes = SharingScopes.Demographics,
            ExpiresAtUtc = DateTime.UtcNow.AddHours(1),
            Demographics = new ShareDemographicsDto
            {
                FirstName = "Juan",
                LastName = "Reyes",
                DateOfBirth = null,
                Sex = "Male"
            },
            Items = []
        };

        var handler = new PatientShareSnapshotHandler(
            db,
            MessagingTestKit.Recipient(db),
            NullLogger<PatientShareSnapshotHandler>.Instance);

        await handler.HandleAsync(
            payload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientShareSnapshot,
                Party.ForPatient(patientPlaneId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                importId,
                payload),
            CancellationToken.None);

        var savedImport = await db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == importId);
        savedImport.Status.Should().Be(ShareImportStatus.Imported);

        var patient = await db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == savedImport.PatientId);
        patient.DateOfBirth.Should().BeNull();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task PatientShareSnapshotHandler_WhenTargetPatientIdIsEmptyOrMissing_FailsWithoutCreatingNewChart(bool useEmptyGuid)
    {
        await using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, Tenant);

        var importId = Guid.NewGuid();
        var patientPlaneId = Guid.NewGuid();
        db.ShareImports.Add(new ShareImport
        {
            Id = importId,
            TenantId = Tenant,
            ClinicId = clinicId,
            TargetPatientId = useEmptyGuid ? Guid.Empty : Guid.NewGuid(),
            Status = ShareImportStatus.Pending
        });
        await db.SaveChangesAsync();

        var payload = new PatientShareSnapshotPayload
        {
            Granted = true,
            GrantId = Guid.NewGuid(),
            PatientId = patientPlaneId,
            ClinicEzId = "CE-MISSING-TARGET",
            Scopes = SharingScopes.Demographics,
            ExpiresAtUtc = DateTime.UtcNow.AddHours(1),
            Demographics = new ShareDemographicsDto
            {
                FirstName = "Ana",
                LastName = "Luna",
                DateOfBirth = "1998-01-10",
                Sex = "Female"
            },
            Items = []
        };

        var handler = new PatientShareSnapshotHandler(
            db,
            MessagingTestKit.Recipient(db),
            NullLogger<PatientShareSnapshotHandler>.Instance);

        await handler.HandleAsync(
            payload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientShareSnapshot,
                Party.ForPatient(patientPlaneId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                importId,
                payload),
            CancellationToken.None);

        var savedImport = await db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == importId);
        savedImport.Status.Should().Be(ShareImportStatus.Failed);
        savedImport.PatientId.Should().BeNull();
        (await db.Patients.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public void RedeemPatientShareCommandValidator_RejectsEmptyTargetPatientId_AndAcceptsNullOrValidGuid()
    {
        var validator = new RedeemPatientShareCommandValidator();

        validator.Validate(new RedeemPatientShareCommand("SHARE-TOKEN-12345", TargetPatientId: Guid.Empty))
            .IsValid.Should().BeFalse();
        validator.Validate(new RedeemPatientShareCommand("SHARE-TOKEN-12345", TargetPatientId: null))
            .IsValid.Should().BeTrue();
        validator.Validate(new RedeemPatientShareCommand("SHARE-TOKEN-12345", TargetPatientId: Guid.NewGuid()))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task PatientRecordGateway_RequestRedeemAsync_RejectsEmptyOrMissingTargetPatientId()
    {
        await using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, Tenant);

        var clinicCtx = Substitute.For<IClinicContext>();
        clinicCtx.ClinicId.Returns(clinicId);
        clinicCtx.TenantId.Returns(Tenant);
        clinicCtx.StaffId.Returns(Guid.NewGuid());

        var gateway = new PatientRecordGateway(
            db,
            clinicCtx,
            Phase3TestKit.Identity(clinicId, Tenant),
            new InteropPublisher(db));

        Func<Task> emptyAct = () => gateway.RequestRedeemAsync(
            new PatientShareRedeemInput("SHARE-TOKEN-12345", null, null, "Consultation", false, null, Guid.Empty),
            CancellationToken.None);
        await emptyAct.Should().ThrowAsync<BadRequestException>();

        Func<Task> missingAct = () => gateway.RequestRedeemAsync(
            new PatientShareRedeemInput("SHARE-TOKEN-12345", null, null, "Consultation", false, null, Guid.NewGuid()),
            CancellationToken.None);
        await missingAct.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task PatientLinkRequestedHandler_MatchesCustomFields_WhenShortlistOver50AndTotalOver250()
    {
        await using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, Tenant);

        // Seed 60 patients sharing the same LastName ("Reyes") so shortlist >= 50
        for (var i = 0; i < 60; i++)
        {
            db.Patients.Add(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = Tenant,
                ClinicId = clinicId,
                PatientCode = $"V1-SH-{i:D4}",
                FirstName = $"Other{i}",
                LastName = "Reyes",
                Sex = BiologicalSex.Male,
                ContactNumber = $"0917000{i:D4}"
            });
        }

        // Seed 260 patients with non-matching CustomFields before the target patient (>250 rows)
        for (var i = 0; i < 260; i++)
        {
            db.Patients.Add(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = Tenant,
                ClinicId = clinicId,
                PatientCode = $"V1-CF-{i:D4}",
                FirstName = $"Unrelated{i}",
                LastName = $"Surname{i}",
                Sex = BiologicalSex.Female,
                ContactNumber = $"0918000{i:D4}",
                CustomFields = new Dictionary<string, object?> { ["student_id"] = $"2020{i:D6}" }
            });
        }

        var targetId = Guid.NewGuid();
        db.Patients.Add(new Patient
        {
            Id = targetId,
            TenantId = Tenant,
            ClinicId = clinicId,
            PatientCode = "V1-TARGET-999",
            FirstName = "Ana",
            LastName = "Mendoza",
            Sex = BiologicalSex.Female,
            ContactNumber = "09195551234",
            CustomFields = new Dictionary<string, object?> { ["student_id"] = "2025-009876" }
        });
        await db.SaveChangesAsync();

        var cloudPatientId = Guid.NewGuid();
        var linkReqId = Guid.NewGuid();
        var payload = new PatientLinkRequestedPayload
        {
            LinkRequestId = linkReqId,
            PatientId = cloudPatientId,
            ClinicEzId = "CE-USTP-7777",
            TenantId = Tenant,
            ClinicId = clinicId,
            FirstName = "Ana",
            LastName = "Reyes",
            IdentifierClaims = new Dictionary<string, string> { ["student_id"] = "2025-009876" },
            ConsentPrivacyPolicy = true,
            ConsentTermsAndConditions = true,
            ConsentDataSharing = true,
            RequestedAtUtc = DateTime.UtcNow
        };

        var handler = new PatientLinkRequestedHandler(
            db,
            MessagingTestKit.Recipient(db),
            NullLogger<PatientLinkRequestedHandler>.Instance);

        await handler.HandleAsync(
            payload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientLinkRequested,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                linkReqId,
                payload),
            CancellationToken.None);

        var saved = await db.PatientLinkRequests.IgnoreQueryFilters().SingleAsync(r => r.Id == linkReqId);
        saved.CandidateMatches.Should().Contain(c => c.PatientId == targetId && c.Score >= 50);
    }

    [Fact]
    public async Task PatientLinkRequestedHandler_ReopeningRejectedClearsMatchedPatientId_AndPendingResubmitUpdatesClaims()
    {
        await using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, Tenant);

        var targetId = Guid.NewGuid();
        db.Patients.Add(new Patient
        {
            Id = targetId,
            TenantId = Tenant,
            ClinicId = clinicId,
            PatientCode = "V1-REOPEN-1",
            FirstName = "Carlo",
            LastName = "Diaz",
            Sex = BiologicalSex.Male,
            ContactNumber = "09171112222",
            CustomFields = new Dictionary<string, object?> { ["lrn"] = "LRN-998877" }
        });

        var cloudPatientId = Guid.NewGuid();
        var linkReqId = Guid.NewGuid();
        var staleMatchedId = Guid.NewGuid();
        db.PatientLinkRequests.Add(new PatientLinkRequest
        {
            Id = linkReqId,
            TenantId = Tenant,
            ClinicId = clinicId,
            CloudPatientId = cloudPatientId,
            ClinicEzId = "CE-REOPEN-1",
            FirstName = "Carlo",
            LastName = "Diaz",
            Status = PatientLinkRequestStatus.Rejected,
            MatchedPatientId = staleMatchedId,
            RejectionReason = "Wrong ID",
            RequestedAtUtc = DateTime.UtcNow.AddMinutes(-10)
        });
        await db.SaveChangesAsync();

        var handler = new PatientLinkRequestedHandler(
            db,
            MessagingTestKit.Recipient(db),
            NullLogger<PatientLinkRequestedHandler>.Instance);

        // 1. Re-open rejected request with typo in LRN
        var reopenTime = DateTime.UtcNow.AddMinutes(-5);
        var reopenPayload = new PatientLinkRequestedPayload
        {
            LinkRequestId = linkReqId,
            PatientId = cloudPatientId,
            ClinicEzId = "CE-REOPEN-1",
            TenantId = Tenant,
            ClinicId = clinicId,
            FirstName = "Carlo",
            LastName = "Diaz",
            IdentifierClaims = new Dictionary<string, string> { ["lrn"] = "LRN-000000" },
            ConsentPrivacyPolicy = true,
            ConsentTermsAndConditions = true,
            ConsentDataSharing = true,
            RequestedAtUtc = reopenTime
        };

        await handler.HandleAsync(
            reopenPayload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientLinkRequested,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                linkReqId,
                reopenPayload),
            CancellationToken.None);

        var afterReopen = await db.PatientLinkRequests.IgnoreQueryFilters().SingleAsync(r => r.Id == linkReqId);
        afterReopen.Status.Should().Be(PatientLinkRequestStatus.PendingReview);
        afterReopen.MatchedPatientId.Should().BeNull();
        afterReopen.RejectionReason.Should().BeNull();
        afterReopen.IdentifierClaims.Should().ContainKey("lrn").WhoseValue.Should().Be("LRN-000000");
        afterReopen.CandidateMatches!.Single(c => c.PatientId == targetId).Score.Should().Be(15);

        // 2. Re-submit while PendingReview with corrected LRN -> must update claims and re-score
        var updateTime = DateTime.UtcNow;
        var updatePayload = new PatientLinkRequestedPayload
        {
            LinkRequestId = linkReqId,
            PatientId = cloudPatientId,
            ClinicEzId = "CE-REOPEN-1",
            TenantId = Tenant,
            ClinicId = clinicId,
            FirstName = "Carlo",
            LastName = "Diaz",
            IdentifierClaims = new Dictionary<string, string> { ["lrn"] = "LRN-998877" },
            ConsentPrivacyPolicy = true,
            ConsentTermsAndConditions = true,
            ConsentDataSharing = true,
            RequestedAtUtc = updateTime
        };

        await handler.HandleAsync(
            updatePayload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientLinkRequested,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                linkReqId,
                updatePayload),
            CancellationToken.None);

        var afterUpdate = await db.PatientLinkRequests.IgnoreQueryFilters().SingleAsync(r => r.Id == linkReqId);
        afterUpdate.Status.Should().Be(PatientLinkRequestStatus.PendingReview);
        afterUpdate.IdentifierClaims.Should().ContainKey("lrn").WhoseValue.Should().Be("LRN-998877");
        afterUpdate.CandidateMatches!.Single(c => c.PatientId == targetId).Score.Should().Be(65);
    }

    [Fact]
    public void ClinicCustomFieldTemplatesCatalog_AccountsForPrimaryChartAndShareIntakeKeys()
    {
        ClinicCustomFieldTemplatesCatalog.PrimaryToSecondaryAddressKeyMap
            .Should().ContainKey("primary_address_line").WhoseValue.Should().Be("secondary_address_line");
        ClinicCustomFieldTemplatesCatalog.PrimaryToSecondaryAddressKeyMap
            .Should().ContainKey("primary_zip_code").WhoseValue.Should().Be("secondary_postal_code");

        ClinicCustomFieldTemplatesCatalog.IsKnownPatientIntakeKey("primary_address_line").Should().BeTrue();
        ClinicCustomFieldTemplatesCatalog.IsKnownPatientIntakeKey("primary_barangay").Should().BeTrue();
        ClinicCustomFieldTemplatesCatalog.IsKnownPatientIntakeKey("primary_city").Should().BeTrue();
        ClinicCustomFieldTemplatesCatalog.IsKnownPatientIntakeKey("primary_province").Should().BeTrue();
        ClinicCustomFieldTemplatesCatalog.IsKnownPatientIntakeKey("primary_zip_code").Should().BeTrue();
        ClinicCustomFieldTemplatesCatalog.IsKnownPatientIntakeKey("emergency_contact_name").Should().BeTrue();
        ClinicCustomFieldTemplatesCatalog.IsKnownPatientIntakeKey("secondary_address_line").Should().BeTrue();
        ClinicCustomFieldTemplatesCatalog.IsKnownPatientIntakeKey("unknown_key_xyz").Should().BeFalse();
    }

    [Fact]
    public async Task PatientLinkRequestedHandler_WhenRejected_IgnoresStaleOrEqualTimestampRedelivery_AndReopensOnlyWhenNewer()
    {
        await using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, Tenant);

        var cloudPatientId = Guid.NewGuid();
        var linkReqId = Guid.NewGuid();
        var staleMatchedId = Guid.NewGuid();
        var rejectedRequestedAt = new DateTime(2026, 11, 20, 12, 0, 0, DateTimeKind.Utc);

        db.PatientLinkRequests.Add(new PatientLinkRequest
        {
            Id = linkReqId,
            TenantId = Tenant,
            ClinicId = clinicId,
            CloudPatientId = cloudPatientId,
            ClinicEzId = "CE-REJ-1",
            FirstName = "Carlo",
            LastName = "Diaz",
            Status = PatientLinkRequestStatus.Rejected,
            MatchedPatientId = staleMatchedId,
            RejectionReason = "Mismatch",
            RequestedAtUtc = rejectedRequestedAt
        });
        await db.SaveChangesAsync();

        var handler = new PatientLinkRequestedHandler(
            db,
            MessagingTestKit.Recipient(db),
            NullLogger<PatientLinkRequestedHandler>.Instance);

        // 1. Older out-of-order redelivery must be ignored
        var olderPayload = new PatientLinkRequestedPayload
        {
            LinkRequestId = linkReqId,
            PatientId = cloudPatientId,
            ClinicEzId = "CE-REJ-1",
            TenantId = Tenant,
            ClinicId = clinicId,
            FirstName = "Carlo",
            LastName = "Diaz",
            ConsentPrivacyPolicy = true,
            ConsentTermsAndConditions = true,
            ConsentDataSharing = true,
            RequestedAtUtc = rejectedRequestedAt.AddMinutes(-5)
        };
        await handler.HandleAsync(
            olderPayload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientLinkRequested,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                linkReqId,
                olderPayload),
            CancellationToken.None);

        var afterOlder = await db.PatientLinkRequests.IgnoreQueryFilters().SingleAsync(r => r.Id == linkReqId);
        afterOlder.Status.Should().Be(PatientLinkRequestStatus.Rejected);
        afterOlder.MatchedPatientId.Should().Be(staleMatchedId);
        afterOlder.RejectionReason.Should().Be("Mismatch");

        // 2. Equal-timestamp redelivery (new MessageId) must also be ignored
        var equalPayload = olderPayload with { RequestedAtUtc = rejectedRequestedAt };
        await handler.HandleAsync(
            equalPayload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientLinkRequested,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                linkReqId,
                equalPayload),
            CancellationToken.None);

        var afterEqual = await db.PatientLinkRequests.IgnoreQueryFilters().SingleAsync(r => r.Id == linkReqId);
        afterEqual.Status.Should().Be(PatientLinkRequestStatus.Rejected);
        afterEqual.MatchedPatientId.Should().Be(staleMatchedId);
        afterEqual.RejectionReason.Should().Be("Mismatch");

        // 3. Strictly newer resubmission re-opens to PendingReview and clears stale state
        var newerPayload = olderPayload with { RequestedAtUtc = rejectedRequestedAt.AddMinutes(5) };
        await handler.HandleAsync(
            newerPayload,
            MessagingTestKit.Delivered(
                InteropTypes.PatientLinkRequested,
                Party.ForPatient(cloudPatientId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, clinicId),
                linkReqId,
                newerPayload),
            CancellationToken.None);

        var afterNewer = await db.PatientLinkRequests.IgnoreQueryFilters().SingleAsync(r => r.Id == linkReqId);
        afterNewer.Status.Should().Be(PatientLinkRequestStatus.PendingReview);
        afterNewer.MatchedPatientId.Should().BeNull();
        afterNewer.RejectionReason.Should().BeNull();
    }
}
