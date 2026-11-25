using System.Linq.Expressions;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Appointments;
using ClinicEz.Patient.Application.Features.Appointments.Commands.RescheduleAppointment;
using ClinicEz.Patient.Application.Features.Appointments.Queries.GetAvailableSlots;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.CreateBookingDraft;
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

namespace ClinicEz.Patient.Application.Tests.Features.Appointments;

public sealed class BookingPastSlotValidation270Tests
{
    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    // 2026-11-25 10:39:00 +08:00 (Asia/Manila) == 2026-11-25 02:39:00 UTC
    private static readonly DateTimeOffset Manila1039Am =
        new(2026, 11, 25, 10, 39, 0, TimeSpan.FromHours(8));

    [Fact]
    public async Task GetAvailableSlots_At1039Manila_MarksPastSlotsTodayUnavailableAndKeepsFutureSlotsAvailable()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var today = new DateOnly(2026, 11, 25); // Wednesday

        var availabilityRepo = Substitute.For<IProviderAvailabilityRepository>();
        var appointmentRepo = Substitute.For<IAppointmentRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();

        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = false });

        availabilityRepo.FindAsync(Arg.Any<Expression<Func<ProviderAvailability, bool>>>(), Arg.Any<CancellationToken>())
            .Returns([
                new ProviderAvailability
                {
                    ClinicHealthcareProviderId = providerId,
                    DayOfWeek = DayOfWeek.Wednesday,
                    StartTime = new TimeSpan(9, 0, 0),
                    EndTime = new TimeSpan(12, 0, 0),
                    IsActive = true
                }
            ]);

        appointmentRepo.FindAsync(Arg.Any<Expression<Func<Appointment, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(new List<Appointment>());

        var handler = new GetAvailableSlotsQueryHandler(
            availabilityRepo,
            appointmentRepo,
            clinicRepo,
            timeProvider: new FixedTimeProvider(Manila1039Am));

        var slots = await handler.Handle(new GetAvailableSlotsQuery(clinicId, providerId, today), CancellationToken.None);

        slots.Select(s => (s.Time, s.Available)).Should().Equal(
            ("09:00", false),
            ("09:30", false),
            ("10:00", false),
            ("10:30", false),
            ("11:00", true),
            ("11:30", true));
    }

    [Fact]
    public async Task GetAvailableSlots_AtExactSlotStartBoundary_MarksCurrentSlotUnavailable()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var today = new DateOnly(2026, 11, 25);

        var availabilityRepo = Substitute.For<IProviderAvailabilityRepository>();
        var appointmentRepo = Substitute.For<IAppointmentRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();

        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = false });
        availabilityRepo.FindAsync(Arg.Any<Expression<Func<ProviderAvailability, bool>>>(), Arg.Any<CancellationToken>())
            .Returns([
                new ProviderAvailability
                {
                    ClinicHealthcareProviderId = providerId,
                    DayOfWeek = DayOfWeek.Wednesday,
                    StartTime = new TimeSpan(10, 30, 0),
                    EndTime = new TimeSpan(11, 30, 0),
                    IsActive = true
                }
            ]);
        appointmentRepo.FindAsync(Arg.Any<Expression<Func<Appointment, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(new List<Appointment>());

        var at102959 = new FixedTimeProvider(new DateTimeOffset(2026, 11, 25, 10, 29, 59, TimeSpan.FromHours(8)));
        var beforeHandler = new GetAvailableSlotsQueryHandler(availabilityRepo, appointmentRepo, clinicRepo, timeProvider: at102959);
        var beforeSlots = await beforeHandler.Handle(new GetAvailableSlotsQuery(clinicId, providerId, today), CancellationToken.None);
        beforeSlots.Should().ContainSingle(s => s.Time == "10:30").Which.Available.Should().BeTrue();

        var at103000 = new FixedTimeProvider(new DateTimeOffset(2026, 11, 25, 10, 30, 0, TimeSpan.FromHours(8)));
        var exactHandler = new GetAvailableSlotsQueryHandler(availabilityRepo, appointmentRepo, clinicRepo, timeProvider: at103000);
        var exactSlots = await exactHandler.Handle(new GetAvailableSlotsQuery(clinicId, providerId, today), CancellationToken.None);
        exactSlots.Should().ContainSingle(s => s.Time == "10:30").Which.Available.Should().BeFalse();
        exactSlots.Should().ContainSingle(s => s.Time == "11:00").Which.Available.Should().BeTrue();
    }

    [Fact]
    public async Task GetAvailableSlots_ForTomorrowAndYesterday_RespectsManilaCalendarDate()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();

        var availabilityRepo = Substitute.For<IProviderAvailabilityRepository>();
        var appointmentRepo = Substitute.For<IAppointmentRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();

        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = false });
        availabilityRepo.FindAsync(Arg.Any<Expression<Func<ProviderAvailability, bool>>>(), Arg.Any<CancellationToken>())
            .Returns([
                new ProviderAvailability
                {
                    ClinicHealthcareProviderId = providerId,
                    DayOfWeek = DayOfWeek.Thursday,
                    StartTime = new TimeSpan(9, 0, 0),
                    EndTime = new TimeSpan(10, 0, 0),
                    IsActive = true
                }
            ]);
        appointmentRepo.FindAsync(Arg.Any<Expression<Func<Appointment, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(new List<Appointment>());

        var handler = new GetAvailableSlotsQueryHandler(
            availabilityRepo,
            appointmentRepo,
            clinicRepo,
            timeProvider: new FixedTimeProvider(Manila1039Am));

        var tomorrowSlots = await handler.Handle(new GetAvailableSlotsQuery(clinicId, providerId, new DateOnly(2026, 11, 26)), CancellationToken.None);
        tomorrowSlots.Should().HaveCount(2);
        tomorrowSlots.Should().OnlyContain(s => s.Available);

        var yesterdaySlots = await handler.Handle(new GetAvailableSlotsQuery(clinicId, providerId, new DateOnly(2026, 11, 24)), CancellationToken.None);
        yesterdaySlots.Should().HaveCount(2);
        yesterdaySlots.Should().OnlyContain(s => !s.Available);
    }

    [Theory]
    [InlineData("09:00")]
    [InlineData("10:00 AM")]
    [InlineData("10:30")]
    public async Task CreateBookingDraft_WhenSlotAlreadyPassedInManila_RejectsWithValidationException(string pastTime)
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var patientRepo = Substitute.For<IPatientRepository>();
        var draftRepo = Substitute.For<IBookingDraftRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var uow = Substitute.For<IUnitOfWork>();

        patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, Name = "Nextstep OPD", SupportsAppointments = true });
        draftRepo.GetByPatientAsync(patientId, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(new List<BookingDraft>());

        var timeProvider = new FixedTimeProvider(Manila1039Am);
        var cmd = new CreateBookingDraftCommand(
            patientId,
            clinicId,
            null,
            PreferredDate: new DateOnly(2026, 11, 25),
            PreferredTime: pastTime,
            Reason: "General Consultation",
            Notes: null,
            ShareFieldsJson: "[]",
            AttachedFileIdsJson: "[]");

        var validator = new CreateBookingDraftCommandValidator(timeProvider);
        var validationResult = await validator.ValidateAsync(cmd);
        validationResult.IsValid.Should().BeFalse();

        var handler = new CreateBookingDraftCommandHandler(patientRepo, draftRepo, uow, clinicRepo, timeProvider);
        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*already passed*");
        await draftRepo.DidNotReceive().AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreateBookingDraft_WhenSlotIsInFutureManila_Succeeds()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var patientRepo = Substitute.For<IPatientRepository>();
        var draftRepo = Substitute.For<IBookingDraftRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = patientId, FirstName = "Juan", LastName = "Dela Cruz" });
        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, Name = "Nextstep OPD", SupportsAppointments = true });
        draftRepo.GetByPatientAsync(patientId, BookingDraftStatus.Draft, Arg.Any<CancellationToken>())
            .Returns(new List<BookingDraft>());

        var timeProvider = new FixedTimeProvider(Manila1039Am);
        var cmd = new CreateBookingDraftCommand(
            patientId,
            clinicId,
            null,
            PreferredDate: new DateOnly(2026, 11, 25),
            PreferredTime: "11:00",
            Reason: "General Consultation",
            Notes: null,
            ShareFieldsJson: "[]",
            AttachedFileIdsJson: "[]");

        var validator = new CreateBookingDraftCommandValidator(timeProvider);
        (await validator.ValidateAsync(cmd)).IsValid.Should().BeTrue();

        var handler = new CreateBookingDraftCommandHandler(patientRepo, draftRepo, uow, clinicRepo, timeProvider);
        var id = await handler.Handle(cmd, CancellationToken.None);

        id.Should().NotBeEmpty();
        await draftRepo.Received(1).AddAsync(Arg.Any<BookingDraft>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SubmitBookingDraft_WhenSlotPassedBeforeConfirm_RejectsWithValidationExceptionAndEnqueuesNothing()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var draftRepo = Substitute.For<IBookingDraftRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var publisher = Substitute.For<IInteropPublisher>();
        var patientRepo = Substitute.For<IPatientRepository>();
        var accessRepo = Substitute.For<IPatientAccessRepository>();
        var storage = Substitute.For<IStorageService>();

        var draft = new BookingDraft
        {
            Id = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            Status = BookingDraftStatus.Draft,
            PreferredDate = new DateOnly(2026, 11, 25),
            PreferredTime = "10:30",
            Reason = "General Consultation"
        };
        draftRepo.GetByIdAsync(draftId, Arg.Any<CancellationToken>()).Returns(draft);
        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, Name = "Nextstep OPD", TenantId = "tenant-a", SupportsAppointments = true });

        var handler = new SubmitBookingDraftCommandHandler(
            draftRepo,
            clinicRepo,
            uow,
            membershipRepo,
            publisher,
            patientRepo,
            accessRepo,
            storage,
            Options.Create(new SharingOptions { BookingGrantDays = 30 }),
            new PatientShareSnapshotBuilder(patientRepo, Substitute.For<IPatientDocumentRepository>()),
            timeProvider: new FixedTimeProvider(Manila1039Am));

        Func<Task> act = () => handler.Handle(new SubmitBookingDraftCommand(patientId, draftId), CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*already passed*");

        draft.Status.Should().Be(BookingDraftStatus.Draft);
        publisher.DidNotReceiveWithAnyArgs().Enqueue<AppointmentBookedEvent>(default!, default!, default!, default, default!);
        await uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RescheduleAppointment_WhenScheduledAtInPast_RejectsWithValidationException()
    {
        var timeProvider = new FixedTimeProvider(Manila1039Am);
        var pastUtc = new DateTimeOffset(2026, 11, 25, 9, 0, 0, TimeSpan.FromHours(8)).UtcDateTime;
        var cmd = new RescheduleAppointmentCommand(Guid.NewGuid(), Guid.NewGuid(), pastUtc, "Conflict");

        var validator = new RescheduleAppointmentCommandValidator(timeProvider);
        (await validator.ValidateAsync(cmd)).IsValid.Should().BeFalse();

        var handler = new RescheduleAppointmentCommandHandler(
            Substitute.For<IAppointmentRepository>(),
            Substitute.For<IBookingDraftRepository>(),
            Substitute.For<IClinicRepository>(),
            Substitute.For<IPatientRepository>(),
            Substitute.For<IInteropPublisher>(),
            Substitute.For<IUnitOfWork>(),
            timeProvider);

        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*already passed*");
    }
}
