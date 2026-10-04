using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;
using FluentAssertions;
using MassTransit;
using NSubstitute;
using Xunit;
using Patient = ClinicEz.Patient.Domain.Entities.Patient;

namespace ClinicEz.Patient.Application.Tests.Features.BookingDrafts.Commands;

public sealed class SubmitBookingDraftCommandHandlerTests
{
    private readonly IBookingDraftRepository _draftRepo = Substitute.For<IBookingDraftRepository>();
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IClinicDashboardService _clinicService = Substitute.For<IClinicDashboardService>();
    private readonly ICurrentUserService _currentUserService = Substitute.For<ICurrentUserService>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();
    private readonly IClinicMembershipRepository _membershipRepo = Substitute.For<IClinicMembershipRepository>();
    private readonly IPublishEndpoint _publishEndpoint = Substitute.For<IPublishEndpoint>();
    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly IFileRecordRepository _fileRepo = Substitute.For<IFileRecordRepository>();

    private SubmitBookingDraftCommandHandler CreateHandler(IFileRecordRepository? fileRepo = null) =>
        new(_draftRepo, _clinicRepo, _clinicService, _currentUserService, _uow, _membershipRepo, _publishEndpoint, _patientRepo, fileRepo ?? _fileRepo);

    [Fact]
    public async Task Handle_ValidDraft_SubmitsBookingPublishesEventAndEnsuresMembership()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        var draft = new BookingDraft
        {
            Id = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            Status = BookingDraftStatus.Draft,
            PreferredDate = new DateOnly(2026, 10, 15),
            PreferredTime = "14:00",
            Reason = "General Checkup",
            ShareFieldsJson = "[\"demographics\"]",
            AttachedFileIdsJson = "[]"
        };

        var clinic = new Clinic
        {
            Id = clinicId,
            Name = "City Health Clinic",
            BaseUrl = "https://city-health.clinicez.net/api/v1",
            IsPublic = true
        };

        var patient = new global::ClinicEz.Patient.Domain.Entities.Patient
        {
            Id = patientId,
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Mobile = "+639171234567",
            GovernmentIds = new List<PatientGovernmentId>
            {
                new()
                {
                    PatientId = patientId,
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

        _draftRepo.GetByIdAsync(draftId, Arg.Any<CancellationToken>()).Returns(draft);
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
        _patientRepo.GetWithProfileAsync(patientId, Arg.Any<CancellationToken>()).Returns(patient);
        _currentUserService.UserId.Returns("clerk_usr_123");
        _clinicService.SubmitBookingAsync(
            clinic.BaseUrl, patientId, draftId,
            draft.ShareFieldsJson, draft.AttachedFileIdsJson, "clerk_usr_123", Arg.Any<CancellationToken>())
            .Returns("PENDING-REF-001");
        _membershipRepo.GetByPatientAndClinicAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        // Act
        var result = await CreateHandler().Handle(new SubmitBookingDraftCommand(patientId, draftId), CancellationToken.None);

        // Assert
        result.Should().Be("PENDING-REF-001");
        draft.Status.Should().Be(BookingDraftStatus.Ready);

        // Event published to broker
        await _publishEndpoint.Received(1).Publish(
            Arg.Is<AppointmentBookedEvent>(e =>
                e.DraftId == draftId &&
                e.PatientId == patientId &&
                e.ClinicId == clinicId &&
                e.PreferredDate == new DateOnly(2026, 10, 15) &&
                e.PreferredTime == "14:00" &&
                e.PatientFirstName == "Juan" &&
                e.PatientLastName == "Dela Cruz" &&
                e.PhilHealthNumber == "123456789012" &&
                e.PhilHealthCategory == "DD" &&
                e.SponsorPin == "987654321098" &&
                e.SponsorFirstName == "Maria" &&
                e.SponsorLastName == "Dela Cruz" &&
                e.SponsorRelationship == "Spouse"),
            Arg.Any<CancellationToken>());

        // Pending membership added
        await _membershipRepo.Received(1).AddAsync(
            Arg.Is<ClinicMembership>(m =>
                m.PatientId == patientId &&
                m.ClinicId == clinicId &&
                m.Status == ClinicMembershipStatus.Pending),
            Arg.Any<CancellationToken>());

        _draftRepo.Received(1).Update(draft);
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenDraftNotOwnedByPatient_ThrowsForbiddenException()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var differentPatientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var draft = new BookingDraft
        {
            Id = draftId,
            PatientId = differentPatientId,
            Status = BookingDraftStatus.Draft
        };

        _draftRepo.GetByIdAsync(draftId, Arg.Any<CancellationToken>()).Returns(draft);

        // Act
        var act = async () => await CreateHandler().Handle(new SubmitBookingDraftCommand(patientId, draftId), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ForbiddenException>();
        await _publishEndpoint.DidNotReceive().Publish(Arg.Any<AppointmentBookedEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenDraftAlreadyReady_ThrowsConflictException()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var draft = new BookingDraft
        {
            Id = draftId,
            PatientId = patientId,
            Status = BookingDraftStatus.Ready
        };

        _draftRepo.GetByIdAsync(draftId, Arg.Any<CancellationToken>()).Returns(draft);

        // Act
        var act = async () => await CreateHandler().Handle(new SubmitBookingDraftCommand(patientId, draftId), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ConflictException>();
        await _publishEndpoint.DidNotReceive().Publish(Arg.Any<AppointmentBookedEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WithAttachedFiles_PopulatesAttachedFilesMetadataOnEvent()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var fileId = Guid.NewGuid();

        var draft = new BookingDraft
        {
            Id = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            Status = BookingDraftStatus.Draft,
            PreferredDate = new DateOnly(2026, 10, 20),
            PreferredTime = "10:00",
            Reason = "Follow-up",
            ShareFieldsJson = "[]",
            AttachedFileIdsJson = System.Text.Json.JsonSerializer.Serialize(new[] { fileId })
        };

        var clinic = new Clinic
        {
            Id = clinicId,
            Name = "Metro Clinic",
            BaseUrl = "https://metro.clinicez.net/api/v1",
            IsPublic = true
        };

        var fileRecord = new FileRecord
        {
            Id = fileId,
            PatientId = patientId,
            FileName = "chest_xray.pdf",
            MimeType = "application/pdf",
            SizeBytes = 204800,
            DocumentType = new DocumentType { Code = "xray", Label = "X-Ray" }
        };

        _draftRepo.GetByIdAsync(draftId, Arg.Any<CancellationToken>()).Returns(draft);
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
        _fileRepo.GetByIdAsync(fileId, Arg.Any<CancellationToken>()).Returns(fileRecord);
        _patientRepo.GetWithProfileAsync(patientId, Arg.Any<CancellationToken>()).Returns((global::ClinicEz.Patient.Domain.Entities.Patient?)null);
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        // Act
        var result = await CreateHandler().Handle(new SubmitBookingDraftCommand(patientId, draftId), CancellationToken.None);

        // Assert
        await _publishEndpoint.Received(1).Publish(
            Arg.Is<AppointmentBookedEvent>(e =>
                e.AttachedFiles.Count == 1 &&
                e.AttachedFiles[0].FileId == fileId &&
                e.AttachedFiles[0].FileName == "chest_xray.pdf" &&
                e.AttachedFiles[0].DocumentTypeCode == "xray" &&
                e.AttachedFiles[0].SizeBytes == 204800
            ),
            Arg.Any<CancellationToken>());
    }
}

