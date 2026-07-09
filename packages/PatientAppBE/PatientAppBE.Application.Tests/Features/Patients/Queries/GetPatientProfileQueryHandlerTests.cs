using Clinic EZ.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using PatientAppBE.Application.Features.Patients.Queries.GetPatientProfile;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Tests.Features.Patients.Queries;

public sealed class GetPatientProfileQueryHandlerTests
{
    private readonly IPatientRepository _repo = Substitute.For<IPatientRepository>();

    private GetPatientProfileQueryHandler CreateHandler() => new(_repo);

    private static Patient BuildPatient() => new()
    {
        ClerkUserId = "clerk_abc",
        FirstName = "Maria",
        LastName = "Santos",
        Sex = SexType.Female,
        Nationality = "Filipino",
    };

    [Fact]
    public async Task Handle_WhenPatientExists_ReturnsMappedProfile()
    {
        // Arrange
        var patient = BuildPatient();
        var query = new GetPatientProfileQuery(patient.Id);

        _repo.GetWithProfileAsync(patient.Id, Arg.Any<CancellationToken>())
            .Returns(patient);

        // Act
        var result = await CreateHandler().Handle(query, CancellationToken.None);

        // Assert
        result.Demographics.FirstName.Should().Be("Maria");
        result.Demographics.LastName.Should().Be("Santos");
        result.Demographics.Sex.Should().Be("Female");
        result.Addresses.Should().BeEmpty();
        result.EmergencyContacts.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_WhenPatientDoesNotExist_ThrowsNotFoundException()
    {
        // Arrange
        var missingId = Guid.NewGuid();
        _repo.GetWithProfileAsync(missingId, Arg.Any<CancellationToken>())
            .Returns((Patient?)null);

        // Act
        Func<Task> act = async () =>
            await CreateHandler().Handle(new GetPatientProfileQuery(missingId), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>();
    }
}
