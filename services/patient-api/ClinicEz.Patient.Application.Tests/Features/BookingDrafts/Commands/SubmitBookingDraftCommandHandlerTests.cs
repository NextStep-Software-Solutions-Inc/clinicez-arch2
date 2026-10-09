using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace ClinicEz.Patient.Application.Tests.Features.BookingDrafts.Commands;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class SubmitBookingDraftCommandHandlerTests
{
    private readonly IBookingDraftRepository _draftRepo = Substitute.For<IBookingDraftRepository>();
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();
    private readonly IClinicMembershipRepository _membershipRepo = Substitute.For<IClinicMembershipRepository>();
    private readonly IInteropPublisher _publisher = Substitute.For<IInteropPublisher>();
    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly IFileRecordRepository _fileRepo = Substitute.For<IFileRecordRepository>();
    private readonly IPatientAccessRepository _accessRepo = Substitute.For<IPatientAccessRepository>();
    private readonly IStorageService _storage = Substitute.For<IStorageService>();

    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _draftId = Guid.NewGuid();
    private readonly Guid _clinicId = Guid.NewGuid();

    private AppointmentBookedEvent? _published;
    private Party? _from;
    private Party? _to;
    private Guid? _correlationId;
    private string? _type;

    public SubmitBookingDraftCommandHandlerTests()
    {
        _publisher.Enqueue(
                Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(),
                Arg.Any<AppointmentBookedEvent>(), Arg.Any<int>(), Arg.Any<TimeSpan?>())
            .Returns(call =>
            {
                _type = call.ArgAt<string>(0);
                _from = call.ArgAt<Party>(1);
                _to = call.ArgAt<Party>(2);
                _correlationId = call.ArgAt<Guid>(3);
                _published = call.ArgAt<AppointmentBookedEvent>(4);
                return InteropEnvelope.Create(_type, _from, _to, _correlationId.Value, _published);
            });
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);
    }

    private SubmitBookingDraftCommandHandler CreateHandler() =>
        new(_draftRepo, _clinicRepo, _uow, _membershipRepo, _publisher, _patientRepo, _accessRepo, _storage,
            Options.Create(new SharingOptions { BookingGrantDays = 30 }), _fileRepo);

    private BookingDraft ArrangeDraft(string shareFieldsJson = "[]", string attachedFileIdsJson = "[]", string? clinicTenant = "tenant-a")
    {
        var draft = new BookingDraft
        {
            Id = _draftId,
            PatientId = _patientId,
            ClinicId = _clinicId,
            Status = BookingDraftStatus.Draft,
            PreferredDate = new DateOnly(2026, 10, 15),
            PreferredTime = "14:00",
            Reason = "General Checkup",
            ShareFieldsJson = shareFieldsJson,
            AttachedFileIdsJson = attachedFileIdsJson
        };
        var clinic = new Clinic { Id = _clinicId, Name = "City Health Clinic", TenantId = clinicTenant, IsPublic = true };
        var patient = new Patient
        {
            Id = _patientId,
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Mobile = "+639171234567",
            Email = "juan@example.test",
            DateOfBirth = new DateOnly(1990, 1, 2),
            Sex = SexType.Male,
            GovernmentIds = new List<PatientGovernmentId>
            {
                new()
                {
                    PatientId = _patientId,
                    IdType = GovernmentIdType.PhilHealth,
                    IdNumber = "123456789012",
                    PhilhealthCategory = "DD",
                    SponsorPin = "987654321098",
                    SponsorFirstName = "Maria",
                    SponsorLastName = "Dela Cruz",
                    SponsorRelationship = "Spouse"
                }
            }
        };

        _draftRepo.GetByIdAsync(_draftId, Arg.Any<CancellationToken>()).Returns(draft);
        _clinicRepo.GetByIdAsync(_clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
        _patientRepo.GetWithProfileAsync(_patientId, Arg.Any<CancellationToken>()).Returns(patient);
        _membershipRepo.GetByPatientAndClinicAsync(_patientId, _clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);
        return draft;
    }

    [Fact]
    public async Task Handle_ValidDraft_EnqueuesBookingToTheClinicBeforeSavingAndEnsuresMembership()
    {
        var draft = ArrangeDraft(shareFieldsJson: "[\"fullName\",\"mobile\"]");

        var result = await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        result.Should().Be($"PENDING-{_draftId:N}");
        draft.Status.Should().Be(BookingDraftStatus.Ready);

        _type.Should().Be(InteropTypes.PatientAppointmentBooked);
        _correlationId.Should().Be(_draftId);
        _from.Should().Be(Party.ForPatient(_patientId.ToString()));
        _to.Should().Be(Party.ForFacility("tenant-a", _clinicId.ToString(), FacilityType.Clinic));
        _published.Should().NotBeNull();
        _published!.DraftId.Should().Be(_draftId);
        _published.PatientId.Should().Be(_patientId);
        _published.ClinicId.Should().Be(_clinicId);
        _published.TenantId.Should().Be("tenant-a");
        _published.PreferredDate.Should().Be(new DateOnly(2026, 10, 15));
        _published.PreferredTime.Should().Be("14:00");
        _published.Reason.Should().Be("General Checkup");
        _published.PatientFirstName.Should().Be("Juan");
        _published.PatientLastName.Should().Be("Dela Cruz");
        _published.ContactNumber.Should().Be("+639171234567");

        await _membershipRepo.Received(1).AddAsync(
            Arg.Is<ClinicMembership>(m =>
                m.PatientId == _patientId &&
                m.ClinicId == _clinicId &&
                m.Status == ClinicMembershipStatus.Pending),
            Arg.Any<CancellationToken>());

        _draftRepo.Received(1).Update(draft);
        Received.InOrder(() =>
        {
            _publisher.Enqueue(
                Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(),
                Arg.Any<AppointmentBookedEvent>(), Arg.Any<int>(), Arg.Any<TimeSpan?>());
            _uow.SaveChangesAsync(Arg.Any<CancellationToken>());
        });
    }

    [Fact]
    public async Task Handle_WithoutExplicitShareChoices_SendsOnlyIdentityAndContactNumber()
    {
        ArrangeDraft(shareFieldsJson: "[\"fullName\",\"mobile\"]");

        await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        _published!.DateOfBirth.Should().BeNull();
        _published.Gender.Should().BeNull();
        _published.Email.Should().BeNull();
        _published.PhilHealthNumber.Should().BeNull();
        _published.PhilHealthCategory.Should().BeNull();
        _published.SponsorPin.Should().BeNull();
        _published.SponsorFirstName.Should().BeNull();
        _published.SponsorRelationship.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WithPatientChosenSections_IncludesExactlyThoseSections()
    {
        ArrangeDraft(shareFieldsJson: "[\"fullName\",\"mobile\",\"dateOfBirth\",\"philhealthId\"]");

        await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        _published!.DateOfBirth.Should().Be(new DateOnly(1990, 1, 2));
        _published.PhilHealthNumber.Should().Be("123456789012");
        _published.PhilHealthCategory.Should().Be("DD");
        _published.SponsorPin.Should().Be("987654321098");
        _published.SponsorFirstName.Should().Be("Maria");
        _published.SponsorRelationship.Should().Be("Spouse");
        _published.Gender.Should().BeNull();
        _published.Email.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenMembershipIsCreated_DoesNotPresumeAnyConsent()
    {
        ArrangeDraft();

        await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        await _membershipRepo.Received(1).AddAsync(
            Arg.Is<ClinicMembership>(m =>
                !m.ConsentPrivacyPolicy &&
                !m.ConsentTermsAndConditions &&
                !m.ConsentDataSharing &&
                m.ConsentedAt == null),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenDraftNotOwnedByPatient_ThrowsForbiddenException()
    {
        var differentPatientId = Guid.NewGuid();
        _draftRepo.GetByIdAsync(_draftId, Arg.Any<CancellationToken>()).Returns(new BookingDraft
        {
            Id = _draftId,
            PatientId = differentPatientId,
            Status = BookingDraftStatus.Draft
        });

        var act = async () => await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
        _published.Should().BeNull();
        await _uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenDraftAlreadyReady_ThrowsConflictException()
    {
        _draftRepo.GetByIdAsync(_draftId, Arg.Any<CancellationToken>()).Returns(new BookingDraft
        {
            Id = _draftId,
            PatientId = _patientId,
            Status = BookingDraftStatus.Ready
        });

        var act = async () => await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>();
        _published.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenClinicHasNoTenantInTheDirectory_ThrowsConflictAndEnqueuesNothing()
    {
        ArrangeDraft(clinicTenant: null);

        var act = async () => await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>();
        _published.Should().BeNull();
        await _uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WithAttachedFiles_PopulatesAttachedFilesMetadataOnEvent()
    {
        var fileId = Guid.NewGuid();
        ArrangeDraft(attachedFileIdsJson: System.Text.Json.JsonSerializer.Serialize(new[] { fileId }));
        _fileRepo.GetByIdAsync(fileId, Arg.Any<CancellationToken>()).Returns(new FileRecord
        {
            Id = fileId,
            PatientId = _patientId,
            FileName = "chest_xray.pdf",
            MimeType = "application/pdf",
            SizeBytes = 204800,
            DocumentType = new DocumentType { Code = "xray", Label = "X-Ray" }
        });

        await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        _published!.AttachedFiles.Should().ContainSingle();
        _published.AttachedFiles[0].FileId.Should().Be(fileId);
        _published.AttachedFiles[0].FileName.Should().Be("chest_xray.pdf");
        _published.AttachedFiles[0].DocumentTypeCode.Should().Be("xray");
        _published.AttachedFiles[0].SizeBytes.Should().Be(204800);
    }

    [Fact]
    public async Task Handle_WithAttachedFileOwnedBySomeoneElse_LeavesItOut()
    {
        var fileId = Guid.NewGuid();
        ArrangeDraft(attachedFileIdsJson: System.Text.Json.JsonSerializer.Serialize(new[] { fileId }));
        _fileRepo.GetByIdAsync(fileId, Arg.Any<CancellationToken>()).Returns(new FileRecord
        {
            Id = fileId,
            PatientId = Guid.NewGuid(),
            FileName = "not_yours.pdf"
        });

        await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        _published!.AttachedFiles.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_RecordsABookingGrantForTheClinicAndLogsWhatWasShared()
    {
        ArrangeDraft(shareFieldsJson: "[\"fullName\",\"mobile\",\"dateOfBirth\"]");
        PatientAccessGrant? grant = null;
        PatientAccessLog? log = null;
        await _accessRepo.AddGrantAsync(Arg.Do<PatientAccessGrant>(g => grant = g), Arg.Any<CancellationToken>());
        await _accessRepo.AddLogAsync(Arg.Do<PatientAccessLog>(l => log = l), Arg.Any<CancellationToken>());

        await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        grant.Should().NotBeNull();
        grant!.PatientId.Should().Be(_patientId);
        grant.TenantId.Should().Be("tenant-a");
        grant.FacilityId.Should().Be(_clinicId);
        grant.Source.Should().Be(AccessGrantSource.Booking);
        grant.DraftId.Should().Be(_draftId);
        grant.Scopes.Should().Be(AccessScopes.Demographics);
        grant.ExpiresAt.Should().BeCloseTo(DateTime.UtcNow.AddDays(30), TimeSpan.FromMinutes(1));
        log.Should().NotBeNull();
        log!.GrantId.Should().Be(grant.Id);
        log.Action.Should().Be("BookingShared");
        log.Detail.Should().Contain("name").And.Contain("mobile number").And.Contain("dateOfBirth").And.NotContain("email");
    }

    private FileRecord Attachment(Guid id, string? encryptionKeyId = null, string storageKey = "patients/p/file.pdf", long size = 1024) => new()
    {
        Id = id,
        PatientId = _patientId,
        FileName = "chest_xray.pdf",
        MimeType = "application/pdf",
        SizeBytes = size,
        StorageKey = storageKey,
        EncryptionKeyId = encryptionKeyId,
        DocumentType = new DocumentType { Code = "xray", Label = "X-Ray" }
    };

    [Fact]
    public async Task Handle_SharesAnUnencryptedAttachmentWithTheClinicByReferenceNotByContent()
    {
        var fileId = Guid.NewGuid();
        ArrangeDraft(attachedFileIdsJson: System.Text.Json.JsonSerializer.Serialize(new[] { fileId }));
        _fileRepo.GetByIdAsync(fileId, Arg.Any<CancellationToken>()).Returns(Attachment(fileId));
        _storage.GeneratePresignedDownloadUrlAsync("patients/p/file.pdf", Arg.Any<TimeSpan>(), Arg.Any<CancellationToken>())
            .Returns("https://files.example.test/signed");

        await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        _publisher.Received(1).Enqueue(
            InteropTypes.PatientRecordShared,
            Party.ForPatient(_patientId.ToString()),
            Party.ForFacility("tenant-a", _clinicId.ToString(), FacilityType.Clinic),
            _draftId,
            Arg.Is<PatientRecordSharedPayload>(p =>
                p.FileId == fileId && p.DraftId == _draftId && p.PatientId == _patientId &&
                p.DownloadUrl == "https://files.example.test/signed" && p.SizeBytes == 1024 &&
                p.ExpiresAtUtc > DateTime.UtcNow.AddHours(23)),
            Arg.Any<int>(), Arg.Any<TimeSpan?>());
        Received.InOrder(() =>
        {
            _publisher.Enqueue(
                InteropTypes.PatientRecordShared, Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(),
                Arg.Any<PatientRecordSharedPayload>(), Arg.Any<int>(), Arg.Any<TimeSpan?>());
            _uow.SaveChangesAsync(Arg.Any<CancellationToken>());
        });
    }

    [Fact]
    public async Task Handle_KeepsEncryptedAndOversizedAttachmentsOutOfTheSharedFiles()
    {
        var encryptedId = Guid.NewGuid();
        var hugeId = Guid.NewGuid();
        ArrangeDraft(attachedFileIdsJson: System.Text.Json.JsonSerializer.Serialize(new[] { encryptedId, hugeId }));
        _fileRepo.GetByIdAsync(encryptedId, Arg.Any<CancellationToken>()).Returns(Attachment(encryptedId, encryptionKeyId: "key-1"));
        _fileRepo.GetByIdAsync(hugeId, Arg.Any<CancellationToken>()).Returns(Attachment(hugeId, size: 10 * 1024 * 1024 + 1));

        await CreateHandler().Handle(new SubmitBookingDraftCommand(_patientId, _draftId), CancellationToken.None);

        _publisher.DidNotReceive().Enqueue(
            InteropTypes.PatientRecordShared, Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(),
            Arg.Any<PatientRecordSharedPayload>(), Arg.Any<int>(), Arg.Any<TimeSpan?>());
        _published!.AttachedFiles.Should().HaveCount(2);
    }
}