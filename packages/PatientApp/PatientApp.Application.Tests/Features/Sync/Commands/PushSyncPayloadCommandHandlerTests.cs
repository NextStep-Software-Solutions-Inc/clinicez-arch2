using FluentAssertions;
using NSubstitute;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Application.Features.Sync.Commands.PushSyncPayload;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Tests.Features.Sync.Commands;

public sealed class PushSyncPayloadCommandHandlerTests
{
    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly ISyncLogRepository _syncLogRepo = Substitute.For<ISyncLogRepository>();
    private readonly IBackgroundJobEnqueuer _jobEnqueuer = Substitute.For<IBackgroundJobEnqueuer>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    private PushSyncPayloadCommandHandler CreateHandler() =>
        new(_patientRepo, _syncLogRepo, _jobEnqueuer, _uow);

    private static SyncItemRequest MakeItem(Guid? clientId = null) => new(
        clientId ?? Guid.NewGuid(),
        "Patient",
        SyncOperation.Update,
        DateTime.UtcNow.AddSeconds(-5),
        """{"firstName":"Juan","lastName":"Dela Cruz","updatedAt":"2026-06-17T00:00:00Z"}""");

    [Fact]
    public async Task Handle_WithAllNewItems_AcceptsAllAndEnqueuesJob()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var items = new[] { MakeItem(), MakeItem() };

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { FirstName = "Test" });

        _syncLogRepo.GetExistingClientIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(new HashSet<Guid>());   // nothing previously seen

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(2);
        _jobEnqueuer.EnqueueSyncPayload(Arg.Any<Guid>(), Arg.Any<string>()).Returns("job-1");

        // Act
        var ack = await CreateHandler().Handle(
            new PushSyncPayloadCommand(patientId, items), CancellationToken.None);

        // Assert
        ack.Accepted.Should().Be(2);
        ack.AlreadyProcessed.Should().Be(0);

        await _syncLogRepo.Received(1).AddRangeAsync(
            Arg.Is<IEnumerable<SyncLog>>(logs => logs.Count() == 2),
            Arg.Any<CancellationToken>());

        _jobEnqueuer.Received(1).EnqueueSyncPayload(patientId, Arg.Any<string>());
    }

    [Fact]
    public async Task Handle_WithDuplicateClientIds_SkipsAlreadyProcessed()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var existingClientId = Guid.NewGuid();
        var newClientId = Guid.NewGuid();

        var items = new[] { MakeItem(existingClientId), MakeItem(newClientId) };

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { FirstName = "Test" });

        _syncLogRepo.GetExistingClientIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(new HashSet<Guid> { existingClientId });  // item1 already processed

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);
        _jobEnqueuer.EnqueueSyncPayload(Arg.Any<Guid>(), Arg.Any<string>()).Returns("job-2");

        // Act
        var ack = await CreateHandler().Handle(
            new PushSyncPayloadCommand(patientId, items), CancellationToken.None);

        // Assert
        ack.Accepted.Should().Be(1);
        ack.AlreadyProcessed.Should().Be(1);

        await _syncLogRepo.Received(1).AddRangeAsync(
            Arg.Is<IEnumerable<SyncLog>>(logs =>
                logs.Count() == 1 && logs.Single().ClientId == newClientId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenAllItemsAreDuplicates_DoesNotSaveOrEnqueue()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var clientId = Guid.NewGuid();

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { FirstName = "Test" });

        _syncLogRepo.GetExistingClientIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(new HashSet<Guid> { clientId });

        // Act
        var ack = await CreateHandler().Handle(
            new PushSyncPayloadCommand(patientId, [MakeItem(clientId)]), CancellationToken.None);

        // Assert
        ack.Accepted.Should().Be(0);
        ack.AlreadyProcessed.Should().Be(1);

        await _uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
        _jobEnqueuer.DidNotReceive().EnqueueSyncPayload(Arg.Any<Guid>(), Arg.Any<string>());
    }
}
