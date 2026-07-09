using Clinic EZ.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using PatientAppBE.Application.Features.Patients.Commands.CreatePatient;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Tests.Features.Patients.Commands;

public sealed class CreatePatientCommandHandlerTests
{
    private readonly IPatientRepository _repo = Substitute.For<IPatientRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    private CreatePatientCommandHandler CreateHandler() => new(_repo, _uow);

    private static CreatePatientCommand TestCommand(string clerkId = "clerk_test_123") =>
        new(clerkId, "Juan", null, "Dela Cruz", null, "Male", null, "Filipino");

    [Fact]
    public async Task Handle_WhenPatientDoesNotExist_CreatesPatientAndReturnsId()
    {
        // Arrange
        _repo.GetByClerkUserIdAsync("clerk_test_123", Arg.Any<CancellationToken>())
            .Returns((Patient?)null);
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        // Act
        var id = await CreateHandler().Handle(TestCommand(), CancellationToken.None);

        // Assert
        id.Should().NotBeEmpty();

        await _repo.Received(1).AddAsync(
            Arg.Is<Patient>(p =>
                p.ClerkUserId == "clerk_test_123" &&
                p.FirstName == "Juan" &&
                p.LastName == "Dela Cruz"),
            Arg.Any<CancellationToken>());

        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenPatientAlreadyExists_ThrowsConflictException_WithoutSaving()
    {
        // Arrange
        _repo.GetByClerkUserIdAsync("clerk_test_123", Arg.Any<CancellationToken>())
            .Returns(new Patient { ClerkUserId = "clerk_test_123" });

        // Act
        Func<Task> act = async () => await CreateHandler().Handle(TestCommand(), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ConflictException>();
        await _uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }
}
