using System.Text.Json.Serialization;

namespace ClinicEz.Shared.Licensing;

/// <summary>
/// Strongly-typed facility resource and operational limits rooted cryptographically at license activation.
/// These limits cannot be modified on-premise without a newly signed license key from the authority.
/// Additional properties can be introduced as the system grows.
/// </summary>
public record FacilityLimits
{
    [JsonPropertyName("maxStaff")]
    public int MaxStaff { get; init; } = 5;

    [JsonPropertyName("maxBeds")]
    public int MaxBeds { get; init; } = 0;

    [JsonPropertyName("maxAnalyzers")]
    public int MaxAnalyzers { get; init; } = 1;

    [JsonPropertyName("maxMonthlyConsultations")]
    public int MaxMonthlyConsultations { get; init; } = 500;

    [JsonPropertyName("maxStorageMb")]
    public int MaxStorageMb { get; init; } = 5120;

    [JsonPropertyName("concurrentTerminals")]
    public int ConcurrentTerminals { get; init; } = 2;
}
