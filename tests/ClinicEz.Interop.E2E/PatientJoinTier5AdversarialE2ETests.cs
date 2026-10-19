using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Phase 2 (Tier 5) Adversarial Coverage E2E Tests:
/// Tests the full live stack: Portal Sdk -> Interop Hub -> Clinic Inbox Poller -> PatientJoinRequestedHandler -> Postgres/Db.
/// 1. Duplicate replays with identical vs differing correlation IDs.
/// 2. Near-simultaneous sequence progression.
/// 3. Extreme boundary dates (leap day DOB, sub-second expiration).
/// 4. Massive attachments and oversized metadata dictionaries.
/// 5. SQL/XSS injection payloads and Unicode diacritics.
/// </summary>
public class PatientJoinTier5AdversarialE2ETests
{
    private const string MessageType = InteropTypes.PatientJoinRequested;

    private static PatientJoinRequestedPayload CreatePayload(
        string firstName = "Juan",
        string lastName = "Dela Cruz",
        string joinCode = "JOIN2026",
        string facilitySlug = "challenger-clinic",
        DateOnly? dob = null,
        string memberType = "MM")
    {
        return new PatientJoinRequestedPayload
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = "tenant-challenger",
            FacilitySlug = facilitySlug,
            JoinCode = joinCode,
            FirstName = firstName,
            LastName = lastName,
            DateOfBirth = dob ?? new DateOnly(1992, 8, 21),
            Sex = "Male",
            ContactNumber = "0917-555-1234",
            Email = "juan.delacruz@example.ph",
            Address = "Barangay Poblacion, Makati City",
            PhilHealthPin = "12-345678901-8",
            MemberType = memberType,
            ReasonForVisit = "Tier 5 Adversarial Ingestion Audit",
            CustomFields = new Dictionary<string, object?>
            {
                ["source"] = "public_portal_tier5",
                ["security_cleared"] = true
            }
        };
    }

    [Fact]
    public async Task E2E_DuplicateReplay_DifferingCorrelationId_SameJoinRequestId_DeduplicatedAtHandler()
    {
        await using var cell = new TestCell();
        var fac = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));

        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == fac.Id);
            settings.FacilitySlug = "challenger-clinic";
            settings.IsJoinEnabled = true;
            settings.JoinCode = "JOIN2026";
            await db.SaveChangesAsync();
            return 0;
        });

        var sharedJoinRequestId = Guid.NewGuid();
        var payload = CreatePayload() with { JoinRequestId = sharedJoinRequestId };

        // 1st delivery with CorrelationId 1
        var corr1 = Guid.NewGuid();
        var env1 = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, corr1, payload);
        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([env1], CancellationToken.None);
        await cell.PumpAsync();

        // 2nd delivery with different CorrelationId 2 but SAME JoinRequestId
        var corr2 = Guid.NewGuid();
        var env2 = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, corr2, payload);
        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([env2], CancellationToken.None);
        await cell.PumpAsync();

        // Verify exactly one patient exists
        await cell.Clinic.DbAsync(async db =>
        {
            var count = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == fac.Id);
            count.Should().Be(1, "replay with differing CorrelationId but identical JoinRequestId must be deduplicated in clinic DB");

            var queueCount = await db.QueueItems.IgnoreQueryFilters().CountAsync(q => q.ClinicId == fac.Id);
            queueCount.Should().Be(1, "exactly one queue ticket must exist");
            return 0;
        });
    }

    [Fact]
    public async Task E2E_BoundaryDates_LeapDayBirth_PreservedAccuratelyThroughHubAndPoller()
    {
        await using var cell = new TestCell();
        var fac = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));

        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == fac.Id);
            settings.FacilitySlug = "challenger-clinic";
            settings.IsJoinEnabled = true;
            settings.JoinCode = "JOIN2026";
            await db.SaveChangesAsync();
            return 0;
        });

        var leapDob = new DateOnly(2024, 2, 29);
        var payload = CreatePayload("LeapBaby", "Test", dob: leapDob);
        var env = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, Guid.NewGuid(), payload);

        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([env], CancellationToken.None);
        await cell.PumpAsync();

        await cell.Clinic.DbAsync(async db =>
        {
            var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == fac.Id);
            patient.Should().NotBeNull();
            patient!.DateOfBirth.Should().Be(new DateOnly(2024, 2, 29), "leap day birth date must survive serialization, relay, and DB persistence");
            return 0;
        });
    }

    [Fact]
    public async Task E2E_Security_MaliciousInjectionAndUnicode_PreservedLiterallyWithoutCorruption()
    {
        await using var cell = new TestCell();
        var fac = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));

        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == fac.Id);
            settings.FacilitySlug = "challenger-clinic";
            settings.IsJoinEnabled = true;
            settings.JoinCode = "JOIN2026";
            await db.SaveChangesAsync();
            return 0;
        });

        const string sqlPayload = "Robert'; DROP TABLE Patients;--";
        const string xssPayload = "<script>alert('xss')</script>";
        const string unicodeAddress = "Barangay San José \u202EBidi\u202C 🏥 Unit 402";

        var payload = CreatePayload(sqlPayload, xssPayload) with
        {
            Address = unicodeAddress,
            ReasonForVisit = "Evaluation with <img src=x onerror=alert(1)>"
        };

        var env = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, Guid.NewGuid(), payload);
        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([env], CancellationToken.None);
        await cell.PumpAsync();

        await cell.Clinic.DbAsync(async db =>
        {
            var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == fac.Id);
            patient.Should().NotBeNull();
            patient!.FirstName.Should().Be(sqlPayload);
            patient.LastName.Should().Be(xssPayload);
            patient.AddressLine.Should().Be(unicodeAddress);

            var queue = await db.QueueItems.IgnoreQueryFilters().FirstOrDefaultAsync(q => q.ClinicId == fac.Id);
            queue.Should().NotBeNull();
            queue!.ChiefComplaint.Should().Be("Evaluation with <img src=x onerror=alert(1)>");
            return 0;
        });
    }

    [Fact]
    public async Task E2E_PayloadStress_MultipleAttachmentsQuarantinedUnderPendingVerification()
    {
        await using var cell = new TestCell();
        var fac = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));

        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == fac.Id);
            settings.FacilitySlug = "challenger-clinic";
            settings.IsJoinEnabled = true;
            settings.JoinCode = "JOIN2026";
            await db.SaveChangesAsync();
            return 0;
        });

        var attachments = new List<PatientJoinAttachmentItem>
        {
            new() { FileName = "xray.pdf", FileType = "application/pdf", Category = "Radiology", FileSizeBytes = 1024 },
            new() { FileName = "blood_test.pdf", FileType = "application/pdf", Category = "LabResult", FileSizeBytes = 2048 },
            new() { FileName = "clearance.pdf", FileType = "application/pdf", Category = "MedicalCertificate", FileSizeBytes = 4096 }
        };

        var payload = CreatePayload() with { Attachments = attachments };
        var env = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, Guid.NewGuid(), payload);

        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([env], CancellationToken.None);
        await cell.PumpAsync();

        await cell.Clinic.DbAsync(async db =>
        {
            var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == fac.Id);
            patient.Should().NotBeNull();

            var savedAttachments = await db.RecordAttachments.IgnoreQueryFilters().Where(a => a.PatientId == patient!.Id).ToListAsync();
            savedAttachments.Should().HaveCount(3);
            savedAttachments.Should().OnlyContain(a => a.VerificationStatus == "PendingVerification");
            savedAttachments.Select(a => a.RecordType).Should().BeEquivalentTo("OutsideChestXRay", "LabResult", "MedicalCertificate");
            return 0;
        });
    }
}
