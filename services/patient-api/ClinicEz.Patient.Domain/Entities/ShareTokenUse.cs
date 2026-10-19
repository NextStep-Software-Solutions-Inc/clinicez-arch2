using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// One redemption of a share token or code. A token may be redeemed up to its maximum number of times; each use takes the
/// next <see cref="Sequence"/> number, so two concurrent redemptions can never both take the last slot.
/// </summary>
public sealed class ShareTokenUse : BaseEntity
{
    public string TokenId { get; set; } = string.Empty;
    public Guid PatientId { get; set; }
    public Guid GrantId { get; set; }

    /// <summary>The facility that redeemed the token; a repeat redemption by the same facility refreshes its existing grant.</summary>
    public Guid FacilityId { get; set; }

    /// <summary>1-based position of this redemption among the token's redemptions.</summary>
    public int Sequence { get; set; }

    /// <summary>Interop message that redeemed the token; lets a redelivery of that same message be answered again.</summary>
    public Guid MessageId { get; set; }
}