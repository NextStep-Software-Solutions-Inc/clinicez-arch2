using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Locations;

namespace ClinicEz.Portal.Infrastructure.Locations;

public sealed class PsgcLocationService : IPsgcLocationService
{
    public Task<IReadOnlyList<PsgcLocationDto>> GetRegionsAsync(CancellationToken ct = default)
    {
        var regions = PsgcReferenceCatalog.GetRegions()
            .Select(PsgcLocationReferenceData.ToDto)
            .ToList();
        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(regions);
    }

    public Task<IReadOnlyList<PsgcLocationDto>> GetProvincesAsync(string? regionPsgc = null, CancellationToken ct = default)
    {
        var provinces = PsgcReferenceCatalog.GetProvinces(regionPsgc)
            .Select(PsgcLocationReferenceData.ToDto)
            .ToList();
        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(provinces);
    }

    public Task<IReadOnlyList<PsgcLocationDto>> GetCitiesMunicipalitiesAsync(string? provincePsgc = null, string? regionPsgc = null, CancellationToken ct = default)
    {
        var cities = PsgcReferenceCatalog.GetCitiesMunicipalities(provincePsgc, regionPsgc)
            .Select(PsgcLocationReferenceData.ToDto)
            .ToList();
        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(cities);
    }

    public Task<IReadOnlyList<PsgcLocationDto>> GetBarangaysAsync(string cityMunicipalityPsgc, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cityMunicipalityPsgc))
        {
            throw new ArgumentException("City / Municipality PSGC code is required.", nameof(cityMunicipalityPsgc));
        }

        var barangays = PsgcReferenceCatalog.GetBarangays(cityMunicipalityPsgc)
            .Select(PsgcLocationReferenceData.ToDto)
            .ToList();
        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(barangays);
    }

    public Task<IReadOnlyList<PsgcLocationDto>> SearchLocationsAsync(string query, int limit = 50, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Task.FromResult<IReadOnlyList<PsgcLocationDto>>([]);
        }

        var results = PsgcReferenceCatalog.Search(query, limit)
            .Select(PsgcLocationReferenceData.ToDto)
            .ToList();
        return Task.FromResult<IReadOnlyList<PsgcLocationDto>>(results);
    }
}
