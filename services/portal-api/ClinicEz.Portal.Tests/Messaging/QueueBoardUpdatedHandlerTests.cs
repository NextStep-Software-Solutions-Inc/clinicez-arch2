using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Messaging;

public class QueueBoardUpdatedHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant;
    private readonly Facility _facility;

    public QueueBoardUpdatedHandlerTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "health-first",
            Name = "Health First",
            OwnerId = "owner-1",
            Email = "admin@healthfirst.ph"
        };

        _facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "main-branch",
            Name = "Health First Main",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_facility);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Task HandleAsync(QueueBoardUpdatedPayload payload, Party from)
    {
        var handler = new QueueBoardUpdatedHandler(_context, NullLogger<QueueBoardUpdatedHandler>.Instance);
        var envelope = InteropEnvelope.Create(InteropTypes.QueueBoardUpdated, from, Party.Portal, Guid.NewGuid(), payload);
        return handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);
    }

    [Fact]
    public async Task HandleAsync_ValidPayload_UpsertsQueueBoard()
    {
        var today = new DateOnly(2026, 10, 25);
        var nowUtc = new DateTime(2026, 10, 25, 8, 30, 0, DateTimeKind.Utc);

        var payload = new QueueBoardUpdatedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            QueueDate = today,
            GeneratedAtUtc = nowUtc,
            IsAcceptingWalkIns = true,
            PatientsWaitingCount = 5,
            NowServing = new List<QueueBoardServingItemDto>
            {
                new()
                {
                    QueueItemId = Guid.NewGuid(),
                    TicketNumber = "T-01",
                    RoomOrStation = "Room 101",
                    DoctorName = "Dr. Cruz",
                    CalledTime = DateTime.UtcNow.AddMinutes(-5)
                }
            },
            UpNext = new List<QueueBoardUpcomingItemDto>
            {
                new()
                {
                    QueueItemId = Guid.NewGuid(),
                    TicketNumber = "T-02",
                    Priority = "Routine",
                    DisplayName = null,
                    CheckInTime = DateTime.UtcNow.AddMinutes(-10)
                },
                new()
                {
                    QueueItemId = Guid.NewGuid(),
                    TicketNumber = "T-03",
                    Priority = "Emergency",
                    DisplayName = null,
                    CheckInTime = DateTime.UtcNow.AddMinutes(-2)
                }
            }
        };

        var from = Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic);
        await HandleAsync(payload, from);

        var stored = await _context.FacilityQueueBoards.AsNoTracking()
            .FirstOrDefaultAsync(q => q.TenantId == _tenant.Id && q.FacilityId == _facility.Id);

        Assert.NotNull(stored);
        Assert.Equal(today, stored.QueueDate);
        Assert.Equal(5, stored.PatientsWaitingCount);
        Assert.True(stored.IsAcceptingWalkIns);
        Assert.Contains("T-01", stored.NowServingJson);
        Assert.Contains("T-02", stored.UpNextJson);
        Assert.Contains("T-03", stored.EmergencyJson);
    }

    [Fact]
    public async Task HandleAsync_StaleGeneratedAtUtc_IgnoresUpdate()
    {
        var today = new DateOnly(2026, 10, 25);
        var freshUtc = new DateTime(2026, 10, 25, 9, 0, 0, DateTimeKind.Utc);
        var staleUtc = new DateTime(2026, 10, 25, 8, 0, 0, DateTimeKind.Utc);
        var from = Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic);

        // Seed with newer timestamp
        var initialPayload = new QueueBoardUpdatedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            QueueDate = today,
            GeneratedAtUtc = freshUtc,
            PatientsWaitingCount = 10,
            NowServing = Array.Empty<QueueBoardServingItemDto>(),
            UpNext = Array.Empty<QueueBoardUpcomingItemDto>()
        };
        await HandleAsync(initialPayload, from);

        // Attempt update with older timestamp
        var stalePayload = new QueueBoardUpdatedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            QueueDate = today,
            GeneratedAtUtc = staleUtc,
            PatientsWaitingCount = 2,
            NowServing = Array.Empty<QueueBoardServingItemDto>(),
            UpNext = Array.Empty<QueueBoardUpcomingItemDto>()
        };
        await HandleAsync(stalePayload, from);

        var stored = await _context.FacilityQueueBoards.AsNoTracking()
            .FirstOrDefaultAsync(q => q.TenantId == _tenant.Id && q.FacilityId == _facility.Id);

        Assert.NotNull(stored);
        Assert.Equal(10, stored.PatientsWaitingCount);
        Assert.Equal(freshUtc, stored.GeneratedAtUtc);
    }
}
