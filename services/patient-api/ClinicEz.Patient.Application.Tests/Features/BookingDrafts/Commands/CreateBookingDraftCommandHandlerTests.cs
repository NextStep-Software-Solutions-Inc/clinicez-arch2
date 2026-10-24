using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.CreateBookingDraft;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Security.Turnstile;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.BookingDrafts.Commands;

public sealed class CreateBookingDraftCommandHandlerTests
{
    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly IBookingDraftRepository _draftRepo = Substitute.For<IBookingDraftRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();
    private readonly ITurnstileValidator _turnstile = Substitute.For<ITurnstileValidator>();

    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _clinicId = Guid.NewGuid();

    public CreateBookingDraftCommandHandlerTests()
    {
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);
    }

    [Fact]
    public async Task Handle_WhenPatientNotFound_ThrowsNotFoundException()
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>()).Returns((Domain.Entities.Patient?)null);
        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);
        var cmd = new CreateBookingDraftCommand(_patientId, _clinicId, null, null, null, "Flu", "Notes", "[]", "[]");

        // Act
        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*{_patientId}*");
    }

    [Fact]
    public async Task Handle_WhenTurnstileFails_ThrowsForbiddenException()
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        _turnstile.ValidateAsync("invalid-token", Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(false);

        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);
        var cmd = new CreateBookingDraftCommand(
            _patientId, _clinicId, null, null, null, "Headache", "Severe", "[]", "[]",
            TurnstileToken: "invalid-token", RemoteIp: "127.0.0.1");

        // Act
        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Turnstile bot verification failed*");
        await _draftRepo.DidNotReceive().AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenActiveDraftVelocityCapExceeded_ThrowsBadRequestException()
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        _turnstile.ValidateAsync(Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(true);

        var activeDrafts = new List<BookingDraft>
        {
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
        };
        _draftRepo.GetByPatientAsync(_patientId, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(activeDrafts);

        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);
        var cmd = new CreateBookingDraftCommand(_patientId, _clinicId, null, null, null, "Routine checkup", null, "[]", "[]");

        // Act
        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("Maximum active booking drafts reached.");
        await _draftRepo.DidNotReceive().AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenUnderCapAndTurnstileValid_CreatesBookingDraftSuccessfully()
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        _turnstile.ValidateAsync("1x00000000000000000000AA", "10.0.0.1", Arg.Any<CancellationToken>())
            .Returns(true);

        var activeDrafts = new List<BookingDraft>
        {
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
        };
        _draftRepo.GetByPatientAsync(_patientId, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(activeDrafts);

        BookingDraft? captured = null;
        await _draftRepo.AddAsync(Arg.Do<BookingDraft>(d => captured = d), Arg.Any<CancellationToken>());

        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);
        var cmd = new CreateBookingDraftCommand(
            _patientId, _clinicId, null,
            PreferredDate: new DateOnly(2026, 11, 1),
            PreferredTime: "10:00 AM",
            Reason: "Pediatric Consultation",
            Notes: "First visit",
            ShareFieldsJson: "[\"fullName\",\"birthDate\"]",
            AttachedFileIdsJson: "[]",
            ShareSections: new[] { "Allergies" },
            TurnstileToken: "1x00000000000000000000AA",
            RemoteIp: "10.0.0.1");

        // Act
        var draftId = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        draftId.Should().NotBeEmpty();
        captured.Should().NotBeNull();
        captured!.PatientId.Should().Be(_patientId);
        captured.ClinicId.Should().Be(_clinicId);
        captured.Status.Should().Be(BookingDraftStatus.Draft);
        captured.Reason.Should().Be("Pediatric Consultation");
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("1x00000000000000000000AA")]
    [InlineData("test-pass-token")]
    [InlineData("LOCAL-OFFLINE-BYPASS")]
    [InlineData("XXXX.DUMMY.PASS.TEST")]
    public async Task Handle_WithValidTurnstileTokens_Succeeds(string validToken)
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        _turnstile.ValidateAsync(validToken, "192.168.1.50", Arg.Any<CancellationToken>())
            .Returns(true);
        _draftRepo.GetByPatientAsync(_patientId, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(new List<BookingDraft>());

        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);
        var cmd = new CreateBookingDraftCommand(
            _patientId, _clinicId, null, null, null, "Routine checkup", null, "[]", "[]",
            TurnstileToken: validToken, RemoteIp: "192.168.1.50");

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.Should().NotBeEmpty();
        await _draftRepo.Received(1).AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("fail-bot-token")]
    [InlineData("1x00000000000000000000BB")]
    [InlineData("test-fail-token")]
    [InlineData("XXXX.DUMMY.FAIL.BOT")]
    public async Task Handle_WithInvalidOrBotTurnstileTokens_ThrowsForbiddenException(string botToken)
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        _turnstile.ValidateAsync(botToken, Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(false);

        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);
        var cmd = new CreateBookingDraftCommand(
            _patientId, _clinicId, null, null, null, "Bot request", null, "[]", "[]",
            TurnstileToken: botToken, RemoteIp: "203.0.113.1");

        // Act
        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Turnstile bot verification failed*");
        await _draftRepo.DidNotReceive().AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenTurnstileValidatorIsNull_BypassesValidationAndSucceeds()
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        _draftRepo.GetByPatientAsync(_patientId, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(new List<BookingDraft>());

        // null turnstile validator simulates turned-off bot verification / air-gapped clinic
        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, turnstileValidator: null);
        var cmd = new CreateBookingDraftCommand(
            _patientId, _clinicId, null, null, null, "Offline clinic checkup", null, "[]", "[]",
            TurnstileToken: null, RemoteIp: "127.0.0.1");

        // Act
        var draftId = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        draftId.Should().NotBeEmpty();
        await _draftRepo.Received(1).AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(0, true)]   // 1st draft succeeds
    [InlineData(1, true)]   // 2nd draft succeeds
    [InlineData(2, true)]   // 3rd draft succeeds
    [InlineData(3, true)]   // 4th draft succeeds
    [InlineData(4, true)]   // 5th draft succeeds
    [InlineData(5, false)]  // 6th draft fails (velocity cap of 5 reached)
    [InlineData(6, false)]  // >5 drafts fails
    public async Task Handle_ActiveDraftVelocityCap_AdversarialStepStress(int existingDraftCount, bool shouldSucceed)
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        _turnstile.ValidateAsync(Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(true);

        var existingList = new List<BookingDraft>();
        for (var i = 0; i < existingDraftCount; i++)
        {
            existingList.Add(new BookingDraft
            {
                Id = Guid.NewGuid(),
                PatientId = _patientId,
                Status = BookingDraftStatus.Draft
            });
        }

        _draftRepo.GetByPatientAsync(_patientId, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(existingList);

        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);
        var cmd = new CreateBookingDraftCommand(_patientId, _clinicId, null, null, null, $"Draft step {existingDraftCount}", null, "[]", "[]");

        // Act
        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);

        // Assert
        if (shouldSucceed)
        {
            var result = await act.Should().NotThrowAsync();
            await _draftRepo.Received(1).AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
        }
        else
        {
            await act.Should().ThrowAsync<BadRequestException>()
                .WithMessage("Maximum active booking drafts reached.");
            await _draftRepo.DidNotReceive().AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
        }
    }

    [Fact]
    public async Task Handle_WhenPreviousDraftsAreSubmitted_QuotaIsReleasedForNewDrafts()
    {
        // Arrange
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        _turnstile.ValidateAsync(Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(true);

        // 3 active drafts remain in Draft status (2 were previously submitted and are Ready)
        var activeDrafts = new List<BookingDraft>
        {
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
            new() { Id = Guid.NewGuid(), PatientId = _patientId, Status = BookingDraftStatus.Draft },
        };

        // Querying for BookingDraftStatus.Draft returns only the 3 unsubmitted drafts
        _draftRepo.GetByPatientAsync(_patientId, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(activeDrafts);

        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);
        var cmd = new CreateBookingDraftCommand(_patientId, _clinicId, null, null, null, "Followup draft", null, "[]", "[]");

        // Act
        var draftId = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        draftId.Should().NotBeEmpty();
        await _draftRepo.Received(1).AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_VelocityCapIsIsolatedPerPatient()
    {
        // Arrange
        var patientA = Guid.NewGuid();
        var patientB = Guid.NewGuid();

        _patientRepo.GetByIdAsync(patientA, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = patientA, FirstName = "Patient", LastName = "A" });
        _patientRepo.GetByIdAsync(patientB, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = patientB, FirstName = "Patient", LastName = "B" });

        _turnstile.ValidateAsync(Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(true);

        // Patient A has reached cap (5 active drafts)
        _draftRepo.GetByPatientAsync(patientA, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(new List<BookingDraft>
            {
                new() { Id = Guid.NewGuid(), PatientId = patientA, Status = BookingDraftStatus.Draft },
                new() { Id = Guid.NewGuid(), PatientId = patientA, Status = BookingDraftStatus.Draft },
                new() { Id = Guid.NewGuid(), PatientId = patientA, Status = BookingDraftStatus.Draft },
                new() { Id = Guid.NewGuid(), PatientId = patientA, Status = BookingDraftStatus.Draft },
                new() { Id = Guid.NewGuid(), PatientId = patientA, Status = BookingDraftStatus.Draft },
            });

        // Patient B has 0 active drafts
        _draftRepo.GetByPatientAsync(patientB, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(new List<BookingDraft>());

        var handler = new CreateBookingDraftCommandHandler(_patientRepo, _draftRepo, _uow, _turnstile);

        // Act & Assert
        // Patient A is blocked
        var cmdA = new CreateBookingDraftCommand(patientA, _clinicId, null, null, null, "Checkup A", null, "[]", "[]");
        Func<Task> actA = () => handler.Handle(cmdA, CancellationToken.None);
        await actA.Should().ThrowAsync<BadRequestException>()
            .WithMessage("Maximum active booking drafts reached.");

        // Patient B succeeds
        var cmdB = new CreateBookingDraftCommand(patientB, _clinicId, null, null, null, "Checkup B", null, "[]", "[]");
        var draftBId = await handler.Handle(cmdB, CancellationToken.None);
        draftBId.Should().NotBeEmpty();
    }
}

