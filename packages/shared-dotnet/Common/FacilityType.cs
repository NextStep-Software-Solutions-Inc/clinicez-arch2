using System.Text.Json.Serialization;

namespace CLINICEZ.Shared.Common;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FacilityType
{
    Clinic,
    Organization,
    Laboratory,
    Pharmacy
}
