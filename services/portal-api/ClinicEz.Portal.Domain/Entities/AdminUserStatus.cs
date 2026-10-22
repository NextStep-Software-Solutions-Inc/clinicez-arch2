using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Portal.Domain.Entities;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum AdminUserStatus
{
    Invited,
    Active,
    Suspended,
    Revoked
}
