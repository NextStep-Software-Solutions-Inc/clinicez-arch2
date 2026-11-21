using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientAddress : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public AddressType Type { get; set; }
    public bool IsPrimary { get; set; }
    public bool IsSameAsPermanent { get; set; } = false;

    // Detailed Street & House
    public string? HouseStreet { get; set; }   // house/unit no. + building
    public string? StreetAddress { get; set; } // street address line alias for contract parity

    // Descriptive Names
    public string? Barangay { get; set; }
    public string? CityMunicipality { get; set; }
    public string? Province { get; set; }
    public string? Region { get; set; }
    public string? ZipCode { get; set; }
    public string? Country { get; set; }

    // 10-Digit PSGC Hierarchy (Philippine Standard Geographic Code)
    public string? RegionPsgc { get; set; }
    public string? ProvincePsgc { get; set; }
    public string? CityMunicipalityPsgc { get; set; }
    public string? BarangayPsgc { get; set; }

    // Canonical Descriptive Names (matching PatientJoinContracts & clinic-api)
    public string? RegionName { get; set; }
    public string? ProvinceName { get; set; }
    public string? CityMunicipalityName { get; set; }
    public string? BarangayName { get; set; }
}
