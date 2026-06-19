using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class PatientAddress : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public AddressType Type { get; set; }
    public string? HouseStreet { get; set; }   // house/unit no. + building
    public string? Barangay { get; set; }
    public string? CityMunicipality { get; set; }
    public string? Province { get; set; }
    public string? Region { get; set; }
    public string? ZipCode { get; set; }
    public string? Country { get; set; }
    public bool IsPrimary { get; set; }
}
