namespace ClinicEz.PhilHealthProxy.Domain.Entities;

public sealed class PhilHealthTenant
{
    public Guid Id { get; init; } = Guid.NewGuid();

    /// <summary>External tenant identifier (Organization / Workspace).</summary>
    public Guid TenantId { get; init; }

    /// <summary>Branch identifier when configured per clinic branch; null for organization default.</summary>
    public Guid? BranchId { get; set; }

    public string FacilityName { get; set; } = string.Empty;

    /// <summary>PhilHealth accreditation number (exactly 9 characters, e.g. H10000001).</summary>
    public string AccreditationNumber { get; set; } = string.Empty;

    /// <summary>PMCC number issued by PhilHealth (e.g. Z15445).</summary>
    public string PmccNumber { get; set; } = string.Empty;

    /// <summary>Software certificate ID issued to Service Provider (e.g. KON-DUMMYCERTS-Z15445).</summary>
    public string SoftwareCertificateId { get; set; } = string.Empty;

    /// <summary>Encrypted PCAPI Secret Key (used for POST /api/v1/auth/token).</summary>
    public string EncryptedSecretKey { get; set; } = string.Empty;

    /// <summary>Encrypted PCAPI Cipher Key (used for Annex C payload AES-256-CBC encryption).</summary>
    public string EncryptedCipherKey { get; set; } = string.Empty;

    /// <summary>Base URL for the PCAPI environment (default: https://pcapi.philhealth.gov.ph).</summary>
    public string BaseUrl { get; set; } = "https://pcapi.philhealth.gov.ph";

    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? UpdatedAt { get; set; }
}
