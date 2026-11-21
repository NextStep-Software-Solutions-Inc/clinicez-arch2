using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

public sealed record PsgcLocationDto(
    string PsgcCode,
    string Name,
    string Level,
    string? ParentPsgcCode,
    string? RegionPsgc,
    string? ProvincePsgc,
    string? CityMunicipalityPsgc,
    string? ZipCode);

public interface IPsgcLocationService
{
    Task<IReadOnlyList<PsgcLocationDto>> GetRegionsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<PsgcLocationDto>> GetProvincesAsync(string? regionPsgc = null, CancellationToken ct = default);
    Task<IReadOnlyList<PsgcLocationDto>> GetCitiesMunicipalitiesAsync(string? provincePsgc = null, string? regionPsgc = null, CancellationToken ct = default);
    Task<IReadOnlyList<PsgcLocationDto>> GetBarangaysAsync(string cityMunicipalityPsgc, CancellationToken ct = default);
    Task<IReadOnlyList<PsgcLocationDto>> SearchLocationsAsync(string query, int limit = 50, CancellationToken ct = default);
}
