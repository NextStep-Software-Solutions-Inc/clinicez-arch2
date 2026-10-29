using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Messaging;

/// <summary>
/// Phase 2 (Tier 5) White-Box Adversarial Coverage Tests for Backend Ingestion Pipeline:
/// 1. Idempotency & Duplicate Replays (differing correlation IDs vs identical correlation IDs).
/// 2. Concurrency & Race Conditions (near-simultaneous join requests, patient code & queue sequence collisions).
/// 3. Extreme Boundary Dates (leap day births, expiration down to millisecond boundary, timezone handling).
/// 4. Payload Stress & Massive Data (oversized custom fields, multiple attachments, empty collections).
/// 5. Malicious Injection & Unicode Edge Cases (SQL injection, XSS, Bidi overrides, zero-width chars, emojis, single-word names).
/// </summary>
public class PatientJoinTier5AdversarialTests
{
    private const string TenantId = "tenant_adv_tier5";

    private static PatientJoinRequestedHandler CreateHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), NullLogger<PatientJoinRequestedHandler>.Instance);

    private static InteropMessageContext Delivered(PatientJoinRequestedPayload payload, Party to, Guid? correlationId = null)
    {
        var corrId = correlationId ?? payload.JoinRequestId ?? Guid.NewGuid();
        return MessagingTestKit.Delivered(
            InteropTypes.PatientJoinRequested,
            Party.Portal,
            to,
            corrId,
            payload);
    }

    private static PatientJoinRequestedPayload CreatePayload(
        string firstName = "Adversarial",
        string lastName = "Patient",
        string joinCode = "TIER5JOIN",
        string facilitySlug = "main-clinic",
        DateOnly? dob = null,
        string? memberType = "MM")
    {
        return new PatientJoinRequestedPayload
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = "adv-tenant",
            FacilitySlug = facilitySlug,
            JoinCode = joinCode,
            FirstName = firstName,
            LastName = lastName,
            DateOfBirth = dob ?? new DateOnly(1995, 5, 20),
            Sex = "Female",
            CivilStatus = "Single",
            ContactNumber = "0917-123-4567",
            Email = "adv.patient@example.ph",
            Address = "123 Defense Blvd, Manila",
            PhilHealthPin = "12-345678901-8",
            MemberType = memberType,
            ReasonForVisit = "Tier 5 Adversarial Ingestion Evaluation",
            CustomFields = new Dictionary<string, object?>
            {
                ["audit_tier"] = 5,
                ["environment"] = "adversarial"
            }
        };
    }

    private static FacilitySettings SeedConfiguredClinic(ApplicationDbContext db, Guid clinicId, string joinCode = "TIER5JOIN")
    {
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Adversarial Testing Clinic");
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = joinCode;
        clinic.JoinCodeExpiresAt = DateTime.UtcNow.AddDays(30);
        db.SaveChanges();
        return clinic;
    }

    // =========================================================================
    // 1. IDEMPOTENCY & DUPLICATE MESSAGE REPLAY
    // =========================================================================

    [Fact]
    public async Task Idempotency_DuplicateReplay_WithIdenticalCorrelationId_SkipsWithoutDuplicates()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var payload = CreatePayload();
        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        var correlationId = Guid.NewGuid();
        var handler = CreateHandler(db);

        // 1st delivery
        await handler.HandleAsync(payload, Delivered(payload, to, correlationId), CancellationToken.None);

        var patientsCount1 = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        var queueCount1 = await db.QueueItems.IgnoreQueryFilters().CountAsync(q => q.ClinicId == clinicId);
        patientsCount1.Should().Be(1);
        queueCount1.Should().Be(1);

        // 2nd delivery (identical CorrelationId)
        await handler.HandleAsync(payload, Delivered(payload, to, correlationId), CancellationToken.None);

        var patientsCount2 = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        var queueCount2 = await db.QueueItems.IgnoreQueryFilters().CountAsync(q => q.ClinicId == clinicId);
        patientsCount2.Should().Be(1, "replay with identical correlation ID must not create duplicate patient");
        queueCount2.Should().Be(1, "replay with identical correlation ID must not create duplicate queue ticket");
    }

    [Fact]
    public async Task Idempotency_DuplicateReplay_WithDifferingCorrelationId_ButIdenticalJoinRequestId_SkipsWithoutDuplicates()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var fixedJoinRequestId = Guid.NewGuid();
        var payload = CreatePayload() with { JoinRequestId = fixedJoinRequestId };
        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        var handler = CreateHandler(db);

        // 1st delivery with CorrelationId A
        var corrA = Guid.NewGuid();
        await handler.HandleAsync(payload, Delivered(payload, to, corrA), CancellationToken.None);

        // 2nd delivery with different CorrelationId B but same JoinRequestId
        var corrB = Guid.NewGuid();
        await handler.HandleAsync(payload, Delivered(payload, to, corrB), CancellationToken.None);

        var patientsCount = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        var queueCount = await db.QueueItems.IgnoreQueryFilters().CountAsync(q => q.ClinicId == clinicId);
        patientsCount.Should().Be(1, "replay with differing correlation ID but identical JoinRequestId must be deduplicated");
        queueCount.Should().Be(1, "replay with differing correlation ID but identical JoinRequestId must not issue duplicate queue ticket");
    }

    [Fact]
    public async Task Idempotency_SoftDeletedPatient_WithSameJoinRequestId_AllocatesNewIdAndAdvancesSequence()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var sharedJoinRequestId = Guid.NewGuid();
        var payload1 = CreatePayload("Deleted", "Original") with { JoinRequestId = sharedJoinRequestId };
        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        var handler = CreateHandler(db);

        // First ingestion
        await handler.HandleAsync(payload1, Delivered(payload1, to, sharedJoinRequestId), CancellationToken.None);

        // Soft-delete the patient
        var patient1 = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        patient1.IsDeleted = true;
        patient1.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Second ingestion with same JoinRequestId
        var payload2 = CreatePayload("New", "Active") with { JoinRequestId = sharedJoinRequestId };
        var corr2 = Guid.NewGuid();
        await handler.HandleAsync(payload2, Delivered(payload2, to, corr2), CancellationToken.None);

        var patients = await db.Patients.IgnoreQueryFilters().Where(p => p.ClinicId == clinicId).ToListAsync();
        patients.Should().HaveCount(2, "soft-deleted patient should allow subsequent ingestion with same JoinRequestId to allocate fresh record");
        
        var activePatient = patients.First(p => !p.IsDeleted);
        activePatient.FirstName.Should().Be("New");
        activePatient.Id.Should().NotBe(sharedJoinRequestId, "id collision with soft-deleted record must trigger fresh Guid generation");
        activePatient.PatientCode.Should().Be("PAT-" + DateTime.UtcNow.Year + "-00002", "sequence must advance past soft-deleted code");
    }

    // =========================================================================
    // 2. CONCURRENCY & RACE CONDITIONS
    // =========================================================================

    [Fact]
    public async Task Concurrency_SequentialMultiIngestion_AllocatesConsecutivePatientCodesAndQueueNumbers()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var handler = CreateHandler(db);
        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);

        const int batchSize = 5;
        for (var i = 1; i <= batchSize; i++)
        {
            var payload = CreatePayload($"Sequential{i}", $"Patient{i}");
            await handler.HandleAsync(payload, Delivered(payload, to), CancellationToken.None);
        }

        var patients = await db.Patients.IgnoreQueryFilters()
            .Where(p => p.ClinicId == clinicId)
            .OrderBy(p => p.PatientCode)
            .ToListAsync();

        var queueItems = await db.QueueItems.IgnoreQueryFilters()
            .Where(q => q.ClinicId == clinicId)
            .OrderBy(q => q.SequenceNumber)
            .ToListAsync();

        patients.Should().HaveCount(batchSize);
        queueItems.Should().HaveCount(batchSize);

        var currentYear = DateTime.UtcNow.Year;
        for (var i = 0; i < batchSize; i++)
        {
            var expectedSeq = i + 1;
            patients[i].PatientCode.Should().Be($"PAT-{currentYear}-{expectedSeq:D5}");
            queueItems[i].SequenceNumber.Should().Be(expectedSeq);
            queueItems[i].QueueNumber.Should().Be($"Q-{expectedSeq:D3}");
        }
    }

    [Fact]
    public async Task Concurrency_DistinctClinics_MaintainStrictIsolationWithoutCrossContamination()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();

        var settingsA = MessagingTestKit.SeedClinic(db, clinicA, TenantId, "Clinic Alpha");
        settingsA.FacilitySlug = "clinic-alpha";
        settingsA.IsJoinEnabled = true;
        settingsA.JoinCode = "ALPHA2026";
        settingsA.JoinCodeExpiresAt = DateTime.UtcNow.AddDays(7);

        var settingsB = MessagingTestKit.SeedClinic(db, clinicB, TenantId, "Clinic Beta");
        settingsB.FacilitySlug = "clinic-beta";
        settingsB.IsJoinEnabled = true;
        settingsB.JoinCode = "BETA2026";
        settingsB.JoinCodeExpiresAt = DateTime.UtcNow.AddDays(7);

        db.SaveChanges();

        var handler = CreateHandler(db);
        var toA = MessagingTestKit.ClinicParty(TenantId, clinicA);
        var toB = MessagingTestKit.ClinicParty(TenantId, clinicB);

        var pA1 = CreatePayload("Alpha1", "Patient", "ALPHA2026", "clinic-alpha");
        var pA2 = CreatePayload("Alpha2", "Patient", "ALPHA2026", "clinic-alpha");
        var pB1 = CreatePayload("Beta1", "Patient", "BETA2026", "clinic-beta");

        await handler.HandleAsync(pA1, Delivered(pA1, toA), CancellationToken.None);
        await handler.HandleAsync(pB1, Delivered(pB1, toB), CancellationToken.None);
        await handler.HandleAsync(pA2, Delivered(pA2, toA), CancellationToken.None);

        var patientsA = await db.Patients.IgnoreQueryFilters().Where(p => p.ClinicId == clinicA).OrderBy(p => p.PatientCode).ToListAsync();
        var patientsB = await db.Patients.IgnoreQueryFilters().Where(p => p.ClinicId == clinicB).OrderBy(p => p.PatientCode).ToListAsync();

        patientsA.Should().HaveCount(2);
        patientsA[0].PatientCode.Should().EndWith("-00001");
        patientsA[1].PatientCode.Should().EndWith("-00002");

        patientsB.Should().HaveCount(1);
        patientsB[0].PatientCode.Should().EndWith("-00001", "clinic Beta sequence starts from 1 independently");

        var queueA = await db.QueueItems.IgnoreQueryFilters().Where(q => q.ClinicId == clinicA).OrderBy(q => q.SequenceNumber).ToListAsync();
        var queueB = await db.QueueItems.IgnoreQueryFilters().Where(q => q.ClinicId == clinicB).OrderBy(q => q.SequenceNumber).ToListAsync();

        queueA.Select(q => q.QueueNumber).Should().Equal("Q-001", "Q-002");
        queueB.Select(q => q.QueueNumber).Should().Equal("Q-001");
    }

    // =========================================================================
    // 3. EXTREME BOUNDARY DATES & EXPIRATION
    // =========================================================================

    [Theory]
    [InlineData(2000, 2, 29)] // Leap year (century divisble by 400)
    [InlineData(2024, 2, 29)] // Recent leap year
    [InlineData(1996, 2, 29)] // Typical 4-year leap year
    [InlineData(1900, 3, 1)]  // Non-leap century boundary
    public async Task BoundaryDates_LeapDayBirths_PersistAccuratelyInDemographicsAndYakapProfile(int year, int month, int day)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var leapDob = new DateOnly(year, month, day);
        var principalLeapDob = new DateOnly(1980, 2, 29);

        var payload = CreatePayload("LeapBaby", "Santos", dob: leapDob, memberType: "DD") with
        {
            PrincipalFullName = "Maria Santos",
            PrincipalMemberPin = "10-000000000-5",
            PrincipalRelationship = "P",
            PrincipalDateOfBirth = principalLeapDob
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        patient.DateOfBirth.Should().Be(leapDob);

        // Check PhilHealth dependent profile mapping
        var membership = await db.PatientPhilHealthMemberships.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.PatientId == patient.Id);
        membership.Should().NotBeNull();
        membership!.PrincipalDateOfBirth.Should().Be(new DateOnly(1980, 2, 29));
        membership.MemberType.Should().Be(PhilHealthMemberType.DD);
    }

    [Fact]
    public async Task BoundaryDates_JoinCodeExpiration_ExactSecondAndMillisecondGranularity()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = SeedConfiguredClinic(db, clinicId);

        var handler = CreateHandler(db);
        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);

        // 1. Join code expires in future -> Accepted
        clinic.JoinCodeExpiresAt = DateTime.UtcNow.AddMinutes(5);
        db.SaveChanges();

        var pValid = CreatePayload("Active", "User");
        await handler.HandleAsync(pValid, Delivered(pValid, to), CancellationToken.None);
        var activeCount = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        activeCount.Should().Be(1);

        // 2. Join code expired 1 second ago -> Dropped
        clinic.JoinCodeExpiresAt = DateTime.UtcNow.AddSeconds(-1);
        db.SaveChanges();

        var pExpired = CreatePayload("Expired", "User");
        await handler.HandleAsync(pExpired, Delivered(pExpired, to), CancellationToken.None);
        var expiredCount = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        expiredCount.Should().Be(1, "expired join code request must be silently dropped without inserting patient");

        // 3. Join code expired by exactly 1 millisecond -> Dropped
        clinic.JoinCodeExpiresAt = DateTime.UtcNow.AddMilliseconds(-50);
        db.SaveChanges();

        var pMsExpired = CreatePayload("MsExpired", "User");
        await handler.HandleAsync(pMsExpired, Delivered(pMsExpired, to), CancellationToken.None);
        var msExpiredCount = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        msExpiredCount.Should().Be(1, "join code expired by even milliseconds must be dropped");
    }

    [Fact]
    public async Task BoundaryDates_TimezoneHandling_UtcAndLocalInSettingsCommand()
    {
        // Testing UpdateClinicSettingsCommandHandler with various DateTime kinds
        var clinicId = Guid.NewGuid();
        var context = Substitute.For<IClinicContext>();
        context.ClinicId.Returns(clinicId);
        context.TenantId.Returns(TenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(context);
        var clinic = SeedConfiguredClinic(db, clinicId);
        var repo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var handler = new UpdateClinicSettingsCommandHandler(repo, context, uow);

        // 1. Pass explicit UTC expiration
        var utcExpiry = DateTime.UtcNow.AddDays(7);
        var cmdUtc = new UpdateClinicSettingsCommand(JoinCode: "CODEUTC", JoinCodeExpiresAt: utcExpiry);
        var resUtc = await handler.Handle(cmdUtc, CancellationToken.None);

        resUtc.JoinCode.Should().Be("CODEUTC");
        resUtc.JoinCodeExpiresAt.Should().Be(utcExpiry);

        // 2. Pass ClearJoinCode
        var cmdClear = new UpdateClinicSettingsCommand(ClearJoinCode: true);
        var resClear = await handler.Handle(cmdClear, CancellationToken.None);

        resClear.JoinCode.Should().BeNull();
        resClear.JoinCodeExpiresAt.Should().BeNull();
    }

    // =========================================================================
    // 4. PAYLOAD STRESS & MASSIVE DATA
    // =========================================================================

    [Fact]
    public async Task PayloadStress_MassiveCustomFieldsDictionary_SerializesAndPersistsSuccessfully()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var customFields = new Dictionary<string, object?>();
        for (var i = 0; i < 500; i++)
        {
            customFields[$"custom_field_key_{i:D4}"] = $"synthetic_value_{i}_{Guid.NewGuid():N}";
        }
        customFields["nested_meta"] = new { campus = "Main", year_level = 4, honors = true };

        var payload = CreatePayload("Massive", "Metadata") with { CustomFields = customFields };
        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        patient.CustomFields.Should().NotBeNull();
        patient.CustomFields.Count.Should().BeGreaterThanOrEqualTo(500);
        patient.CustomFields.Should().ContainKey("custom_field_key_0000");
        patient.CustomFields.Should().ContainKey("custom_field_key_0499");
        patient.CustomFields.Should().ContainKey("join_tracking_id");
    }

    [Fact]
    public async Task PayloadStress_MultipleAttachmentsAndAllergies_PersistInQuarantineWithPendingVerification()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var attachments = new List<PatientJoinAttachmentItem>();
        for (var i = 1; i <= 5; i++)
        {
            attachments.Add(new PatientJoinAttachmentItem
            {
                Id = Guid.NewGuid(),
                FileName = $"diagnostic_report_{i}.pdf",
                FileType = "application/pdf",
                StorageKey = $"quarantine/patient_{i}/diagnostic_report_{i}.pdf",
                FileSizeBytes = 500_000 * i,
                Category = i % 2 == 0 ? "Radiology" : "LabResult",
                Title = $"Diagnostic Test {i}"
            });
        }

        var allergies = new List<PatientJoinAllergyItem>
        {
            new() { Allergen = "Penicillin", Category = "Medication", Severity = "Severe", IsAnaphylactic = true },
            new() { Allergen = "Peanuts", Category = "Food", Severity = "LifeThreatening", IsAnaphylactic = true },
            new() { Allergen = "Pollen", Category = "Environmental", Severity = "Mild", IsAnaphylactic = false }
        };

        var payload = CreatePayload("MultiDoc", "Patient") with
        {
            Attachments = attachments,
            Allergies = allergies
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);

        // Verify attachments quarantined
        var savedAttachments = await db.RecordAttachments.IgnoreQueryFilters()
            .Where(a => a.PatientId == patient.Id)
            .ToListAsync();

        savedAttachments.Should().HaveCount(5);
        savedAttachments.Should().OnlyContain(a => a.VerificationStatus == "PendingVerification");
        savedAttachments.Should().OnlyContain(a => a.UploadedByStaffName == "Patient Public Join Intake");

        // Verify allergies saved
        var savedAllergies = await db.PatientAllergies.IgnoreQueryFilters()
            .Where(a => a.PatientId == patient.Id)
            .ToListAsync();

        savedAllergies.Should().HaveCount(3);
        savedAllergies.Select(a => a.Allergen).Should().BeEquivalentTo("Penicillin", "Peanuts", "Pollen");
    }

    [Fact]
    public async Task PayloadStress_NullAndEmptyCollections_HandledGracefullyWithoutExceptions()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var payload = CreatePayload("Empty", "Collections") with
        {
            Allergies = [],
            Attachments = [],
            CustomFields = null
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        patient.Should().NotBeNull();
        patient.Allergies.Should().BeNull();
        patient.CustomFields.Should().ContainKey("join_tracking_id");

        var attachmentCount = await db.RecordAttachments.IgnoreQueryFilters().CountAsync(a => a.PatientId == patient.Id);
        attachmentCount.Should().Be(0);

        var allergyCount = await db.PatientAllergies.IgnoreQueryFilters().CountAsync(a => a.PatientId == patient.Id);
        allergyCount.Should().Be(0);
    }

    // =========================================================================
    // 5. MALICIOUS INJECTION & UNICODE EDGE CASES
    // =========================================================================

    [Fact]
    public async Task Security_MaliciousInjection_SqlAndScriptTags_StoredLiterallyWithoutExecution()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        const string sqlPayload = "Robert'; DROP TABLE Students;--";
        const string xssPayload = "<script>alert('pwned')</script>";
        const string htmlImgPayload = "<img src=x onerror=alert(1)>";

        var payload = CreatePayload(sqlPayload, xssPayload) with
        {
            MiddleName = htmlImgPayload,
            Suffix = "'; SELECT * FROM Users;--",
            Address = "123 Injection St <iframe src=evil.com></iframe>",
            ReasonForVisit = "Annual exam <script>document.cookie</script>"
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        patient.FirstName.Should().Be(sqlPayload);
        patient.LastName.Should().Be(xssPayload);
        patient.MiddleName.Should().Be(htmlImgPayload);

        var queueItem = await db.QueueItems.IgnoreQueryFilters().FirstAsync(q => q.PatientId == patient.Id);
        queueItem.ChiefComplaint.Should().Be("Annual exam <script>document.cookie</script>");
        // PatientName format: "{LastName}, {FirstName} {MiddleName[0]}."
        queueItem.PatientName.Should().Contain(sqlPayload);
    }

    [Fact]
    public async Task Security_UnicodeInjection_BidiOverridesAndComplexDiacritics_HandledWithoutCrashing()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        // Bidi RTL override (\u202E), zero-width non-joiner (\u200C), Philippine ñ and accents
        const string bidiFirst = "\u202EBidirectional\u202C";
        const string filipinoLast = "Dela Cruz-Niño";
        const string emojiAddress = "Barangay San José 🏥 Unit 402 🇵🇭";

        var payload = CreatePayload(bidiFirst, filipinoLast) with
        {
            Address = emojiAddress,
            MiddleName = "Iñigo"
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        patient.FirstName.Should().Be(bidiFirst);
        patient.LastName.Should().Be(filipinoLast);
        patient.CustomFields["primary_address_line"]!.ToString().Should().Be(emojiAddress);
        patient.MiddleName.Should().Be("Iñigo");

        var queueItem = await db.QueueItems.IgnoreQueryFilters().FirstAsync(q => q.PatientId == patient.Id);
        queueItem.PatientName.Should().Be("Dela Cruz-Niño, \u202EBidirectional\u202C I.");
    }

    [Theory]
    [InlineData("Madonna", "Madonna", "Madonna")]
    [InlineData("Juan Ponce Enrile", "Juan Ponce", "Enrile")]
    [InlineData("Jose Rizal", "Jose", "Rizal")]
    [InlineData("   ", null, null)]
    [InlineData(null, null, null)]
    public async Task Security_PhilHealthDependent_PrincipalFullNameSplit_EdgeCases(string? inputFullName, string? expectedFirst, string? expectedLast)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var payload = CreatePayload("DepChild", "Santos", memberType: "DD") with
        {
            PrincipalFullName = inputFullName,
            PrincipalMemberPin = "10-000000000-5",
            PrincipalRelationship = "P"
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        var membership = await db.PatientPhilHealthMemberships.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.PatientId == patient.Id);
        if (expectedFirst == null && expectedLast == null)
        {
            membership?.PrincipalFirstName.Should().BeNull();
            membership?.PrincipalLastName.Should().BeNull();
        }
        else
        {
            membership.Should().NotBeNull();
            membership!.PrincipalFirstName.Should().Be(expectedFirst);
            membership.PrincipalLastName.Should().Be(expectedLast);
        }
    }

    [Theory]
    [InlineData("S", "S")]
    [InlineData("Spouse", "S")]
    [InlineData("C", "C")]
    [InlineData("Child", "C")]
    [InlineData("P", "P")]
    [InlineData("Parent", "P")]
    [InlineData("D", "D")]
    [InlineData("Disabled", "D")]
    [InlineData("other", "C")] // Fallback to Child
    [InlineData(null, null)]
    public async Task Security_PhilHealthDependent_RelationshipNormalization_AllBranchesCovered(string? inputRel, string? expectedRel)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var payload = CreatePayload("DepChild", "Santos", memberType: "DD") with
        {
            PrincipalFullName = "Maria Santos",
            PrincipalMemberPin = "10-000000000-5",
            PrincipalRelationship = inputRel
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        var membership = await db.PatientPhilHealthMemberships.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.PatientId == patient.Id);
        membership.Should().NotBeNull();
        var expectedEnum = expectedRel != null && Enum.TryParse<PhilHealthDependentRelationship>(expectedRel, out var r) ? (PhilHealthDependentRelationship?)r : null;
        membership!.DependentRelationship.Should().Be(expectedEnum);
    }

    [Fact]
    public async Task EdgeConditions_CaseInsensitiveMatching_FacilitySlugAndJoinCode_AreTolerant()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId, "SECRETCODE");

        // lowercase join code and uppercase facility slug
        var payload = CreatePayload("Case", "Test", "secretcode", "MAIN-CLINIC");
        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == clinicId);
        patient.Should().NotBeNull("casing differences in join code and facility slug must be tolerated");
    }

    [Fact]
    public async Task EdgeConditions_AttachmentSyntheticStorageUri_FallbackGeneratedWhenKeysAreNull()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var payload = CreatePayload("NoUri", "Att") with
        {
            Attachments =
            [
                new PatientJoinAttachmentItem
                {
                    FileName = "doc_no_key.pdf",
                    StorageKey = null,
                    StorageUri = null,
                    Category = "unknown_category"
                }
            ]
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var attachment = await db.RecordAttachments.IgnoreQueryFilters().FirstAsync();
        attachment.StorageUri.Should().Contain($"tenants/{TenantId}/clinics/{clinicId}/records/");
        attachment.StorageUri.Should().EndWith(".cez");
        attachment.RecordType.Should().Be("LabResult", "unknown document type should safely map to LabResult");
    }

    [Fact]
    public async Task EdgeConditions_NullSexAndContactNumber_SafelyDefaultToFallbackStrings()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        SeedConfiguredClinic(db, clinicId);

        var payload = CreatePayload("Null", "Fields") with
        {
            Sex = "   ",
            ContactNumber = "",
            MiddleName = null,
            Suffix = null
        };

        var to = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, to), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstAsync(p => p.ClinicId == clinicId);
        patient.Sex.Should().Be(BiologicalSex.Unknown);
        patient.ContactNumber.Should().Be("N/A");
        patient.MiddleName.Should().BeNull();
        patient.Suffix.Should().BeNull();

        var queueItem = await db.QueueItems.IgnoreQueryFilters().FirstAsync();
        queueItem.PatientName.Should().Be("Fields, Null", "empty middle and suffix should not produce trailing spaces or dots");
    }

    [Fact]
    public async Task Concurrency_CollidingPatientCodes_ThrowsUniqueConstraintDbUpdateException()
    {
        // Demonstrates that under simultaneous race conditions, if two handlers were to attempt saving
        // the same PatientCode, ApplicationDbContext simulates PostgreSQL 23505 unique violation on SaveChangesAsync,
        // allowing the Interop poller to catch, nack, and retry.
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();

        var patient1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-2026-00001",
            FirstName = "First",
            LastName = "User",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "0917-000-0001"
        };
        db.Patients.Add(patient1);
        await db.SaveChangesAsync();

        var patient2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-2026-00001", // Duplicate code
            FirstName = "Second",
            LastName = "User",
            DateOfBirth = new DateOnly(1991, 1, 1),
            ContactNumber = "0917-000-0002"
        };
        db.Patients.Add(patient2);

        var act = async () => await db.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>()
            .WithMessage("*23505*PatientCode*");
    }
}

