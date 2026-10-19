using System.Text.Json;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeAllDeviceSessions;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;
using ClinicEz.Patient.Application.Features.DeviceSessions.Queries.ListDeviceSessions;
using ClinicEz.Patient.Application.Features.Sync.Commands.PushSyncPayload;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Patient.Infrastructure.Services.Jobs;
using ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace ClinicEz.Patient.Application.Tests.Features.DeviceSessions;

/// <summary>A patient can be signed in on several devices at once; no device ever signs another out by itself.</summary>
public sealed class MultiDeviceSessionTests : IDisposable
{
    private readonly ApplicationDbContext _db =
        new(new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private readonly ISyncNotificationService _notifications = Substitute.For<ISyncNotificationService>();
    private readonly Guid _patientId = Guid.NewGuid();

    public MultiDeviceSessionTests()
    {
        _db.Patients.Add(new Domain.Entities.Patient
        {
            Id = _patientId, ClerkUserId = "clerk_owner", FirstName = "Ana", LastName = "Reyes"
        });
        _db.SaveChanges();
    }

    public void Dispose() => _db.Dispose();

    private RegisterDeviceSessionCommandHandler RegisterHandler() =>
        new(new PatientRepository(_db), new DeviceSessionRepository(_db), new UnitOfWork(_db));

    private RevokeDeviceSessionCommandHandler RevokeHandler() =>
        new(new DeviceSessionRepository(_db), _notifications, new UnitOfWork(_db));

    private RevokeAllDeviceSessionsCommandHandler RevokeAllHandler() =>
        new(new DeviceSessionRepository(_db), _notifications, new UnitOfWork(_db));

    private Task<RegisterDeviceSessionResponse> RegisterAsync(
        string deviceId, string label = "Pixel", string? pushToken = null, Guid? patientId = null) =>
        RegisterHandler().Handle(
            new RegisterDeviceSessionCommand(patientId ?? _patientId, deviceId, label, $"sess_{deviceId}", pushToken),
            CancellationToken.None);

    private async Task<IReadOnlyList<DeviceSessionDto>> ListAsync() =>
        await new ListDeviceSessionsQueryHandler(new DeviceSessionRepository(_db))
            .Handle(new ListDeviceSessionsQuery(_patientId), CancellationToken.None);

    [Fact]
    public async Task Registering_a_second_device_keeps_the_first_signed_in_and_revokes_nobody()
    {
        await RegisterAsync("phone");
        await RegisterAsync("tablet", "iPad");

        (await ListAsync()).Select(s => s.DeviceId).Should().BeEquivalentTo("phone", "tablet");
        await _notifications.DidNotReceiveWithAnyArgs().NotifySessionRevokedAsync(default, default!, default, default);
    }

    [Fact]
    public async Task Registering_a_known_device_again_refreshes_its_session_instead_of_adding_one()
    {
        var first = await RegisterAsync("phone", "Pixel", "token-1");
        var second = await RegisterAsync("phone", "Pixel 9", "token-2");

        second.SessionId.Should().Be(first.SessionId);
        var sessions = await _db.DeviceSessions.Where(s => s.PatientId == _patientId).ToListAsync();
        sessions.Should().ContainSingle().Which.Should().Match<Domain.Entities.DeviceSession>(s =>
            s.DeviceLabel == "Pixel 9" && s.PushToken == "token-2" && !s.IsRevoked);
    }

    [Fact]
    public async Task A_device_signed_out_earlier_can_register_again_with_a_new_session()
    {
        var first = await RegisterAsync("phone");
        await RevokeHandler().Handle(new RevokeDeviceSessionCommand(_patientId, first.SessionId), CancellationToken.None);

        var again = await RegisterAsync("phone");

        again.SessionId.Should().NotBe(first.SessionId);
        (await ListAsync()).Should().ContainSingle().Which.Id.Should().Be(again.SessionId);
    }

    [Fact]
    public async Task Registering_for_an_unknown_patient_is_not_found()
    {
        var act = () => RegisterAsync("phone", patientId: Guid.NewGuid());

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Revoking_one_device_signs_out_only_that_device_and_tells_only_it()
    {
        var phone = await RegisterAsync("phone");
        await RegisterAsync("tablet");

        await RevokeHandler().Handle(new RevokeDeviceSessionCommand(_patientId, phone.SessionId), CancellationToken.None);

        (await ListAsync()).Select(s => s.DeviceId).Should().BeEquivalentTo("tablet");
        await _notifications.Received(1).NotifySessionRevokedAsync(
            _patientId, Arg.Any<string>(), "phone", Arg.Any<CancellationToken>());
        var revoked = await _db.DeviceSessions.SingleAsync(s => s.Id == phone.SessionId);
        revoked.IsRevoked.Should().BeTrue();
        revoked.RevokedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task A_session_of_another_patient_cannot_be_revoked()
    {
        var otherPatient = Guid.NewGuid();
        _db.Patients.Add(new Domain.Entities.Patient
        {
            Id = otherPatient, ClerkUserId = "clerk_other", FirstName = "Ben", LastName = "Cruz"
        });
        await _db.SaveChangesAsync();
        var theirs = await RegisterAsync("their-phone", patientId: otherPatient);

        var act = () => RevokeHandler().Handle(new RevokeDeviceSessionCommand(_patientId, theirs.SessionId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
        (await _db.DeviceSessions.SingleAsync(s => s.Id == theirs.SessionId)).IsRevoked.Should().BeFalse();
    }

    [Fact]
    public async Task Revoking_a_session_twice_is_not_found_the_second_time()
    {
        var phone = await RegisterAsync("phone");
        await RevokeHandler().Handle(new RevokeDeviceSessionCommand(_patientId, phone.SessionId), CancellationToken.None);

        var act = () => RevokeHandler().Handle(new RevokeDeviceSessionCommand(_patientId, phone.SessionId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Signing_out_everywhere_revokes_every_device_and_notifies_the_whole_patient()
    {
        await RegisterAsync("phone");
        await RegisterAsync("tablet");

        await RevokeAllHandler().Handle(new RevokeAllDeviceSessionsCommand(_patientId), CancellationToken.None);

        (await ListAsync()).Should().BeEmpty();
        await _notifications.Received(1).NotifySessionRevokedAsync(
            _patientId, Arg.Any<string>(), null, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task The_list_shows_only_active_devices_most_recently_active_first()
    {
        var old = await RegisterAsync("old-phone");
        await RegisterAsync("tablet");
        var revoked = await RegisterAsync("revoked-laptop");
        await RevokeHandler().Handle(new RevokeDeviceSessionCommand(_patientId, revoked.SessionId), CancellationToken.None);
        (await _db.DeviceSessions.SingleAsync(s => s.Id == old.SessionId)).LastActiveAt = DateTime.UtcNow.AddDays(-3);
        await _db.SaveChangesAsync();

        var sessions = await ListAsync();

        sessions.Select(s => s.DeviceId).Should().Equal("tablet", "old-phone");
    }

    private static SyncItemRequest PatientUpdate(Guid key, string firstName, DateTime updatedAt, Guid patientId) =>
        new(key, SyncableEntityTypes.Patient, SyncOperation.Update, updatedAt,
            JsonSerializer.Serialize(new { firstName, lastName = "Reyes", clerkUserId = "clerk_owner", updatedAt }),
            patientId);

    private PushSyncPayloadCommandHandler PushHandler()
    {
        var patients = new PatientRepository(_db);
        var processor = new SyncPayloadProcessor(
            new UnitOfWork(_db),
            _notifications,
            [new PatientSyncProcessor(patients)],
            NullLogger<SyncPayloadProcessor>.Instance);
        return new PushSyncPayloadCommandHandler(
            patients, new SyncLogRepository(_db), Substitute.For<IBackgroundJobEnqueuer>(), new UnitOfWork(_db), processor);
    }

    [Fact]
    public async Task Two_devices_pushing_to_one_patient_are_idempotent_and_resolve_conflicts_last_write_wins()
    {
        var keyFromPhone = Guid.NewGuid();
        var keyFromTablet = Guid.NewGuid();

        var phone = await PushHandler().Handle(new PushSyncPayloadCommand(_patientId,
            [PatientUpdate(keyFromPhone, "FromPhone", DateTime.UtcNow.AddMinutes(1), _patientId)]), CancellationToken.None);
        var tablet = await PushHandler().Handle(new PushSyncPayloadCommand(_patientId,
            [PatientUpdate(keyFromTablet, "FromTablet", DateTime.UtcNow.AddMinutes(2), _patientId)]), CancellationToken.None);

        phone.Applied.Should().Be(1);
        tablet.Applied.Should().Be(1);
        (await _db.Patients.AsNoTracking().SingleAsync(p => p.Id == _patientId)).FirstName.Should().Be("FromTablet");

        var phoneRetry = await PushHandler().Handle(new PushSyncPayloadCommand(_patientId,
            [PatientUpdate(keyFromPhone, "FromPhone", DateTime.UtcNow.AddMinutes(1), _patientId)]), CancellationToken.None);
        phoneRetry.AlreadyProcessed.Should().Be(1);
        phoneRetry.Accepted.Should().Be(0);
        (await _db.Patients.AsNoTracking().SingleAsync(p => p.Id == _patientId)).FirstName.Should().Be("FromTablet");

        var staleFromPhone = await PushHandler().Handle(new PushSyncPayloadCommand(_patientId,
            [PatientUpdate(Guid.NewGuid(), "Stale", DateTime.UtcNow.AddDays(-1), _patientId)]), CancellationToken.None);
        staleFromPhone.Conflicts.Should().Be(1);
        staleFromPhone.Applied.Should().Be(0);
        (await _db.Patients.AsNoTracking().SingleAsync(p => p.Id == _patientId)).FirstName.Should().Be("FromTablet");
    }

    [Fact]
    public async Task An_applied_push_from_either_device_raises_one_sync_completed_notification_for_the_patient()
    {
        await PushHandler().Handle(new PushSyncPayloadCommand(_patientId,
            [PatientUpdate(Guid.NewGuid(), "FromPhone", DateTime.UtcNow.AddMinutes(1), _patientId)]), CancellationToken.None);

        await _notifications.Received(1).NotifySyncCompletedAsync(_patientId, 1, 0, Arg.Any<CancellationToken>());
    }
}
