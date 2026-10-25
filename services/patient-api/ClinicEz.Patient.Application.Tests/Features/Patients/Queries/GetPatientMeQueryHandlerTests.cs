using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using NSubstitute;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMe;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Queries;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class GetPatientMeQueryHandlerTests
{
    private readonly IPatientRepository _repo = Substitute.For<IPatientRepository>();

    private GetPatientMeQueryHandler CreateHandler() => new(_repo);

    [Fact]
    public async Task Handle_WhenPatientNotFound_ReturnsNull()
    {
        _repo.GetForMeByClerkUserIdAsync("user_missing", Arg.Any<CancellationToken>())
            .Returns((Patient?)null);

        var result = await CreateHandler().Handle(new GetPatientMeQuery("user_missing"), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenPatientFound_MapsDemographicsAndFormattedAddress()
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicEzId = "CE-ABCD-1234",
            ClerkUserId = "user_clerk_123",
            FirstName = "Juan",
            MiddleName = "Protacio",
            LastName = "Rizal",
            Suffix = "Jr",
            Sex = SexType.Male,
            DateOfBirth = new DateOnly(1990, 6, 19),
            CivilStatus = CivilStatus.Married,
            Mobile = "+639171234567",
            Email = "juan.rizal@example.com",
            Addresses = new List<PatientAddress>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Type = AddressType.Home,
                    HouseStreet = "Calamba St.",
                    Barangay = "Brgy 1",
                    CityMunicipality = "Calamba",
                    Province = "Laguna",
                    Region = "Region IV-A",
                    ZipCode = "4027",
                    IsPrimary = true
                }
            }
        };

        _repo.GetForMeByClerkUserIdAsync("user_clerk_123", Arg.Any<CancellationToken>())
            .Returns(patient);

        var result = await CreateHandler().Handle(new GetPatientMeQuery("user_clerk_123"), CancellationToken.None);

        result.Should().NotBeNull();
        result!.ClinicEzId.Should().Be("CE-ABCD-1234");
        result.FirstName.Should().Be("Juan");
        result.MiddleName.Should().Be("Protacio");
        result.LastName.Should().Be("Rizal");
        result.Suffix.Should().Be("Jr");
        result.Sex.Should().Be("Male");
        result.DateOfBirth.Should().Be(new DateOnly(1990, 6, 19));
        result.CivilStatus.Should().Be("Married");
        result.ContactNumber.Should().Be("+639171234567");
        result.Mobile.Should().Be("+639171234567");
        result.Email.Should().Be("juan.rizal@example.com");
        result.Address.Should().Be("Calamba St., Brgy 1, Calamba, Laguna, Region IV-A, 4027");
        result.Addresses.Should().HaveCount(1);
        result.Addresses[0].HouseStreet.Should().Be("Calamba St.");
        result.PhilHealthPin.Should().BeNull();
        result.GovernmentIds.Should().BeEmpty();
        result.Allergies.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_WhenPatientHasPhilHealthId_ExtractsPhilHealthPin()
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicEzId = "CE-EFGH-5678",
            ClerkUserId = "user_philhealth",
            FirstName = "Maria",
            LastName = "Clara",
            GovernmentIds = new List<PatientGovernmentId>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    IdType = GovernmentIdType.PhilHealth,
                    IdNumber = "12-345678901-2"
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    IdType = GovernmentIdType.Passport,
                    IdNumber = "P1234567A"
                }
            }
        };

        _repo.GetForMeByClerkUserIdAsync("user_philhealth", Arg.Any<CancellationToken>())
            .Returns(patient);

        var result = await CreateHandler().Handle(new GetPatientMeQuery("user_philhealth"), CancellationToken.None);

        result.Should().NotBeNull();
        result!.PhilHealthPin.Should().Be("12-345678901-2");
        result.GovernmentIds.Should().HaveCount(2);
    }

    [Fact]
    public async Task Handle_WhenPatientHasAllergies_MapsAllergiesList()
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicEzId = "CE-IJKL-9012",
            ClerkUserId = "user_allergies",
            FirstName = "Crisostomo",
            LastName = "Ibarra",
            Allergies = new List<PatientAllergy>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    AllergenName = "Penicillin",
                    AllergyType = AllergyType.Drug,
                    Severity = AllergySeverity.Severe,
                    Reaction = "Hives and swelling"
                }
            }
        };

        _repo.GetForMeByClerkUserIdAsync("user_allergies", Arg.Any<CancellationToken>())
            .Returns(patient);

        var result = await CreateHandler().Handle(new GetPatientMeQuery("user_allergies"), CancellationToken.None);

        result.Should().NotBeNull();
        result!.Allergies.Should().HaveCount(1);
        result.Allergies[0].AllergenName.Should().Be("Penicillin");
        result.Allergies[0].Severity.Should().Be("Severe");
        result.Allergies[0].Reaction.Should().Be("Hives and swelling");
    }
}
