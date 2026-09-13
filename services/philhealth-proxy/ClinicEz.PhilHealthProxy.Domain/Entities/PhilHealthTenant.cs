namespace ClinicEz.PhilHealthProxy.Domain.Entities;

public sealed class PhilHealthTenant
{
    public Guid Id { get; init; } = Guid.NewGuid();

    /// <summary>External tenant identifier — links to the clinic in the broader system.</summary>
    public Guid TenantId { get; init; }

    public string FacilityName { get; set; } = string.Empty;

    /// <summary>PhilHealth accreditation number — used as pHospitalCode in SOAP requests.</summary>
    public string AccreditationNumber { get; set; } = string.Empty;

    /// <summary>PMCC number issued by PhilHealth (e.g., Z15445).</summary>
    public string PmccNumber { get; set; } = string.Empty;

    /// <summary>Software certificate ID issued by PhilHealth (e.g., KON-DUMMYCERTS-Z15445).</summary>
    public string SoftwareCertificateId { get; set; } = string.Empty;

    /// <summary>Encrypted SOAP pUsername credential.</summary>
    public string EncryptedUsername { get; set; } = string.Empty;

    /// <summary>Encrypted SOAP pUserPassword credential.</summary>
    public string EncryptedPassword { get; set; } = string.Empty;

    /// <summary>Encrypted cipher key used for field-level payload encryption.</summary>
    public string EncryptedCipherKey { get; set; } = string.Empty;

    /// <summary>PhilHealth Konsulta SOAP endpoint URL for this tenant.</summary>
    public string KonsultaEndpoint { get; set; } = "https://staging.philhealth.gov.ph/KONSULTA/SOAP";

    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? UpdatedAt { get; set; }
}
