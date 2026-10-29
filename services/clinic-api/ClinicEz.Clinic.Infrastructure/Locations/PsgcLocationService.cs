using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Infrastructure.Locations;

public sealed class PsgcLocationService : IPsgcLocationService
{
    private readonly ApplicationDbContext _db;

    public PsgcLocationService(ApplicationDbContext db)
    {
        _db = db;
    }

    private async Task EnsureSeededAsync(CancellationToken ct)
    {
        if (!await _db.PsgcLocations.AnyAsync(ct))
        {
            var seedLocations = PsgcLocationTestSeed.GetLocations();
            await _db.PsgcLocations.AddRangeAsync(seedLocations, ct);
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> GetRegionsAsync(CancellationToken ct = default)
    {
        await EnsureSeededAsync(ct);
        return await _db.PsgcLocations
            .AsNoTracking()
            .Where(l => l.Level == PsgcLevel.Region && l.IsActive)
            .OrderBy(l => l.PsgcCode)
            .Select(l => ToDto(l))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> GetProvincesAsync(string? regionPsgc = null, CancellationToken ct = default)
    {
        await EnsureSeededAsync(ct);
        var query = _db.PsgcLocations
            .AsNoTracking()
            .Where(l => l.Level == PsgcLevel.Province && l.IsActive);

        if (!string.IsNullOrWhiteSpace(regionPsgc))
        {
            query = query.Where(l => l.RegionPsgc == regionPsgc || l.ParentPsgcCode == regionPsgc);
        }

        return await query
            .OrderBy(l => l.Name)
            .Select(l => ToDto(l))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> GetCitiesMunicipalitiesAsync(string? provincePsgc = null, string? regionPsgc = null, CancellationToken ct = default)
    {
        await EnsureSeededAsync(ct);
        var query = _db.PsgcLocations
            .AsNoTracking()
            .Where(l => l.Level == PsgcLevel.CityMunicipality && l.IsActive);

        if (!string.IsNullOrWhiteSpace(provincePsgc))
        {
            query = query.Where(l => l.ProvincePsgc == provincePsgc || l.ParentPsgcCode == provincePsgc);
        }
        else if (!string.IsNullOrWhiteSpace(regionPsgc))
        {
            query = query.Where(l => l.RegionPsgc == regionPsgc);
        }

        return await query
            .OrderBy(l => l.Name)
            .Select(l => ToDto(l))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> GetBarangaysAsync(string cityMunicipalityPsgc, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(cityMunicipalityPsgc);
        await EnsureSeededAsync(ct);

        return await _db.PsgcLocations
            .AsNoTracking()
            .Where(l => l.Level == PsgcLevel.Barangay && l.IsActive &&
                        (l.CityMunicipalityPsgc == cityMunicipalityPsgc || l.ParentPsgcCode == cityMunicipalityPsgc))
            .OrderBy(l => l.Name)
            .Select(l => ToDto(l))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<PsgcLocationDto>> SearchLocationsAsync(string query, int limit = 50, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
            return Array.Empty<PsgcLocationDto>();

        await EnsureSeededAsync(ct);
        var term = query.Trim().ToLower();

        return await _db.PsgcLocations
            .AsNoTracking()
            .Where(l => l.IsActive && (l.Name.ToLower().Contains(term) || l.PsgcCode.StartsWith(term)))
            .OrderBy(l => l.Level)
            .ThenBy(l => l.Name)
            .Take(Math.Clamp(limit, 1, 200))
            .Select(l => ToDto(l))
            .ToListAsync(ct);
    }

    private static PsgcLocationDto ToDto(PsgcLocation entity) =>
        new(
            entity.PsgcCode,
            entity.Name,
            entity.Level.ToString(),
            entity.ParentPsgcCode,
            entity.RegionPsgc,
            entity.ProvincePsgc,
            entity.CityMunicipalityPsgc,
            entity.ZipCode);
}
