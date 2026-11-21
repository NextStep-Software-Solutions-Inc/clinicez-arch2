using System.Collections.Generic;
using System.Linq;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Shared.Locations;

namespace ClinicEz.Patient.Infrastructure.Locations;

public static class PsgcLocationReferenceData
{
    private static readonly IReadOnlyList<PsgcLocationDto> _locations =
        PsgcReferenceCatalog.AllEntries
            .Select(ToDto)
            .ToArray();

    public static IReadOnlyList<PsgcLocationDto> AllLocations => _locations;

    internal static PsgcLocationDto ToDto(PsgcReferenceEntry entry) =>
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
