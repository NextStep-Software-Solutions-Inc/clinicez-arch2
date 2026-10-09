using System.Text.Json.Serialization;

namespace ClinicEz.Shared.Common;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum FacilityType
{
    Clinic,
    Organization,
    Laboratory,
    Pharmacy
}
