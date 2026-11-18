using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Features.Settings.Services;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Application.Features.Staff.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Messaging.Handlers;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.DirectoryVerification;

public class ClinicDirectoryVerificationTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private const string TenantId = "tenant-dir-verify";

    public ClinicDirectoryVerificationTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Dr. Test Admin");
        _clinicContext.StaffRole.Returns("Admin");
    }

    private static FacilityLicenseValidator ValidatingLicenseMock(Guid clinicId, string tenantId, out IFacilityLicenseValidator validator)
    {
        validator = Substitute.For<IFacilityLicenseValidator>();
        validator.Validate(Arg.Any<string?>(), clinicId, tenantId)
            .Returns(LicenseValidationResult.Success(new FacilityLicensePayload
            {
                FacilityId = clinicId,
                TenantId = tenantId,
                Limits = new FacilityLimits { MaxStaff = 25 }
            }));
        return null!;
    }

    #region 1. LTO Proof Upload & Readiness

    [Fact]
    public async Task UploadLtoProof_ValidPdf_StoresKeyAndLogsAuditEntry()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();
        storage.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<string>(0));

        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Sunrise Medical Clinic"
        });
        await uow.SaveChangesAsync();

        var handler = new UploadLtoProofCommandHandler(settingsRepo, storage, _clinicContext, uow, auditRepo: auditRepo);
        var pdfBytes = "%PDF-1.4\ntest-lto-proof"u8.ToArray();

        var result = await handler.Handle(
            new UploadLtoProofCommand("doh-lto.pdf", "application/pdf", pdfBytes.Length, pdfBytes),
            CancellationToken.None);

        result.ObjectKey.Should().StartWith($"tenants/{TenantId}/clinics/{_clinicId:D}/verification/lto/");
        result.ObjectKey.Should().EndWith(".pdf");

        var savedSettings = await context.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == _clinicId);
        savedSettings.LtoEvidenceObjectKey.Should().Be(result.ObjectKey);

        var audit = await context.AuditEntries.IgnoreQueryFilters().SingleAsync(a => a.Action == "operations.lto_proof.uploaded");
        audit.TargetEntityType.Should().Be("FacilitySettings");
        audit.TargetEntityId.Should().Be(_clinicId.ToString());
    }

    [Theory]
    [InlineData("malware.exe", "application/octet-stream", 1024)]
    [InlineData("notes.txt", "text/plain", 1024)]
    [InlineData("huge.pdf", "application/pdf", 5 * 1024 * 1024 + 1)]
    [InlineData("empty.png", "image/png", 0)]
    public async Task UploadLtoProof_InvalidFile_ThrowsValidationException(string fileName, string contentType, int sizeBytes)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();

        var handler = new UploadLtoProofCommandHandler(settingsRepo, storage, _clinicContext, uow);
        var bytes = new byte[sizeBytes];

        var act = () => handler.Handle(new UploadLtoProofCommand(fileName, contentType, sizeBytes, bytes), CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task GetPublishingReadiness_ReturnsVerificationFieldsAndOptedInClinicianCounts()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);

        var submittedAt = DateTime.UtcNow.AddHours(-2);
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Metro Health Clinic",
            OperatingHours = "Mon-Sat 8:00 AM - 5:00 PM",
            LetterheadDohLto = "DOH-LTO-2026-101",
            LtoEvidenceObjectKey = "tenants/t/clinics/c/lto.pdf",
            PlatformVerificationStatus = PlatformVerificationStatus.Rejected,
            VerificationRejectionReason = "LTO certificate date obscured",
            LastVerificationSubmittedAtUtc = submittedAt,
            IsOnlineBookingPaused = true,
            IsWorkspaceEligible = true
        });

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Ready",
            LastName = "Doctor",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0123456",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "prc-doc.pdf",
            VerificationContact = "doc@clinic.ph",
            IsDirectoryOptIn = true,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Incomplete",
            LastName = "Nurse",
            Role = StaffRole.Nurse,
            PrcLicenseNumber = "PRC-0765432",
            IsDirectoryOptIn = true,
            IsActive = true
        });
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Ready",
            LastName = "Nurse",
            Role = StaffRole.Nurse,
            PrcLicenseNumber = "PRC-0555666",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(6)),
            PrcEvidenceObjectKey = "nurse-prc.jpg",
            VerificationContact = "+639171234567",
            IsDirectoryOptIn = true,
            IsActive = true
        });

        await servicesRepo.AddAsync(new ServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "CONS-01",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 500m,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var handler = new GetClinicPublishingReadinessQueryHandler(settingsRepo, staffRepo, servicesRepo, _clinicContext);
        var dto = await handler.Handle(new GetClinicPublishingReadinessQuery(), CancellationToken.None);

        dto.IsReady.Should().BeTrue();
        dto.Checks.HasDohLtoOrProof.Should().BeTrue();
        dto.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Rejected);
        dto.VerificationRejectionReason.Should().Be("LTO certificate date obscured");
        dto.LastVerificationSubmittedAtUtc.Should().Be(submittedAt);
        dto.LetterheadDohLto.Should().Be("DOH-LTO-2026-101");
        dto.LtoEvidenceObjectKey.Should().Be("tenants/t/clinics/c/lto.pdf");
        dto.IsOnlineBookingPaused.Should().BeTrue();
        dto.OptedInDoctorsCount.Should().Be(1);
        dto.OptedInDoctorsReadyCount.Should().Be(1);
        dto.OptedInNursesCount.Should().Be(2);
        dto.OptedInNursesReadyCount.Should().Be(1);
        dto.OptedInCliniciansCount.Should().Be(3);
        dto.OptedInCliniciansReadyCount.Should().Be(2);
    }

    #endregion

    #region 2. Facility Withdrawal & Booking Pause Sync

    [Fact]
    public async Task WithdrawFacilityVerification_ResetsToUnverified_EnqueuesToPortal_AndLogsAudit()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Pending Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview,
            IsDirectoryPublished = true,
            VerificationRejectionReason = "Prior reason"
        });
        await uow.SaveChangesAsync();

        var handler = new WithdrawFacilityVerificationCommandHandler(
            settingsRepo, _clinicContext, uow, publisher, auditRepo: auditRepo);

        var result = await handler.Handle(new WithdrawFacilityVerificationCommand("Updating LTO scan"), CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeFalse();
        result.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Unverified);

        var saved = await context.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == _clinicId);
        saved.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Unverified);
        saved.IsDirectoryPublished.Should().BeFalse();
        saved.VerificationRejectionReason.Should().BeNull();

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityVerificationWithdrawn,
            Arg.Is<Party>(p => p.FacilityId == _clinicId.ToString()),
            Party.Portal,
            _clinicId,
            Arg.Is<FacilityVerificationWithdrawnPayload>(p =>
                p.FacilityId == _clinicId &&
                p.TenantId == TenantId &&
                p.Reason == "Updating LTO scan"));

        context.AuditEntries.Local.Should().Contain(a => a.Action == "operations.facility_verification.withdrawn");
    }

    [Fact]
    public async Task ToggleBookingPause_WhenUnverified_DoesNotSyncToPatientApi()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Unverified Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview,
            IsOnlineBookingPaused = false
        });
        await uow.SaveChangesAsync();

        var handler = new ToggleOnlineBookingPauseCommandHandler(settingsRepo, _clinicContext, uow, publisher);
        var result = await handler.Handle(new ToggleOnlineBookingPauseCommand(true), CancellationToken.None);

        result.IsPaused.Should().BeTrue();
        publisher.DidNotReceiveWithAnyArgs().Enqueue<FacilityCreatedEvent>(default!, default!, default!, default, default!);
    }

    #endregion

    #region 3. Staff Opt-In Validation, PRC Proof, Submission, Withdrawal & Re-Verification

    [Fact]
    public async Task StaffOptInValidation_EnforcesOnlyWhenOptInTrue_AndBlocksNonClinicians()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        ValidatingLicenseMock(_clinicId, TenantId, out var licenseValidator);

        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            LicenseToken = "valid"
        });
        await uow.SaveChangesAsync();

        var createHandler = new CreateStaffMemberCommandHandler(staffRepo, roleRepo, settingsRepo, licenseValidator, uow, _clinicContext);

        // Local doctor without expiry/proof/contact and short PRC succeeds when IsDirectoryOptIn = false
        var localDoctor = await createHandler.Handle(new CreateStaffMemberCommand(
            "Local", "Doctor", null, "MD", StaffRole.Doctor, null, "local@clinic.ph", null, "PRC-12", null, null, null,
            IsDirectoryOptIn: false), CancellationToken.None);
        localDoctor.IsDirectoryOptIn.Should().BeFalse();

        // Receptionist cannot opt in
        var receptionistAct = () => createHandler.Handle(new CreateStaffMemberCommand(
            "Front", "Desk", null, null, StaffRole.Receptionist, null, "desk@clinic.ph", null, "PRC-0123456", null, null, null,
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey: "key.pdf",
            VerificationContact: "desk@clinic.ph"), CancellationToken.None);
        await receptionistAct.Should().ThrowAsync<ValidationException>().WithMessage("*Only Doctors and Nurses*");

        // Opt-in Nurse with invalid PRC format fails
        var badPrcAct = () => createHandler.Handle(new CreateStaffMemberCommand(
            "OptIn", "Nurse", null, "RN", StaffRole.Nurse, null, "nurse@clinic.ph", null, "PRC-ABC", null, null, null,
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey: "key.pdf",
            VerificationContact: "nurse@clinic.ph"), CancellationToken.None);
        await badPrcAct.Should().ThrowAsync<ValidationException>().WithMessage("*valid PRC license*");
    }

    [Fact]
    public async Task UploadStaffPrcProof_AndSubmitVerification_EnqueuesToPortalWithSchedulesAndAudits()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var scheduleRepo = TestDbHelper.CreateRepository<DoctorScheduleTemplate>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();
        storage.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<string>(0));
        var publisher = Substitute.For<IInteropPublisher>();

        var nurseId = Guid.NewGuid();
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic"
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = nurseId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Clara",
            LastName = "Mendoza",
            Role = StaffRole.Nurse,
            PrcLicenseNumber = "PRC-0456789",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            VerificationContact = "+639178889999",
            PublicBio = "Pediatric triage specialist",
            IsActive = true
        });
        await scheduleRepo.AddAsync(new DoctorScheduleTemplate
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            DoctorId = nurseId,
            DoctorName = "Clara Mendoza",
            DayOfWeek = DayOfWeek.Wednesday,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(12, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var uploadHandler = new UploadStaffPrcProofCommandHandler(staffRepo, storage, _clinicContext, uow, auditRepo: auditRepo);
        var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 1, 2, 3 };
        var uploadResult = await uploadHandler.Handle(
            new UploadStaffPrcProofCommand(nurseId, "prc-id.png", "image/png", pngBytes.Length, pngBytes),
            CancellationToken.None);

        uploadResult.ObjectKey.Should().Contain($"/verification/prc/{nurseId:D}/");

        var submitHandler = new SubmitPractitionerVerificationCommandHandler(
            staffRepo, _clinicContext, uow, publisher, settingsRepo: settingsRepo, scheduleRepo: scheduleRepo, auditRepo: auditRepo);

        var submittedDto = await submitHandler.Handle(new SubmitPractitionerVerificationCommand(nurseId), CancellationToken.None);

        submittedDto.IsDirectoryOptIn.Should().BeTrue();
        submittedDto.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        submittedDto.PrcEvidenceObjectKey.Should().Be(uploadResult.ObjectKey);

        publisher.Received(1).Enqueue(
            InteropTypes.PractitionerVerificationRequested,
            Arg.Is<Party>(p => p.FacilityId == _clinicId.ToString()),
            Party.Portal,
            nurseId,
            Arg.Is<PractitionerVerificationRequestedPayload>(p =>
                p.ClinicStaffMemberId == nurseId &&
                p.ProfessionKind == "Nurse" &&
                p.NormalizedPrcLicenseNo == "0456789" &&
                p.PrcEvidenceObjectKey == uploadResult.ObjectKey &&
                p.Availabilities.Count == 1));

        var audits = await context.AuditEntries.IgnoreQueryFilters().ToListAsync();
        audits.Should().Contain(a => a.Action == "security.practitioner_prc_proof.uploaded");
        audits.Should().Contain(a => a.Action == "security.practitioner_verification.submitted");
    }

    [Fact]
    public async Task UpdateVerifiedClinicianPrc_ResetsStatusToPendingAndEmitsPrcUpdateToPortal()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var docId = Guid.NewGuid();
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Verified Clinic"
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = docId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Elena",
            LastName = "Ramos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0111222",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
            PrcEvidenceObjectKey = "tenants/t/clinics/c/prc.pdf",
            VerificationContact = "dr.ramos@clinic.ph",
            IsDirectoryOptIn = true,
            CanonicalProviderId = Guid.NewGuid(),
            PublicVerificationStatus = PractitionerVerificationLevel.Verified,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var updateHandler = new UpdateStaffMemberCommandHandler(
            staffRepo, roleRepo, uow, _clinicContext,
            interopPublisher: publisher,
            settingsRepository: settingsRepo,
            auditRepository: auditRepo);

        var updated = await updateHandler.Handle(new UpdateStaffMemberCommand(
            docId, "Elena", "Ramos", null, "MD", StaffRole.Doctor, null, "dr.ramos@clinic.ph", null,
            "PRC-0999888", null, null, "Internal Medicine", true), CancellationToken.None);

        updated.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        updated.PublicVerificationReason.Should().BeNull();

        publisher.Received(1).Enqueue(
            InteropTypes.PractitionerVerificationRequested,
            Arg.Any<Party>(),
            Party.Portal,
            docId,
            Arg.Is<PractitionerVerificationRequestedPayload>(p =>
                p.RequestKind == "PrcUpdate" &&
                p.NormalizedPrcLicenseNo == "0999888" &&
                p.ClinicStaffMemberId == docId));

        context.AuditEntries.Local.Should().Contain(a => a.Action == "security.practitioner_verification.submitted");
    }

    [Fact]
    public async Task UpdateMyProfile_WhenVerifiedClinicianChangesPrc_ResetsStatusAndEmitsPrcUpdate()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Verified Clinic"
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = _staffId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Rafael",
            LastName = "Torres",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0222333",
            PrcExpiryDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey = "tenants/t/clinics/c/prc-torres.pdf",
            VerificationContact = "torres@clinic.ph",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Verified,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var handler = new UpdateMyProfileCommandHandler(
            staffRepo, uow, _clinicContext,
            interopPublisher: publisher,
            settingsRepository: settingsRepo,
            auditRepository: auditRepo);

        var dto = await handler.Handle(new UpdateMyProfileCommand(
            _staffId, "Rafael", "Torres", null, "MD", null, "PRC-0444555", null, null, "Cardiology",
            PublicBio: "Board certified cardiologist"), CancellationToken.None);

        dto.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.PendingVerification);
        dto.PublicBio.Should().Be("Board certified cardiologist");

        publisher.Received(1).Enqueue(
            InteropTypes.PractitionerVerificationRequested,
            Arg.Any<Party>(),
            Party.Portal,
            _staffId,
            Arg.Is<PractitionerVerificationRequestedPayload>(p =>
                p.RequestKind == "PrcUpdate" &&
                p.NormalizedPrcLicenseNo == "0444555"));
    }

    [Fact]
    public async Task WithdrawPractitionerVerification_ResetsOptIn_AndSyncsVerifiedClinicDirectory()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var syncService = new ClinicDirectorySyncService(staffRepo, servicesRepo, publisher);

        var docId = Guid.NewGuid();
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Verified Clinic",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Verified
        });
        await staffRepo.AddAsync(new StaffMember
        {
            Id = docId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Ana",
            LastName = "Lim",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0777888",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.Verified,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var handler = new WithdrawPractitionerVerificationCommandHandler(
            staffRepo, _clinicContext, uow, settingsRepo, syncService, auditRepo);

        var dto = await handler.Handle(new WithdrawPractitionerVerificationCommand(docId, "Taking sabbatical"), CancellationToken.None);

        dto.IsDirectoryOptIn.Should().BeFalse();
        dto.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Unverified);

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.Service == InteropServices.Patient),
            _clinicId,
            Arg.Is<FacilityCreatedEvent>(e => e.Providers != null && e.Providers.Count == 0 && e.ReplaceProvidersSnapshot));

        context.AuditEntries.Local.Should().Contain(a => a.Action == "security.practitioner_verification.withdrawn");
    }

    #endregion

    #region 4. Inbound Portal Handlers

    [Fact]
    public async Task FacilityDirectoryUpdatedHandler_WhenVerifiedAndPublished_UpdatesStatusAuditsAndSyncsPatientDirectory()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var canonicalId = Guid.NewGuid();

        var settings = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Care First Clinic");
        settings.IsDirectoryPublished = true;
        settings.IsWorkspaceEligible = true;
        settings.PlatformVerificationStatus = PlatformVerificationStatus.PendingReview;
        settings.VerificationRejectionReason = "Old issue";
        settings.OperatingHours = "Mon-Fri 8AM-5PM";

        db.StaffMembers.Add(new StaffMember
        {
            Id = docId,
            TenantId = TenantId,
            ClinicId = clinicId,
            FirstName = "Jose",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0123456",
            IsDirectoryOptIn = true,
            CanonicalProviderId = canonicalId,
            PublicVerificationStatus = PractitionerVerificationLevel.Verified,
            PublicBio = "Family physician",
            IsActive = true
        });
        db.DoctorScheduleTemplates.Add(new DoctorScheduleTemplate
        {
            TenantId = TenantId,
            ClinicId = clinicId,
            DoctorId = docId,
            DoctorName = "Dr. Jose Santos",
            DayOfWeek = DayOfWeek.Tuesday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(15, 0),
            SlotDurationMinutes = 30,
            IsActive = true
        });
        db.ServiceItems.Add(new ServiceItem
        {
            TenantId = TenantId,
            ClinicId = clinicId,
            Code = "GEN-01",
            Name = "Consultation",
            Category = "Consultation",
            StandardPrice = 500m,
            IsActive = true
        });
        await db.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var handler = new FacilityDirectoryUpdatedHandler(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance, publisher);

        var evt = new FacilityCreatedEvent
        {
            TenantId = TenantId,
            FacilityType = FacilityType.Clinic,
            ResourceId = clinicId,
            Name = "Care First Clinic",
            IsWorkspaceEligible = true,
            IsPlatformVerified = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Verified
        };

        await handler.HandleAsync(
            evt,
            MessagingTestKit.Delivered(InteropTypes.FacilityDirectoryUpdated, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId), clinicId, evt),
            CancellationToken.None);

        var updated = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        updated.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Verified);
        updated.VerificationRejectionReason.Should().BeNull();

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Is<Party>(p => p.FacilityId == clinicId.ToString()),
            Arg.Is<Party>(p => p.Service == InteropServices.Patient),
            clinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.IsPublic == true &&
                e.IsPlatformVerified == true &&
                e.DirectorySource == DirectorySourceKind.ClinicSelfPublish &&
                e.ReplaceProvidersSnapshot == true &&
                e.Providers != null && e.Providers.Count == 1 &&
                e.Providers[0].CanonicalProviderId == canonicalId &&
                e.Providers[0].Availabilities != null && e.Providers[0].Availabilities!.Count == 1));

        (await db.AuditEntries.IgnoreQueryFilters().AnyAsync(a => a.Action == "operations.facility_verification.approved")).Should().BeTrue();
    }

    [Fact]
    public async Task FacilityVerificationRejectedHandler_UpdatesStatusReasonAndLogsAudit()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var settings = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Test Clinic");
        settings.PlatformVerificationStatus = PlatformVerificationStatus.PendingReview;
        settings.IsDirectoryPublished = true;
        await db.SaveChangesAsync();

        var handler = new FacilityVerificationRejectedHandler(db, NullLogger<FacilityVerificationRejectedHandler>.Instance);
        var payload = new FacilityVerificationRejectedPayload
        {
            RequestId = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = clinicId,
            Status = "Rejected",
            Reason = "Submitted DOH LTO document is expired.",
            ReviewedByAdminUserId = "admin-reviewer-1"
        };

        await handler.HandleAsync(
            payload,
            MessagingTestKit.Delivered(InteropTypes.FacilityVerificationRejected, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId), clinicId, payload),
            CancellationToken.None);

        var updated = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        updated.PlatformVerificationStatus.Should().Be(PlatformVerificationStatus.Rejected);
        updated.VerificationRejectionReason.Should().Be("Submitted DOH LTO document is expired.");
        updated.IsDirectoryPublished.Should().BeFalse();

        (await db.AuditEntries.IgnoreQueryFilters().AnyAsync(a => a.Action == "operations.facility_verification.rejected")).Should().BeTrue();
    }

    [Fact]
    public async Task PractitionerIdentityUpdatedHandler_LinksCanonicalIdAndSyncsPublishedDirectory()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var canonicalId = Guid.NewGuid();
        var mergedId = Guid.NewGuid();

        var settings = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Partner Clinic");
        settings.PlatformVerificationStatus = PlatformVerificationStatus.Verified;
        settings.IsWorkspaceEligible = true;
        settings.IsDirectoryPublished = true;

        db.StaffMembers.Add(new StaffMember
        {
            Id = staffId,
            TenantId = TenantId,
            ClinicId = clinicId,
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0555111",
            IsDirectoryOptIn = true,
            PublicVerificationStatus = PractitionerVerificationLevel.PendingVerification,
            IsActive = true
        });
        await db.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var handler = new PractitionerIdentityUpdatedHandler(db, NullLogger<PractitionerIdentityUpdatedHandler>.Instance, publisher);

        var payload = new PractitionerIdentityUpdatedPayload
        {
            PractitionerId = canonicalId,
            MergedIntoPractitionerId = mergedId,
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0555111",
            DisplayPrcLicenseNo = "0555111",
            VerificationLevel = PractitionerVerificationLevel.Verified,
            FirstName = "Maria",
            LastName = "Santos",
            PrimarySpecialty = "Pediatrics",
            PublicBio = "Pediatric consultant",
            AvatarUrl = "https://cdn.example/avatar.jpg",
            TenantId = TenantId,
            FacilityId = clinicId,
            ClinicStaffMemberId = staffId,
            AffiliationStatus = "Active"
        };

        await handler.HandleAsync(
            payload,
            MessagingTestKit.Delivered(InteropTypes.PractitionerIdentityUpdated, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId), staffId, payload),
            CancellationToken.None);

        var updated = await db.StaffMembers.IgnoreQueryFilters().SingleAsync(s => s.Id == staffId);
        updated.CanonicalProviderId.Should().Be(mergedId);
        updated.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Verified);
        updated.PublicBio.Should().Be("Pediatric consultant");
        updated.AvatarUrl.Should().Be("https://cdn.example/avatar.jpg");
        updated.AffiliatedVerifiedClinicCount.Should().BeGreaterThanOrEqualTo(1);

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.Service == InteropServices.Patient),
            clinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.Providers != null && e.Providers.Count == 1 &&
                e.Providers[0].CanonicalProviderId == mergedId &&
                e.Providers[0].VerificationStatus == PractitionerVerificationLevel.Verified));

        (await db.AuditEntries.IgnoreQueryFilters().AnyAsync(a => a.Action == "security.practitioner_verification.approved")).Should().BeTrue();
    }

    [Fact]
    public async Task PractitionerVerificationRevokedHandler_UpdatesStatusReasonAndAudits()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var canonicalId = Guid.NewGuid();

        var settings = MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Partner Clinic");
        settings.PlatformVerificationStatus = PlatformVerificationStatus.Verified;
        settings.IsWorkspaceEligible = true;
        settings.IsDirectoryPublished = true;

        db.StaffMembers.Add(new StaffMember
        {
            Id = staffId,
            TenantId = TenantId,
            ClinicId = clinicId,
            FirstName = "Luis",
            LastName = "Garcia",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0888999",
            IsDirectoryOptIn = true,
            CanonicalProviderId = canonicalId,
            PublicVerificationStatus = PractitionerVerificationLevel.Verified,
            AffiliatedVerifiedClinicCount = 2,
            IsActive = true
        });
        await db.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var handler = new PractitionerVerificationRevokedHandler(db, NullLogger<PractitionerVerificationRevokedHandler>.Instance, publisher);

        var payload = new PractitionerVerificationRevokedPayload
        {
            PractitionerId = canonicalId,
            TenantId = TenantId,
            FacilityId = clinicId,
            ClinicStaffMemberId = staffId,
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0888999",
            NewStatus = PractitionerVerificationLevel.Expired,
            Reason = "PRC license expired on 2026-10-01"
        };

        await handler.HandleAsync(
            payload,
            MessagingTestKit.Delivered(InteropTypes.PractitionerVerificationRevoked, Party.Portal, MessagingTestKit.ClinicParty(TenantId, clinicId), staffId, payload),
            CancellationToken.None);

        var updated = await db.StaffMembers.IgnoreQueryFilters().SingleAsync(s => s.Id == staffId);
        updated.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.Expired);
        updated.PublicVerificationReason.Should().Be("PRC license expired on 2026-10-01");
        updated.AffiliatedVerifiedClinicCount.Should().Be(0);

        publisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.Service == InteropServices.Patient),
            clinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.Providers != null && e.Providers.Count == 1 &&
                e.Providers[0].VerificationStatus == PractitionerVerificationLevel.Expired));

        (await db.AuditEntries.IgnoreQueryFilters().AnyAsync(a => a.Action == "security.practitioner_verification.revoked")).Should().BeTrue();
    }

    [Fact]
    public async Task StaffQueries_AndProofThenOptInUpdate_SurfaceReadOnlyVerificationFields()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();
        storage.SaveEncryptedFileAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<string>(0));

        var docId = Guid.NewGuid();
        var canonicalId = Guid.NewGuid();
        await staffRepo.AddAsync(new StaffMember
        {
            Id = docId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Marco",
            LastName = "Villanueva",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0333444",
            CanonicalProviderId = canonicalId,
            PublicVerificationStatus = PractitionerVerificationLevel.AwaitingConfirmation,
            PublicVerificationReason = "Awaiting SMS confirmation",
            AffiliatedVerifiedClinicCount = 2,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var uploadHandler = new UploadStaffPrcProofCommandHandler(staffRepo, storage, _clinicContext, uow);
        var proof = await uploadHandler.Handle(
            new UploadStaffPrcProofCommand(docId, "prc.jpg", "image/jpeg", 4, [1, 2, 3, 4]),
            CancellationToken.None);

        var updateHandler = new UpdateStaffMemberCommandHandler(staffRepo, roleRepo, uow, _clinicContext);
        var updated = await updateHandler.Handle(new UpdateStaffMemberCommand(
            docId, "Marco", "Villanueva", null, "MD", StaffRole.Doctor, null, "marco@clinic.ph", null,
            "PRC-0333444", null, null, "Orthopedics", true,
            IsDirectoryOptIn: true,
            PrcExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            PrcEvidenceObjectKey: null,
            VerificationContact: "marco@clinic.ph",
            PublicBio: "Orthopedic specialist",
            AvatarUrl: "https://cdn.example/marco.png"), CancellationToken.None);

        updated.IsDirectoryOptIn.Should().BeTrue();
        updated.PrcEvidenceObjectKey.Should().Be(proof.ObjectKey);
        updated.CanonicalProviderId.Should().Be(canonicalId);
        updated.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.AwaitingConfirmation);
        updated.PublicVerificationReason.Should().Be("Awaiting SMS confirmation");
        updated.AffiliatedVerifiedClinicCount.Should().Be(2);

        var byIdHandler = new GetStaffMemberByIdQueryHandler(staffRepo, _clinicContext);
        var profile = await byIdHandler.Handle(new GetStaffMemberByIdQuery(docId), CancellationToken.None);
        profile.PublicBio.Should().Be("Orthopedic specialist");
        profile.AvatarUrl.Should().Be("https://cdn.example/marco.png");
        profile.PublicVerificationStatus.Should().Be(PractitionerVerificationLevel.AwaitingConfirmation);
        profile.CanonicalProviderId.Should().Be(canonicalId);
        profile.AffiliatedVerifiedClinicCount.Should().Be(2);

        var listHandler = new GetStaffMembersQueryHandler(staffRepo, _clinicContext);
        var list = await listHandler.Handle(new GetStaffMembersQuery(), CancellationToken.None);
        list.Should().ContainSingle(x => x.Id == docId && x.PublicVerificationStatus == PractitionerVerificationLevel.AwaitingConfirmation);
    }

    #endregion
}
