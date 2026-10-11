using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Domain.Enums;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum StaffRole
{
    Doctor = 1,
    Nurse = 2,
    Receptionist = 3,
    Admin = 4,
    Cashier = 5
}
