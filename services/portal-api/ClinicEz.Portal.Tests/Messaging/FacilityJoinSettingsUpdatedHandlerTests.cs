using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Messaging;

public class FacilityJoinSettingsUpdatedHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant;
    private readonly Facility _facility;

    public FacilityJoinSettingsUpdatedHandlerTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "metro-health",
            Name = "Metro Health",
            OwnerId = "owner-1",
            Email = "admin@metro.ph"
        };

        _facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "main-clinic",
            Name = "Metro Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsJoinEnabled = true,
            JoinCode = "OLD123",
            JoinSettingsUpdatedAtUtc = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
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

    private Task HandleAsync(FacilityJoinSettingsUpdatedPayload payload, Party from)
    {
        var handler = new FacilityJoinSettingsUpdatedHandler(_context, NullLogger<FacilityJoinSettingsUpdatedHandler>.Instance);
        var envelope = InteropEnvelope.Create(InteropTypes.FacilityJoinSettingsUpdated, from, Party.Portal, Guid.NewGuid(), payload);
        return handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);
    }

    [Fact]
    public async Task HandleAsync_ValidFromFacility_UpdatesSettingsAndAddress()
    {
        var updatedUtc = new DateTime(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);
        var payload = new FacilityJoinSettingsUpdatedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            IsJoinEnabled = true,
            JoinCode = "metro42",
            JoinCodeExpiresAtUtc = updatedUtc.AddDays(30),
            FacilityAddress = "123 Medical Boulevard, QC",
            OperatingHours = "Mon-Fri 8am-5pm",
            UpdatedAtUtc = updatedUtc
        };

        var from = Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic);
        await HandleAsync(payload, from);

        var updated = await _context.Facilities.AsNoTracking().FirstOrDefaultAsync(f => f.Id == _facility.Id);
        Assert.NotNull(updated);
        Assert.True(updated.IsJoinEnabled);
        Assert.Equal("METRO42", updated.JoinCode);
        Assert.Equal(updatedUtc.AddDays(30), updated.JoinCodeExpiresAtUtc);
        Assert.Equal(updatedUtc, updated.JoinSettingsUpdatedAtUtc);
        Assert.Equal("123 Medical Boulevard, QC", updated.StreetAddress);
        Assert.Equal("Mon-Fri 8am-5pm", updated.OperatingHours);
    }

    [Fact]
    public async Task HandleAsync_MismatchedSender_DropsMessage()
    {
        var payload = new FacilityJoinSettingsUpdatedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            IsJoinEnabled = false,
            JoinCode = "HACKED",
            UpdatedAtUtc = DateTime.UtcNow
        };

        // Sender is a different facility
        var rogueFacilityId = Guid.NewGuid();
        var from = Party.ForFacility(_tenant.Id.ToString(), rogueFacilityId.ToString(), FacilityType.Clinic);
        await HandleAsync(payload, from);

        var stored = await _context.Facilities.AsNoTracking().FirstOrDefaultAsync(f => f.Id == _facility.Id);
        Assert.NotNull(stored);
        Assert.Equal("OLD123", stored.JoinCode);
        Assert.True(stored.IsJoinEnabled);
    }

    [Fact]
    public async Task HandleAsync_StaleTimestamp_IgnoresUpdate()
    {
        var staleUtc = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        var payload = new FacilityJoinSettingsUpdatedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            IsJoinEnabled = false,
            JoinCode = "STALE123",
            UpdatedAtUtc = staleUtc
        };

        var from = Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic);
        await HandleAsync(payload, from);

        var stored = await _context.Facilities.AsNoTracking().FirstOrDefaultAsync(f => f.Id == _facility.Id);
        Assert.NotNull(stored);
        Assert.Equal("OLD123", stored.JoinCode);
        Assert.True(stored.IsJoinEnabled);
    }

    [Fact]
    public async Task HandleAsync_FacilityNotFound_TenantExists_UpsertsFacility()
    {
        var newFacilityId = Guid.NewGuid();
        var payload = new FacilityJoinSettingsUpdatedPayload
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = newFacilityId,
            IsJoinEnabled = true,
            JoinCode = "NEWFAC1",
            FacilityAddress = "456 Extension Wing",
            OperatingHours = "24/7",
            UpdatedAtUtc = DateTime.UtcNow
        };

        var from = Party.ForFacility(_tenant.Id.ToString(), newFacilityId.ToString(), FacilityType.Clinic);
        await HandleAsync(payload, from);

        var created = await _context.Facilities.AsNoTracking().FirstOrDefaultAsync(f => f.Id == newFacilityId);
        Assert.NotNull(created);
        Assert.Equal("NEWFAC1", created.JoinCode);
        Assert.True(created.IsJoinEnabled);
        Assert.Equal("456 Extension Wing", created.StreetAddress);
    }
}
