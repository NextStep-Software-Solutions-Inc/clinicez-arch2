using PatientAppBE.Domain.Common;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Domain.Entities;

public sealed class PatientTravelHistory : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string Destination { get; set; } = string.Empty;
    public string? CityProvince { get; set; }
    public DateOnly? DepartureDate { get; set; }
    public DateOnly? ReturnDate { get; set; }
    public TravelPurpose? Purpose { get; set; }
    public string? IllnessDuringAfterTravel { get; set; }
}
