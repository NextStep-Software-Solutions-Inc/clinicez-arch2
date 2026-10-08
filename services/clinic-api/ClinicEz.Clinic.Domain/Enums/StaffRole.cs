using System.Text.Json.Serialization;

namespace ClinicEz.Clinic.Domain.Enums;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum StaffRole
{
    Doctor = 1,
    Nurse = 2,
    Receptionist = 3,
    Admin = 4,
    Cashier = 5
}
