namespace CLINICEZ.PhilHealth.Proxy.Configuration;

public sealed class PhilHealthSettings
{
    public const string SectionName = "PhilHealth";

    /// <summary>Base URL for the PhilHealth Konsulta SOAP service.</summary>
    public string ServiceUrl { get; init; } = string.Empty;

    /// <summary>Username credential for PhilHealth Konsulta.</summary>
    public string Username { get; init; } = string.Empty;

    /// <summary>Password credential for PhilHealth Konsulta.</summary>
    public string Password { get; init; } = string.Empty;

    /// <summary>Request timeout in seconds (default: 30).</summary>
    public int TimeoutSeconds { get; init; } = 30;

    /// <summary>Facility / Hospital Accreditation Number.</summary>
    public string FacilityAccreditationNumber { get; init; } = string.Empty;
}
