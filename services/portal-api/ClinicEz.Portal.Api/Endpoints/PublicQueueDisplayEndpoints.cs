using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record PublicQueueDisplayData(
    Guid ClinicId,
    string ClinicName,
    string? TenantSlug,
    string? FacilitySlug,
    IReadOnlyList<QueueBoardServingItemDto> NowServing,
    IReadOnlyList<QueueBoardUpcomingItemDto> UpNext,
    bool MaskPatientNames,
    DateTime GeneratedAtUtc,
    int PatientsWaitingCount,
    string? LogoUrl = null,
    bool IsPinRequired = false,
    bool IsPinValid = true
);

public sealed class PublicQueueDisplayEndpoints : IEndpoint
{
    public const string RateLimitPolicy = "PublicApi";
    private static readonly TimeZoneInfo ManilaTimeZone = ResolveManilaTimeZone();
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/public/queue/display/{tenantSlug}/{facilitySlug}", GetDisplayBySlugsAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicy)
            .WithTags("PublicQueueDisplay");

        app.MapGet("/public/queue/display", GetDisplayQueryAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicy)
            .WithTags("PublicQueueDisplay");
    }

    public static async Task<IResult> GetDisplayBySlugsAsync(
        string tenantSlug,
        string facilitySlug,
        IApplicationDbContext context,
        [Microsoft.AspNetCore.Mvc.FromQuery] string? pin = null,
        [Microsoft.AspNetCore.Mvc.FromHeader(Name = "X-Queue-Pin")] string? headerPin = null,
        CancellationToken ct = default)
    {
        var effectivePin = !string.IsNullOrWhiteSpace(headerPin) ? headerPin : pin;
        return await ResolveQueueBoardAsync(tenantSlug, facilitySlug, clinicId: null, effectivePin, context, ct);
    }

    public static async Task<IResult> GetDisplayQueryAsync(
        [Microsoft.AspNetCore.Mvc.FromQuery] string? tenantSlug,
        [Microsoft.AspNetCore.Mvc.FromQuery] string? facilitySlug,
        [Microsoft.AspNetCore.Mvc.FromQuery] Guid? clinicId,
        IApplicationDbContext context,
        [Microsoft.AspNetCore.Mvc.FromQuery] string? pin = null,
        [Microsoft.AspNetCore.Mvc.FromHeader(Name = "X-Queue-Pin")] string? headerPin = null,
        CancellationToken ct = default)
    {
        var effectivePin = !string.IsNullOrWhiteSpace(headerPin) ? headerPin : pin;
        return await ResolveQueueBoardAsync(tenantSlug, facilitySlug, clinicId, effectivePin, context, ct);
    }

    private static async Task<IResult> ResolveQueueBoardAsync(
        string? tenantSlug,
        string? facilitySlug,
        Guid? clinicId,
        string? pin,
        IApplicationDbContext context,
        CancellationToken ct)
    {
        // STRICT ENFORCEMENT: No UUIDs permitted in slug fields - cannot be resolved (404 Not Found)
        if ((!string.IsNullOrWhiteSpace(tenantSlug) && Guid.TryParse(tenantSlug, out _)) ||
            (!string.IsNullOrWhiteSpace(facilitySlug) && Guid.TryParse(facilitySlug, out _)))
        {
            return Results.NotFound(ApiResponse<PublicQueueDisplayData>.Fail(
                "Queue board not found or cannot be resolved.",
                "NOT_FOUND"));
        }
        Facility? facility = null;

        if (clinicId.HasValue && clinicId.Value != Guid.Empty)
        {
            facility = await context.Facilities.AsNoTracking()
                .Include(f => f.Tenant)
                .FirstOrDefaultAsync(f => f.Id == clinicId.Value && !f.IsDeleted, ct);
        }
        else if (!string.IsNullOrWhiteSpace(tenantSlug) && !string.IsNullOrWhiteSpace(facilitySlug))
        {
            var normTenant = tenantSlug.Trim().ToLowerInvariant();
            var normFacility = facilitySlug.Trim().ToLowerInvariant();

            var tenant = await context.Tenants.AsNoTracking()
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == normTenant && t.ArchivedAt == null, ct);

            if (tenant != null)
            {
                facility = await context.Facilities.AsNoTracking()
                    .Include(f => f.Tenant)
                    .FirstOrDefaultAsync(f => f.TenantId == tenant.Id && f.Slug.ToLower() == normFacility && !f.IsDeleted, ct);

                if (facility == null)
                {
                    // Fallback: If facilitySlug in URL was 'main' or mistyped, but the tenant has exactly one active facility
                    var singleTenantFacility = await context.Facilities.AsNoTracking()
                        .Include(f => f.Tenant)
                        .Where(f => f.TenantId == tenant.Id && !f.IsDeleted)
                        .Take(2)
                        .ToListAsync(ct);

                    if (singleTenantFacility.Count == 1)
                    {
                        facility = singleTenantFacility[0];
                    }
                }
            }
            else
            {
                // Fallback: If tenant slug has a minor discrepancy (e.g. nextstep vs nexstep), resolve facility by unique slug
                var matchedFacilities = await context.Facilities.AsNoTracking()
                    .Include(f => f.Tenant)
                    .Where(f => !f.IsDeleted && f.Tenant != null && f.Tenant.ArchivedAt == null && f.Slug.ToLower() == normFacility)
                    .Take(2)
                    .ToListAsync(ct);

                if (matchedFacilities.Count == 1)
                {
                    facility = matchedFacilities[0];
                }
            }
        }

        if (facility == null)
        {
            return Results.NotFound(ApiResponse<PublicQueueDisplayData>.Fail("Clinic not found for public TV display.", "NOT_FOUND"));
        }

        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ManilaTimeZone);
        var todayManila = DateOnly.FromDateTime(nowManila);

        FacilityQueueBoard? board = null;
        try
        {
            board = await context.FacilityQueueBoards.AsNoTracking()
                .FirstOrDefaultAsync(b => b.TenantId == facility.TenantId && b.FacilityId == facility.Id, ct);
        }
        catch (Exception)
        {
            // If the queue board projection table is temporarily unmigrated or unreadable, fall back gracefully
            board = null;
        }

        // Manila midnight invalidation: Stale yesterday tickets must never show
        if (board == null || board.QueueDate < todayManila)
        {
            var emptyData = new PublicQueueDisplayData(
                ClinicId: facility.Id,
                ClinicName: facility.Name,
                TenantSlug: facility.Tenant?.TenantSlug,
                FacilitySlug: facility.Slug,
                NowServing: Array.Empty<QueueBoardServingItemDto>(),
                UpNext: Array.Empty<QueueBoardUpcomingItemDto>(),
                MaskPatientNames: true,
                GeneratedAtUtc: DateTime.UtcNow,
                PatientsWaitingCount: 0,
                LogoUrl: null,
                IsPinRequired: false,
                IsPinValid: true
            );

            return Results.Ok(ApiResponse<PublicQueueDisplayData>.Success(emptyData));
        }

        bool isPinRequired = !string.IsNullOrWhiteSpace(board.TvDisplayPin);
        bool isPinValid = !isPinRequired || (!string.IsNullOrWhiteSpace(pin) && string.Equals(pin.Trim(), board.TvDisplayPin!.Trim(), StringComparison.OrdinalIgnoreCase));

        // When PIN is required and not yet supplied or invalid, strictly zero tickets are returned
        if (isPinRequired && !isPinValid)
        {
            var lockedData = new PublicQueueDisplayData(
                ClinicId: facility.Id,
                ClinicName: facility.Name,
                TenantSlug: facility.Tenant?.TenantSlug,
                FacilitySlug: facility.Slug,
                NowServing: Array.Empty<QueueBoardServingItemDto>(),
                UpNext: Array.Empty<QueueBoardUpcomingItemDto>(),
                MaskPatientNames: true,
                GeneratedAtUtc: DateTime.UtcNow,
                PatientsWaitingCount: 0,
                LogoUrl: null,
                IsPinRequired: true,
                IsPinValid: false
            );

            return Results.Ok(ApiResponse<PublicQueueDisplayData>.Success(lockedData));
        }

        var nowServing = DeserializeList<QueueBoardServingItemDto>(board.NowServingJson);
        var upNext = DeserializeList<QueueBoardUpcomingItemDto>(board.UpNextJson);

        // Strict Zero-PHI guarantee: Enforce displayName = null on all upcoming tickets
        var zeroPhiUpNext = upNext.Select(u => u with { DisplayName = null }).ToList();

        var displayData = new PublicQueueDisplayData(
            ClinicId: facility.Id,
            ClinicName: facility.Name,
            TenantSlug: facility.Tenant?.TenantSlug,
            FacilitySlug: facility.Slug,
            NowServing: nowServing,
            UpNext: zeroPhiUpNext,
            MaskPatientNames: true,
            GeneratedAtUtc: board.GeneratedAtUtc,
            PatientsWaitingCount: board.PatientsWaitingCount,
            LogoUrl: null,
            IsPinRequired: isPinRequired,
            IsPinValid: true
        );

        return Results.Ok(ApiResponse<PublicQueueDisplayData>.Success(displayData));
    }

    private static IReadOnlyList<T> DeserializeList<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Array.Empty<T>();
        try
        {
            return JsonSerializer.Deserialize<List<T>>(json, JsonOpts) ?? (IReadOnlyList<T>)Array.Empty<T>();
        }
        catch
        {
            return Array.Empty<T>();
        }
    }

    private static TimeZoneInfo ResolveManilaTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila"); } catch { }
        try { return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time"); } catch { }
        return TimeZoneInfo.CreateCustomTimeZone("Manila", TimeSpan.FromHours(8), "Manila Standard Time", "Manila Standard Time");
    }
}
