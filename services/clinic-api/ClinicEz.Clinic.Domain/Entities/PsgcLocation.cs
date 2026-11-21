using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public enum PsgcLevel
{
    Region = 1,
    Province = 2,
    CityMunicipality = 3,
    Barangay = 4
}

/// <summary>
/// Reference entity representing a Philippine Standard Geographic Code (PSGC) 10-digit location entry.
/// Part of Tier B Global Catalogs (shared across all clinics on the server).
/// </summary>
public sealed class PsgcLocation : BaseEntity
{
    public required string PsgcCode { get; set; }
    public required string Name { get; set; }
    public PsgcLevel Level { get; set; }
    public string? ParentPsgcCode { get; set; }
    public string? RegionPsgc { get; set; }
    public string? ProvincePsgc { get; set; }
    public string? CityMunicipalityPsgc { get; set; }
    public string? ZipCode { get; set; }
    public bool IsActive { get; set; } = true;
}
