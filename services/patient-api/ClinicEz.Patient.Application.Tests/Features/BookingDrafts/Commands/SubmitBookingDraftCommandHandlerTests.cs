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

    private SubmitBookingDraftCommandHandler CreateHandler() =>
        new(_draftRepo, _clinicRepo, _clinicService, _currentUserService, _uow, _membershipRepo, _publishEndpoint);

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

        _draftRepo.GetByIdAsync(draftId, Arg.Any<CancellationToken>()).Returns(draft);
        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);
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
                e.PreferredTime == "14:00"),
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
}
