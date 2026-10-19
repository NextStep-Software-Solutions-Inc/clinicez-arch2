using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// A short, human-typable, single-use code the patient reads out so a facility can redeem a share without scanning a QR.
/// Only a keyed hash of the code is stored. Redemption is recorded as a <see cref="ShareTokenUse"/> under <see cref="TokenId"/>.
/// </summary>
public sealed class ShareCode : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    /// <summary>Identifier under which the code's single redemption is registered; shares the token-use register with QR tokens.</summary>
    public string TokenId { get; set; } = string.Empty;

    public string CodeHash { get; set; } = string.Empty;
    public AccessScopes Scopes { get; set; }
    public string Purpose { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
}
