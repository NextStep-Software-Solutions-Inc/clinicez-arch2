namespace PatientAppBE.Infrastructure.Services.Jobs.Processors;

/// <summary>
/// Represents the serialized state of a Patient entity as transmitted by the mobile client.
/// camelCase is used at the JSON level; deserialization is case-insensitive.
/// </summary>
public sealed class PatientSyncPayload
{
    public Guid ClientId { get; set; }
    public string? ClerkUserId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public string? Suffix { get; set; }
    public string? Sex { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? PlaceOfBirth { get; set; }
    public string? CivilStatus { get; set; }
    public string? BloodType { get; set; }
    public string? Nationality { get; set; }
    public string? Ethnicity { get; set; }
    public string? Religion { get; set; }
    public string? PrimaryLanguage { get; set; }
    public string? EducationLevel { get; set; }
    public string? Mobile { get; set; }
    public string? AltPhone { get; set; }
    public string? Email { get; set; }
    public string? MessengerHandle { get; set; }
    public bool ConsentToShareInfo { get; set; }

    /// <summary>UTC timestamp from the device — compared against the server's UpdatedAt for Last-Write-Wins.</summary>
    public DateTime UpdatedAt { get; set; }
}
