using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Interop.Domain.Entities;

/// <summary>A routing unit: the cloud shared cell, or one on-prem edge cell that owns N facilities.</summary>
public class HubCell
{
    public string CellId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public CellKind Kind { get; set; }
    /// <summary>Owning tenant for an edge cell; null for the cloud cell.</summary>
    public string? TenantId { get; set; }
    public bool Active { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public long Version { get; set; }
}

/// <summary>
/// A credential that may talk to the hub on behalf of one cell. Only a salted PBKDF2 hash of the secret is stored;
/// the secret itself is shown once at creation / rotation.
/// </summary>
public class HubClient
{
    public string ClientId { get; set; } = string.Empty;
    public string CellId { get; set; } = string.Empty;
    /// <summary>The mailbox service this client reads (clinic, laboratory, portal, ...).</summary>
    public string Service { get; set; } = string.Empty;
    public HubClientKind Kind { get; set; }
    /// <summary><c>pbkdf2-sha256$iterations$salt$hash</c>.</summary>
    public string SecretHash { get; set; } = string.Empty;
    /// <summary>
    /// ECDSA P-256 public key (PEM) whose private half the client signs its envelopes with. Null for a client that has no key yet
    /// (it can only send while <c>Hub:Signing:Required</c> is off).
    /// </summary>
    public string? PublicKeyPem { get; set; }
    public bool Revoked { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? SecretRotatedAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
}
