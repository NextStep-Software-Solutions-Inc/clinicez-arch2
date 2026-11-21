using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Locations;

namespace ClinicEz.Clinic.Infrastructure.Locations;

/// <summary>
/// Projects the shared Philippine PSGC catalog into domain PsgcLocation entities.
/// </summary>
public static class PsgcLocationTestSeed
{
    public static IReadOnlyList<PsgcLocation> GetLocations() =>
        PsgcReferenceCatalog.AllEntries
            .Select(e => new PsgcLocation
            {
                Id = Guid.NewGuid(),
                PsgcCode = e.PsgcCode,
                Name = e.Name,
                Level = e.Level switch
                {
                    PsgcReferenceLevel.Region => PsgcLevel.Region,
                    PsgcReferenceLevel.Province => PsgcLevel.Province,
                    PsgcReferenceLevel.CityMunicipality => PsgcLevel.CityMunicipality,
                    _ => PsgcLevel.Barangay
                },
                ParentPsgcCode = e.ParentPsgcCode,
                RegionPsgc = e.RegionPsgc,
                ProvincePsgc = e.ProvincePsgc,
                CityMunicipalityPsgc = e.CityMunicipalityPsgc,
                ZipCode = e.ZipCode,
                IsActive = true
            })
            .ToList();
}
