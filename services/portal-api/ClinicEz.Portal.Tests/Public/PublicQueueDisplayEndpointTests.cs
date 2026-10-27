using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Public;

public class PublicQueueDisplayEndpointTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant;
    private readonly Facility _clinic;

    public PublicQueueDisplayEndpointTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "makati-med",
            Name = "Makati Medical",
            OwnerId = "owner-q",
            Email = "queue@makatimed.ph"
        };

        _clinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "opd-queue",
            Name = "Makati Med OPD",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_clinic);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetQueueDisplay_TodayManilaBoard_Returns200WithTickets()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var todayManila = DateOnly.FromDateTime(nowManila);

        var serving = new List<QueueBoardServingItemDto>
        {
            new()
            {
                QueueItemId = Guid.NewGuid(),
                TicketNumber = "A-10",
                RoomOrStation = "Station 1",
                DoctorName = "Dr. Tan",
                CalledTime = DateTime.UtcNow
            }
        };
        var upcoming = new List<QueueBoardUpcomingItemDto>
        {
            new()
            {
                QueueItemId = Guid.NewGuid(),
                TicketNumber = "A-11",
                Priority = "Routine",
                DisplayName = null,
                CheckInTime = DateTime.UtcNow
            }
        };

        var board = new FacilityQueueBoard
        {
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            QueueDate = todayManila,
            PatientsWaitingCount = 3,
            NowServingJson = JsonSerializer.Serialize(serving),
            UpNextJson = JsonSerializer.Serialize(upcoming)
        };
        _context.FacilityQueueBoards.Add(board);
        await _context.SaveChangesAsync();

        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("makati-med", "opd-queue", _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Equal(_clinic.Id, response.Data.ClinicId);
        Assert.Equal(3, response.Data.PatientsWaitingCount);
        Assert.Single(response.Data.NowServing);
        Assert.Equal("A-10", response.Data.NowServing[0].TicketNumber);
        Assert.Single(response.Data.UpNext);
        Assert.Equal("A-11", response.Data.UpNext[0].TicketNumber);
    }

    [Fact]
    public async Task GetQueueDisplay_StrictZeroPhiInUpNext_DisplayNameIsAlwaysNull()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var todayManila = DateOnly.FromDateTime(nowManila);

        // Upcoming item erroneously populated with name in json
        var upcoming = new List<QueueBoardUpcomingItemDto>
        {
            new()
            {
                QueueItemId = Guid.NewGuid(),
                TicketNumber = "B-22",
                Priority = "Routine",
                DisplayName = "Juan Dela Cruz",
                CheckInTime = DateTime.UtcNow
            }
        };

        var board = new FacilityQueueBoard
        {
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            QueueDate = todayManila,
            NowServingJson = "[]",
            UpNextJson = JsonSerializer.Serialize(upcoming)
        };
        _context.FacilityQueueBoards.Add(board);
        await _context.SaveChangesAsync();

        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("makati-med", "opd-queue", _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Single(response.Data.UpNext);
        // Strict Zero PHI guarantee: DisplayName MUST be stripped to null
        Assert.Null(response.Data.UpNext[0].DisplayName);
        Assert.True(response.Data.MaskPatientNames);
    }

    [Fact]
    public async Task GetQueueDisplay_StaleYesterdayBoard_ReturnsEmptyLists()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var yesterdayManila = DateOnly.FromDateTime(nowManila).AddDays(-1);

        var serving = new List<QueueBoardServingItemDto>
        {
            new()
            {
                QueueItemId = Guid.NewGuid(),
                TicketNumber = "Y-99",
                RoomOrStation = "Station 9",
                DoctorName = "Dr. Old",
                CalledTime = DateTime.UtcNow.AddDays(-1)
            }
        };

        var board = new FacilityQueueBoard
        {
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            QueueDate = yesterdayManila,
            PatientsWaitingCount = 10,
            NowServingJson = JsonSerializer.Serialize(serving),
            UpNextJson = "[]"
        };
        _context.FacilityQueueBoards.Add(board);
        await _context.SaveChangesAsync();

        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("makati-med", "opd-queue", _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        // Stale yesterday tickets must be cleared
        Assert.Empty(response.Data.NowServing);
        Assert.Empty(response.Data.UpNext);
        Assert.Equal(0, response.Data.PatientsWaitingCount);
    }

    [Fact]
    public async Task GetQueueDisplay_QueryParameterFallback_ResolvesByClinicId()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var todayManila = DateOnly.FromDateTime(nowManila);

        var board = new FacilityQueueBoard
        {
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            QueueDate = todayManila,
            PatientsWaitingCount = 2,
            NowServingJson = "[]",
            UpNextJson = "[]"
        };
        _context.FacilityQueueBoards.Add(board);
        await _context.SaveChangesAsync();

        var result = await PublicQueueDisplayEndpoints.GetDisplayQueryAsync(null, null, _clinic.Id, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Equal(_clinic.Id, response.Data.ClinicId);
        Assert.Equal(2, response.Data.PatientsWaitingCount);
    }

    [Fact]
    public async Task GetQueueDisplay_UnknownClinic_Returns404NotFound()
    {
        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("unknown-tenant", "unknown-facility", _context);
        var notFound = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task GetQueueDisplay_UuidInSlug_Returns404NotFound()
    {
        // UUID as tenant slug cannot be resolved
        var result1 = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("476a9086-c0eb-4aef-8ec6-49bb1cfd17c6", "main", _context);
        var notFound1 = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result1);
        Assert.Equal(StatusCodes.Status404NotFound, notFound1.StatusCode);

        // UUID as facility slug cannot be resolved
        var result2 = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("nextstep", "476a9086-c0eb-4aef-8ec6-49bb1cfd17c6", _context);
        var notFound2 = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result2);
        Assert.Equal(StatusCodes.Status404NotFound, notFound2.StatusCode);
    }

    [Fact]
    public async Task GetQueueDisplay_WhenPinConfigured_NoPinOrWrongPin_ReturnsLockedData()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var todayManila = DateOnly.FromDateTime(nowManila);

        var serving = new List<QueueBoardServingItemDto>
        {
            new() { QueueItemId = Guid.NewGuid(), TicketNumber = "C-01", RoomOrStation = "Room 1" }
        };

        var board = new FacilityQueueBoard
        {
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            QueueDate = todayManila,
            PatientsWaitingCount = 1,
            TvDisplayPin = "7890",
            NowServingJson = JsonSerializer.Serialize(serving),
            UpNextJson = "[]"
        };
        _context.FacilityQueueBoards.Add(board);
        await _context.SaveChangesAsync();

        // 1. Leaked link without PIN
        var resultNoPin = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("makati-med", "opd-queue", _context, pin: null);
        var okNoPin = Assert.IsAssignableFrom<IValueHttpResult>(resultNoPin);
        var respNoPin = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okNoPin.Value);

        Assert.True(respNoPin.Succeeded);
        Assert.NotNull(respNoPin.Data);
        Assert.True(respNoPin.Data!.IsPinRequired);
        Assert.False(respNoPin.Data.IsPinValid);
        Assert.Empty(respNoPin.Data.NowServing);
        Assert.Empty(respNoPin.Data.UpNext);

        // 2. Wrong PIN
        var resultWrongPin = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("makati-med", "opd-queue", _context, pin: "1111");
        var okWrongPin = Assert.IsAssignableFrom<IValueHttpResult>(resultWrongPin);
        var respWrongPin = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okWrongPin.Value);

        Assert.NotNull(respWrongPin.Data);
        Assert.True(respWrongPin.Data!.IsPinRequired);
        Assert.False(respWrongPin.Data.IsPinValid);
        Assert.Empty(respWrongPin.Data.NowServing);

        // 3. Correct PIN
        var resultCorrect = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync("makati-med", "opd-queue", _context, pin: "7890");
        var okCorrect = Assert.IsAssignableFrom<IValueHttpResult>(resultCorrect);
        var respCorrect = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okCorrect.Value);

        Assert.NotNull(respCorrect.Data);
        Assert.True(respCorrect.Data!.IsPinRequired);
        Assert.True(respCorrect.Data.IsPinValid);
        Assert.Single(respCorrect.Data.NowServing);
        Assert.Equal("C-01", respCorrect.Data.NowServing[0].TicketNumber);
    }

    private static TimeZoneInfo ResolveManilaTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila"); } catch { }
        try { return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time"); } catch { }
        return TimeZoneInfo.CreateCustomTimeZone("Manila", TimeSpan.FromHours(8), "Manila Standard Time", "Manila Standard Time");
    }
}
