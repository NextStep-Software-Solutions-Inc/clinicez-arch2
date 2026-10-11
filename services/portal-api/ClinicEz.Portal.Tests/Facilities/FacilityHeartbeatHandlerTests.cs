using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Facilities;

public class FacilityHeartbeatHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero));
    private readonly Tenant _tenant = new() { Id = Guid.NewGuid(), TenantSlug = "metro", Name = "Metro", OwnerId = "owner", Email = "o@metro.ph" };
    private readonly Facility _facility;

    public FacilityHeartbeatHandlerTests()
    {
        _facility = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Clinic", FacilityType = FacilityType.Clinic };
        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_facility);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Task BeatAsync(Party from, string version = "1.4.2") =>
        new FacilityHeartbeatHandler(_context, _clock, NullLogger<FacilityHeartbeatHandler>.Instance)
            .HandleAsync(
                new FacilityHeartbeatPayload { AppVersion = version },
                new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityHeartbeat, from, Party.Portal, Guid.NewGuid(), new FacilityHeartbeatPayload())),
                CancellationToken.None);

    private Party Self(string? service = null) =>
        Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic, service);

    [Theory]
    [InlineData(null)]
    [InlineData("clinic")]
    [InlineData("billing")]
    public async Task HeartbeatFromTheFacility_RecordsLastSeenAndVersion(string? service)
    {
        await BeatAsync(Self(service));

        var stored = await _context.Facilities.AsNoTracking().SingleAsync();
        Assert.Equal(_clock.GetUtcNow().UtcDateTime, stored.LastSeenAt);
        Assert.Equal("1.4.2", stored.AppVersion);
    }

    [Fact]
    public async Task AVeryLongOrBlankVersion_IsCappedOrCleared()
    {
        await BeatAsync(Self(), new string('v', 200));
        Assert.Equal(64, (await _context.Facilities.AsNoTracking().SingleAsync()).AppVersion!.Length);

        await BeatAsync(Self(), "   ");
        Assert.Null((await _context.Facilities.AsNoTracking().SingleAsync()).AppVersion);
    }

    [Fact]
    public async Task HeartbeatFromAnyoneElse_IsDropped()
    {
        await BeatAsync(Party.Portal);
        await BeatAsync(Party.ForPatient(Guid.NewGuid().ToString()));
        await BeatAsync(Party.ForFacility(Guid.NewGuid().ToString(), _facility.Id.ToString(), FacilityType.Clinic));
        await BeatAsync(Party.ForFacility(_tenant.Id.ToString(), Guid.NewGuid().ToString(), FacilityType.Clinic));
        await BeatAsync(new Party { Kind = PartyKind.Facility, TenantId = "nope", FacilityId = "nope", FacilityType = FacilityType.Clinic });

        var stored = await _context.Facilities.AsNoTracking().SingleAsync();
        Assert.Null(stored.LastSeenAt);
        Assert.Null(stored.AppVersion);
    }
}
