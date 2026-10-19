using System.Linq.Expressions;
using ClinicEz.Patient.Application.Features.Appointments.Queries.GetAvailableSlots;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;

namespace ClinicEz.Patient.Application.Tests.Features.Appointments.Queries;

public sealed class GetAvailableSlotsQueryHandlerTests
{
    private readonly IProviderAvailabilityRepository _availabilityRepo = Substitute.For<IProviderAvailabilityRepository>();
    private readonly IAppointmentRepository _appointmentRepo = Substitute.For<IAppointmentRepository>();
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IClinicMembershipRepository _membershipRepo = Substitute.For<IClinicMembershipRepository>();
    private readonly IOrganizationMembershipRepository _orgMembershipRepo = Substitute.For<IOrganizationMembershipRepository>();

    private GetAvailableSlotsQueryHandler CreateHandler() =>
        new(_availabilityRepo, _appointmentRepo, _clinicRepo, _membershipRepo, _orgMembershipRepo);

    [Fact]
    public async Task Handle_WhenClinicIsNotGated_ReturnsAvailableSlots()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 19); // Monday

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = false });

        var availabilities = new List<ProviderAvailability>
        {
            new()
            {
                ClinicHealthcareProviderId = providerId,
                DayOfWeek = DayOfWeek.Monday,
                StartTime = new TimeSpan(9, 0, 0),
                EndTime = new TimeSpan(10, 30, 0),
                IsActive = true
            }
        };

        _availabilityRepo.FindAsync(Arg.Any<Expression<Func<ProviderAvailability, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(availabilities);

        _appointmentRepo.FindAsync(Arg.Any<Expression<Func<Appointment, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(new List<Appointment>());

        var result = await CreateHandler().Handle(
            new GetAvailableSlotsQuery(clinicId, providerId, date, ForPatientId: null),
            CancellationToken.None);

        result.Should().HaveCount(3); // 09:00, 09:30, 10:00
        result.Should().OnlyContain(s => s.Available);
    }

    [Fact]
    public async Task Handle_WhenClinicIsGatedAndPatientNotProvided_ReturnsEmptySlots()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 19);

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = true });

        var result = await CreateHandler().Handle(
            new GetAvailableSlotsQuery(clinicId, providerId, date, ForPatientId: null),
            CancellationToken.None);

        result.Should().BeEmpty("unlocked status required to view slots for gated clinic");
        await _availabilityRepo.DidNotReceive().FindAsync(Arg.Any<Expression<Func<ProviderAvailability, bool>>>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenClinicIsGatedAndPatientNotUnlocked_ReturnsEmptySlots()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 19);

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = true, OrganizationLinks = [] });

        _membershipRepo.GetByPatientAndClinicAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        var result = await CreateHandler().Handle(
            new GetAvailableSlotsQuery(clinicId, providerId, date, ForPatientId: patientId),
            CancellationToken.None);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_WhenClinicIsGatedAndPatientHasActiveDirectMembership_ReturnsAvailableSlots()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 19);

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = true });

        _membershipRepo.GetByPatientAndClinicAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns(new ClinicMembership { Status = ClinicMembershipStatus.Active });

        var availabilities = new List<ProviderAvailability>
        {
            new()
            {
                ClinicHealthcareProviderId = providerId,
                DayOfWeek = DayOfWeek.Monday,
                StartTime = new TimeSpan(9, 0, 0),
                EndTime = new TimeSpan(10, 0, 0),
                IsActive = true
            }
        };

        _availabilityRepo.FindAsync(Arg.Any<Expression<Func<ProviderAvailability, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(availabilities);

        _appointmentRepo.FindAsync(Arg.Any<Expression<Func<Appointment, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(new List<Appointment>());

        var result = await CreateHandler().Handle(
            new GetAvailableSlotsQuery(clinicId, providerId, date, ForPatientId: patientId),
            CancellationToken.None);

        result.Should().HaveCount(2); // 09:00, 09:30
    }

    [Fact]
    public async Task Handle_WhenClinicIsGatedAndPatientHasActiveOrgMembership_ReturnsAvailableSlots()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 19);

        var clinic = new Clinic
        {
            Id = clinicId,
            IsGated = true,
            OrganizationLinks =
            [
                new ClinicOrganizationLink { OrganizationId = orgId, IsActive = true }
            ]
        };

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        _membershipRepo.GetByPatientAndClinicAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        _orgMembershipRepo.GetByPatientAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new List<OrganizationMembership>
            {
                new() { OrganizationId = orgId, Status = ClinicMembershipStatus.Active }
            });

        var availabilities = new List<ProviderAvailability>
        {
            new()
            {
                ClinicHealthcareProviderId = providerId,
                DayOfWeek = DayOfWeek.Monday,
                StartTime = new TimeSpan(9, 0, 0),
                EndTime = new TimeSpan(10, 0, 0),
                IsActive = true
            }
        };

        _availabilityRepo.FindAsync(Arg.Any<Expression<Func<ProviderAvailability, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(availabilities);

        _appointmentRepo.FindAsync(Arg.Any<Expression<Func<Appointment, bool>>>(), Arg.Any<CancellationToken>())
            .Returns(new List<Appointment>());

        var result = await CreateHandler().Handle(
            new GetAvailableSlotsQuery(clinicId, providerId, date, ForPatientId: patientId),
            CancellationToken.None);

        result.Should().HaveCount(2);
    }
}
