using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// The patient's consent record: which facility may see which categories of their data, for what purpose and until when.
/// Revoking stops future fetches only; whatever the facility already imported into its own chart stays there.
/// </summary>
public sealed class PatientAccessGrant : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string TenantId { get; set; } = string.Empty;
    public Guid FacilityId { get; set; }

    /// <summary>Bit mask of the shared scopes (the contract's <c>SharingScopes</c> flags).</summary>
    public int ScopesMask { get; set; }
    public string Purpose { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public AccessGrantSource Source { get; set; }

    /// <summary>Booking draft the grant was created for, when <see cref="Source"/> is Booking.</summary>
    public Guid? DraftId { get; set; }

    public bool IsActiveAt(DateTime utcNow) => RevokedAt is null && ExpiresAt > utcNow;
}