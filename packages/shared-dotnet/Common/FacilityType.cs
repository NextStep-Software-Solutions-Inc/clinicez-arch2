using System.Text.Json.Serialization;

namespace ClinicEz.Shared.Common;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FacilityType
{
    Clinic,
    Organization,
    Laboratory,
    Pharmacy
}
