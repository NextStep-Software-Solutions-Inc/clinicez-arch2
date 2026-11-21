using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Messaging;

public class PatientJoinRequestedHandlerTests
{
    private const string TenantId = "tenant_test";

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

    private static PatientJoinRequestedPayload CreateStandardPayload(
        string tenantSlug = "test-tenant",
        string facilitySlug = "main-clinic",
        string joinCode = "JOIN2026",
        string memberType = "MM")
    {
        return new PatientJoinRequestedPayload
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = tenantSlug,
            FacilitySlug = facilitySlug,
            JoinCode = joinCode,
            FirstName = "Juan",
            MiddleName = "Protacio",
            LastName = "Rizal",
            Suffix = "Jr",
            DateOfBirth = new DateOnly(1995, 6, 19),
            Sex = "Male",
            CivilStatus = "Single",
            ContactNumber = "0917-123-4567",
            Email = "juan.rizal@example.ph",
            Address = "Calamba, Laguna",
            PhilHealthPin = "12-345678901-8",
            MemberType = memberType,
            ReasonForVisit = "Annual Clinical Health Assessment",
            CustomFields = new Dictionary<string, object?>
            {
                ["student_id"] = "2026-00912",
                ["college"] = "Engineering"
            },
            Allergies =
            [
                new PatientJoinAllergyItem
                {
                    Allergen = "Amoxicillin",
                    Category = "Medication",
                    Severity = "Severe",
                    IsAnaphylactic = true,
                    Notes = "Skin rash and shortness of breath"
                }
            ],
            Attachments =
            [
                new PatientJoinAttachmentItem
                {
                    FileName = "chest_xray_2026.pdf",
                    FileType = "application/pdf",
                    StorageKey = "quarantine/docs/chest_xray_2026.pdf",
                    FileSizeBytes = 1048576,
                    Category = "Radiology",
                    Title = "Chest X-Ray 2026"
                }
            ]
        };
    }

    [Fact]
    public async Task Handle_HappyPath_IngestsPatientInQuarantineWithSequentialCodeQueueTicketAllergiesAndAttachments()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN2026";
        clinic.JoinCodeExpiresAt = DateTime.UtcNow.AddDays(7);
        db.SaveChanges();

        var payload = CreateStandardPayload();
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);
        var correlationId = Guid.NewGuid();

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty, correlationId), CancellationToken.None);

        // Verify patient created in quarantine
        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == clinicId);
        patient.Should().NotBeNull();
        patient!.FirstName.Should().Be("Juan");
        patient.LastName.Should().Be("Rizal");
        patient.MiddleName.Should().Be("Protacio");
        patient.Suffix.Should().Be("Jr");
        patient.VerificationStatus.Should().Be(PatientVerificationStatus.PendingVerification);
        patient.PatientCode.Should().MatchRegex(@"^PAT-\d{4}-\d{5}$");
        patient.CustomFields.Should().ContainKey("join_tracking_id");
        patient.CustomFields["join_tracking_id"]!.ToString().Should().Be(correlationId.ToString());
        patient.CustomFields.Should().ContainKey("student_id");

        // Verify structured allergies persisted
        var allergies = await db.PatientAllergies.IgnoreQueryFilters().Where(a => a.PatientId == patient.Id).ToListAsync();
        allergies.Should().ContainSingle();
        allergies[0].Allergen.Should().Be("Amoxicillin");
        allergies[0].Category.Should().Be(AllergyCategory.Medication);
        allergies[0].Severity.Should().Be(AllergySeverity.Severe);
        allergies[0].IsAnaphylactic.Should().BeTrue();
        allergies[0].Status.Should().Be(AllergyStatus.Active);

        // Verify daily queue ticket issued
        var queueItems = await db.QueueItems.IgnoreQueryFilters().Where(q => q.PatientId == patient.Id).ToListAsync();
        queueItems.Should().ContainSingle();
        queueItems[0].QueueNumber.Should().Be("Q-001");
        queueItems[0].Status.Should().Be(QueueStatus.Waiting);
        queueItems[0].Priority.Should().Be(QueuePriority.Routine);
        queueItems[0].ChiefComplaint.Should().Be("Annual Clinical Health Assessment");

        // Verify attachment placed in quarantine
        var attachments = await db.RecordAttachments.IgnoreQueryFilters().Where(a => a.PatientId == patient.Id).ToListAsync();
        attachments.Should().ContainSingle();
        attachments[0].FileName.Should().Be("chest_xray_2026.pdf");
        attachments[0].VerificationStatus.Should().Be("PendingVerification");
        attachments[0].RecordType.Should().Be("OutsideChestXRay");
        attachments[0].StorageUri.Should().Be("quarantine/docs/chest_xray_2026.pdf");
    }

    [Fact]
    public async Task Handle_MismatchedJoinCode_RejectsAndDropsEnrollment()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "CAMPUS2026";
        db.SaveChanges();

        var payload = CreateStandardPayload(joinCode: "WRONGCODE");
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var patients = await db.Patients.IgnoreQueryFilters().ToListAsync();
        patients.Should().BeEmpty();
        var queueItems = await db.QueueItems.IgnoreQueryFilters().ToListAsync();
        queueItems.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_CaseInsensitiveJoinCode_MatchesSuccessfully()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "CAMPUS2026";
        db.SaveChanges();

        var payload = CreateStandardPayload(joinCode: "campus2026 ");
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == clinicId);
        patient.Should().NotBeNull();
        patient!.FirstName.Should().Be("Juan");
    }

    [Fact]
    public async Task Handle_ExpiredJoinCode_RejectsAndDropsEnrollment()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN2026";
        clinic.JoinCodeExpiresAt = DateTime.UtcNow.AddMinutes(-10); // Expired
        db.SaveChanges();

        var payload = CreateStandardPayload(joinCode: "JOIN2026");
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var patients = await db.Patients.IgnoreQueryFilters().ToListAsync();
        patients.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_JoinDisabled_RejectsAndDropsEnrollment()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = false;
        clinic.JoinCode = "JOIN2026";
        db.SaveChanges();

        var payload = CreateStandardPayload(joinCode: "JOIN2026");
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var patients = await db.Patients.IgnoreQueryFilters().ToListAsync();
        patients.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_NoJoinCodeConfiguredOnClinic_AcceptsAnyCode()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = null; // No code required
        db.SaveChanges();

        var payload = CreateStandardPayload(joinCode: "");
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == clinicId);
        patient.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_FacilitySlugMismatch_DropsEnrollment()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "branch-alpha";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN2026";
        db.SaveChanges();

        var payload = CreateStandardPayload(facilitySlug: "branch-beta");
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var patients = await db.Patients.IgnoreQueryFilters().ToListAsync();
        patients.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_MemberTypeDependentDD_MapsPrincipalCredentialsToPhilHealthProfile()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN2026";
        db.SaveChanges();

        var payload = new PatientJoinRequestedPayload
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = "test-tenant",
            FacilitySlug = "main-clinic",
            JoinCode = "JOIN2026",
            FirstName = "Maria Clara",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(2015, 8, 20),
            Sex = "Female",
            ContactNumber = "0918-987-6543",
            PhilHealthPin = "10-000000000-5",
            MemberType = "DD",
            PrincipalMemberPin = "12-345678901-8",
            PrincipalFullName = "Juan Protacio Rizal",
            PrincipalRelationship = "P",
            PrincipalDateOfBirth = new DateOnly(1980, 5, 1)
        };

        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == clinicId);
        patient.Should().NotBeNull();
        var membership = await db.PatientPhilHealthMemberships.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.PatientId == patient!.Id);
        membership.Should().NotBeNull();
        membership!.MemberType.Should().Be(PhilHealthMemberType.DD);
        patient.PhilHealthNumber.Should().Be("10-000000000-5");
        membership.PrincipalMemberPin.Should().Be("12-345678901-8");
        membership.DependentRelationship.Should().Be(PhilHealthDependentRelationship.P);
        membership.PrincipalLastName.Should().Be("Rizal");
        membership.PrincipalFirstName.Should().Be("Juan Protacio");
        membership.PrincipalDateOfBirth.Should().Be(new DateOnly(1980, 5, 1));
    }

    [Fact]
    public async Task Handle_MemberTypePrincipalMM_MapsMemberCredentialsToPhilHealthProfile()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN2026";
        db.SaveChanges();

        var payload = CreateStandardPayload(memberType: "MM");
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);
        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == clinicId);
        patient.Should().NotBeNull();
        var membership = await db.PatientPhilHealthMemberships.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.PatientId == patient!.Id);
        membership.Should().NotBeNull();
        membership!.MemberType.Should().Be(PhilHealthMemberType.MM);
        patient.PhilHealthNumber.Should().Be("12-345678901-8");
        membership.MemberPin.Should().Be("12-345678901-8");
    }

    [Fact]
    public async Task Handle_IdempotentRedelivery_SkipsDuplicateCreation()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN2026";
        db.SaveChanges();

        var payload = CreateStandardPayload();
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);
        var correlationId = Guid.NewGuid();

        var handler = CreateHandler(db);
        // First delivery
        await handler.HandleAsync(payload, Delivered(payload, targetParty, correlationId), CancellationToken.None);

        // Second delivery (duplicate)
        await handler.HandleAsync(payload, Delivered(payload, targetParty, correlationId), CancellationToken.None);

        var patientCount = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId);
        patientCount.Should().Be(1);

        var queueItemCount = await db.QueueItems.IgnoreQueryFilters().CountAsync(q => q.ClinicId == clinicId);
        queueItemCount.Should().Be(1);
    }

    [Fact]
    public async Task Handle_SequentialCodeGeneration_AllocatesSequentialCodesAcrossMultiplePatients()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN2026";
        db.SaveChanges();

        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);
        var handler = CreateHandler(db);

        var payload1 = CreateStandardPayload();
        await handler.HandleAsync(payload1, Delivered(payload1, targetParty), CancellationToken.None);

        var payload2 = new PatientJoinRequestedPayload
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = "test-tenant",
            FacilitySlug = "main-clinic",
            JoinCode = "JOIN2026",
            FirstName = "Andres",
            LastName = "Bonifacio",
            DateOfBirth = new DateOnly(1990, 11, 30),
            Sex = "Male",
            ContactNumber = "0917-999-8888"
        };
        await handler.HandleAsync(payload2, Delivered(payload2, targetParty), CancellationToken.None);

        var patients = await db.Patients.IgnoreQueryFilters().Where(p => p.ClinicId == clinicId).OrderBy(p => p.CreatedAt).ToListAsync();
        patients.Should().HaveCount(2);

        var year = DateTime.UtcNow.Year;
        patients[0].PatientCode.Should().Be($"PAT-{year}-00001");
        patients[1].PatientCode.Should().Be($"PAT-{year}-00002");

        var queueItems = await db.QueueItems.IgnoreQueryFilters().Where(q => q.ClinicId == clinicId).OrderBy(q => q.SequenceNumber).ToListAsync();
        queueItems.Should().HaveCount(2);
        queueItems[0].QueueNumber.Should().Be("Q-001");
        queueItems[1].QueueNumber.Should().Be("Q-002");
    }

    [Fact]
    public async Task Handle_SoftDeletedPatientCodeCollision_AvoidsCollisions()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN2026";

        var year = DateTime.UtcNow.Year;
        // Seed soft-deleted patient with PAT-yyyy-00005
        db.Patients.Add(new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = clinicId,
            PatientCode = $"PAT-{year}-00005",
            FirstName = "Deleted",
            LastName = "User",
            DateOfBirth = new DateOnly(1985, 1, 1),
            ContactNumber = "0911-000-0000",
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "seed"
        });
        db.SaveChanges();

        var payload = CreateStandardPayload();
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        await CreateHandler(db).HandleAsync(payload, Delivered(payload, targetParty), CancellationToken.None);

        var newPatient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => !p.IsDeleted && p.ClinicId == clinicId);
        newPatient.Should().NotBeNull();
        newPatient!.PatientCode.Should().Be($"PAT-{year}-00006");
    }
}
