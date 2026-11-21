using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Locations;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Infrastructure.Locations;

public sealed class PsgcLocationService : IPsgcLocationService
{
    private readonly ApplicationDbContext _db;

    public PsgcLocationService(ApplicationDbContext db)
    {
        _db = db;
    }

    private async Task<HashSet<string>?> GetInactiveOverridesAsync(CancellationToken ct)
    {
        var inactive = await _db.PsgcLocations
            .AsNoTracking()
            .Where(l => !l.IsActive)
            .Select(l => l.PsgcCode)
            .ToListAsync(ct);

        return inactive.Count > 0
            ? new HashSet<string>(inactive, StringComparer.Ordinal)
            : null;
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> GetRegionsAsync(CancellationToken ct = default)
    {
        var inactive = await GetInactiveOverridesAsync(ct);
        return PsgcReferenceCatalog.GetRegions()
            .Where(e => inactive is null || !inactive.Contains(e.PsgcCode))
            .Select(ToDto)
            .ToList();
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> GetProvincesAsync(string? regionPsgc = null, CancellationToken ct = default)
    {
        var inactive = await GetInactiveOverridesAsync(ct);
        return PsgcReferenceCatalog.GetProvinces(regionPsgc)
            .Where(e => inactive is null || !inactive.Contains(e.PsgcCode))
            .Select(ToDto)
            .ToList();
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> GetCitiesMunicipalitiesAsync(string? provincePsgc = null, string? regionPsgc = null, CancellationToken ct = default)
    {
        var inactive = await GetInactiveOverridesAsync(ct);
        return PsgcReferenceCatalog.GetCitiesMunicipalities(provincePsgc, regionPsgc)
            .Where(e => inactive is null || !inactive.Contains(e.PsgcCode))
            .Select(ToDto)
            .ToList();
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> GetBarangaysAsync(string cityMunicipalityPsgc, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(cityMunicipalityPsgc);
        var inactive = await GetInactiveOverridesAsync(ct);

        return PsgcReferenceCatalog.GetBarangays(cityMunicipalityPsgc)
            .Where(e => inactive is null || !inactive.Contains(e.PsgcCode))
            .Select(ToDto)
            .ToList();
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> SearchLocationsAsync(string query, int limit = 50, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Array.Empty<PsgcLocationDto>();
        }

        var clampedLimit = Math.Clamp(limit, 1, 200);
        var inactive = await GetInactiveOverridesAsync(ct);

        if (inactive is null)
        {
            return PsgcReferenceCatalog.Search(query, clampedLimit)
                .Select(ToDto)
                .ToList();
        }

        return PsgcReferenceCatalog.Search(query, 200)
            .Where(e => !inactive.Contains(e.PsgcCode))
            .Take(clampedLimit)
            .Select(ToDto)
            .ToList();
    }

    private static PsgcLocationDto ToDto(PsgcReferenceEntry entry) =>
        new(
            entry.PsgcCode,
            entry.Name,
            entry.LevelName,
            entry.ParentPsgcCode,
            entry.RegionPsgc,
            entry.ProvincePsgc,
            entry.CityMunicipalityPsgc,
            entry.ZipCode);
}
