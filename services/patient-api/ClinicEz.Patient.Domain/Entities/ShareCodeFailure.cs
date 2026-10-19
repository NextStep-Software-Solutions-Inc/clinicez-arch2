using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>A wrong or unknown share code that a facility tried; the count of recent ones is what throttles code guessing.</summary>
public sealed class ShareCodeFailure : BaseEntity
{
    /// <summary>The patient the facility named, when that ClinicEzId exists.</summary>
    public Guid? PatientId { get; set; }

    /// <summary>Address of the facility that tried the code.</summary>
    public string Actor { get; set; } = string.Empty;
}
