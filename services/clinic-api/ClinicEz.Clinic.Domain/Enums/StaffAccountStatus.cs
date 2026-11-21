using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Domain.Enums;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum StaffAccountStatus
{
    Invited = 1,
    Active = 2,
    Suspended = 3,
    Revoked = 4
}
