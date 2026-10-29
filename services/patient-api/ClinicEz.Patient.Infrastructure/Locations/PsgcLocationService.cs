using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Locations;

public sealed class PsgcLocationService : IPsgcLocationService
{
    public Task<IReadOnlyList<PsgcLocationDto>> GetRegionsAsync(CancellationToken ct = default)
    {
        var regions = PsgcLocationReferenceData.AllLocations
            .Where(l => l.Level == "Region")
            .OrderBy(l => l.PsgcCode)
            .ToList();

        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(regions);
    }

    public Task<IReadOnlyList<PsgcLocationDto>> GetProvincesAsync(string? regionPsgc = null, CancellationToken ct = default)
    {
        var query = PsgcLocationReferenceData.AllLocations
            .Where(l => l.Level == "Province");

        if (!string.IsNullOrWhiteSpace(regionPsgc))
        {
            query = query.Where(l => l.RegionPsgc == regionPsgc || l.ParentPsgcCode == regionPsgc);
        }

        var provinces = query
            .OrderBy(l => l.Name)
            .ToList();

        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(provinces);
    }

    public Task<IReadOnlyList<PsgcLocationDto>> GetCitiesMunicipalitiesAsync(string? provincePsgc = null, string? regionPsgc = null, CancellationToken ct = default)
    {
        var query = PsgcLocationReferenceData.AllLocations
            .Where(l => l.Level == "CityMunicipality");

        if (!string.IsNullOrWhiteSpace(provincePsgc))
        {
            query = query.Where(l => l.ProvincePsgc == provincePsgc || l.ParentPsgcCode == provincePsgc);
        }
        else if (!string.IsNullOrWhiteSpace(regionPsgc))
        {
            query = query.Where(l => l.RegionPsgc == regionPsgc);
        }

        var cities = query
            .OrderBy(l => l.Name)
            .ToList();

        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(cities);
    }

    public Task<IReadOnlyList<PsgcLocationDto>> GetBarangaysAsync(string cityMunicipalityPsgc, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cityMunicipalityPsgc))
        {
            throw new ArgumentException("City / Municipality PSGC code is required.", nameof(cityMunicipalityPsgc));
        }

        var barangays = PsgcLocationReferenceData.AllLocations
            .Where(l => l.Level == "Barangay" &&
                        (l.CityMunicipalityPsgc == cityMunicipalityPsgc || l.ParentPsgcCode == cityMunicipalityPsgc))
            .OrderBy(l => l.Name)
            .ToList();

        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(barangays);
    }

    public Task<IReadOnlyList<PsgcLocationDto>> SearchLocationsAsync(string query, int limit = 50, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Task.FromResult<IReadOnlyList<PsgcLocationDto>>([]);
        }

        var term = query.Trim();
        var results = PsgcLocationReferenceData.AllLocations
            .Where(l => l.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                        l.PsgcCode.StartsWith(term, StringComparison.OrdinalIgnoreCase))
            .OrderBy(l => l.Level)
            .ThenBy(l => l.Name)
            .Take(Math.Clamp(limit, 1, 200))
            .ToList();

        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(results);
    }
}
