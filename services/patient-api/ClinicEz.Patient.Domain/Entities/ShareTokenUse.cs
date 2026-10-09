using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>Records that a share token (by its unique id) was redeemed, which is what makes a token single-use.</summary>
public sealed class ShareTokenUse : BaseEntity
{
    public string TokenId { get; set; } = string.Empty;
    public Guid PatientId { get; set; }
    public Guid GrantId { get; set; }

    /// <summary>Interop message that redeemed the token; lets a redelivery of that same message be answered again.</summary>
    public Guid MessageId { get; set; }
}