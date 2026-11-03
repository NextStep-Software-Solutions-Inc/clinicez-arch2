using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Discovery.Queries.UnifiedSearch;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Discovery;

public sealed class UnifiedSearchQueryHandlerTests
{
    private readonly IClinicRepository _repo = Substitute.For<IClinicRepository>();

    [Fact]
    public async Task Handle_WithAllFilter_ReturnsDoctorsClinicsAndServices()
    {
        var clinicId = Guid.NewGuid();
        var clinic = new Clinic
        {
            Id = clinicId,
            Name = "Metro Cardiology Center",
            Address = "402 Medical Blvd, Suite 402",
            FeaturedScore = 4,
            ActiveMemberCount = 94,
            OperatingHours = "Open Today • Closes 6:00 PM"
        };

        var provider = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            Name = "Dr. Evelyn Reed, MD",
            Specialty = "Cardiology Specialist",
            ClinicId = clinicId,
            Clinic = clinic
        };

        var service = new ClinicService
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            Clinic = clinic,
            Name = "Comprehensive Cardiac Screening",
            Description = "Includes 12-lead ECG, Lipid Profile & Consult",
            DurationMinutes = 45
        };

        _repo.SearchProvidersAsync("cardio", 0, 20, Arg.Any<CancellationToken>())
            .Returns(new List<ClinicHealthcareProvider> { provider });
        _repo.SearchAsync("cardio", 0, 20, Arg.Any<CancellationToken>())
            .Returns(new List<Clinic> { clinic });
        _repo.SearchServicesAsync("cardio", 0, 20, Arg.Any<CancellationToken>())
            .Returns(new List<ClinicService> { service });

        var handler = new UnifiedSearchQueryHandler(_repo);

        var result = await handler.Handle(new UnifiedSearchQuery("cardio", "all"), CancellationToken.None);

        result.Should().NotBeNull();
        result.Doctors.Should().HaveCount(1);
        result.Doctors[0].FullName.Should().Be("Dr. Evelyn Reed, MD");
        result.Doctors[0].Specialty.Should().Be("Cardiology Specialist");
        result.Doctors[0].ClinicName.Should().Be("Metro Cardiology Center");

        result.Clinics.Should().HaveCount(1);
        result.Clinics[0].Name.Should().Be("Metro Cardiology Center");
        result.Clinics[0].Address.Should().Be("402 Medical Blvd, Suite 402");
        result.Clinics[0].IsOpenNow.Should().BeTrue();

        result.Services.Should().HaveCount(1);
        result.Services[0].Name.Should().Be("Comprehensive Cardiac Screening");
        result.Services[0].DurationMinutes.Should().Be(45);
        result.Services[0].IsCovered.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_WithSpecificFilter_OnlyQueriesRequestedEntity()
    {
        _repo.SearchProvidersAsync("neuro", 0, 20, Arg.Any<CancellationToken>())
            .Returns(new List<ClinicHealthcareProvider>());

        var handler = new UnifiedSearchQueryHandler(_repo);

        var result = await handler.Handle(new UnifiedSearchQuery("neuro", "doctors"), CancellationToken.None);

        result.Should().NotBeNull();
        await _repo.Received(1).SearchProvidersAsync("neuro", 0, 20, Arg.Any<CancellationToken>());
        await _repo.DidNotReceive().SearchAsync(Arg.Any<string>(), Arg.Any<int>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
        await _repo.DidNotReceive().SearchServicesAsync(Arg.Any<string>(), Arg.Any<int>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
    }
}
