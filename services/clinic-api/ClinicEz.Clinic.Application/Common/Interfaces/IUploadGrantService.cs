using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>The one-time plaintext of a freshly minted grant. Only its hash is stored, so it can never be shown again.</summary>
public sealed record MintedUploadGrant(string Token, string Url, DateTime ExpiresAt);

/// <summary>A resolved grant with the order it belongs to and what the public upload page may show about it.</summary>
public sealed record UploadGrantContext(UploadGrant Grant, ClinicLabOrder Order, ClinicSettings? Clinic, ClinicPatient? Patient)
{
    public bool IsUsable(DateTime utcNow) =>
        Grant.RevokedAt == null && Grant.ExpiresAt > utcNow && Grant.Used < Grant.MaxUploads;
}

/// <summary>
/// Issues and validates the capability that lets an external lab or the patient upload a result for one lab order
/// (hardened replacement for the old guessable per-order token): 128-bit random, SHA-256 hashed at rest, expiring and
/// use-limited. Tokens look like <c>{clinicId:N}.{random}</c> so the owning clinic is known without a lookup.
/// </summary>
public interface IUploadGrantService
{
    /// <summary>
    /// Adds a new grant to the current unit of work (the caller saves) and revokes the order's earlier unused grants of
    /// the same kind. Throws when <c>Clinic:PublicUploadBaseUrl</c> is not configured.
    /// </summary>
    Task<MintedUploadGrant> MintAsync(ClinicLabOrder order, UploaderKind kind, CancellationToken ct);

    /// <summary>Null when the token is malformed, unknown or revoked; expiry and exhaustion are reported by <see cref="UploadGrantContext.IsUsable"/>.</summary>
    Task<UploadGrantContext?> ResolveAsync(string token, CancellationToken ct);
}
