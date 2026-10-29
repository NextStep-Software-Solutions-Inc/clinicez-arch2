using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientSexualHistory : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string ConsentStatusCode { get; set; } = "01";
    public bool EverHadSex { get; set; } = false;
    public int? AgeAtFirstSexualContact { get; set; }
    public bool IsSexuallyActive { get; set; } = false;
    public int? PartnerCountLastYear { get; set; }
    public string? PartnerTypes { get; set; }

    public bool? HasMalePartnerActivity { get; set; }
    public string? MalePartnerRecentAnalNeovagYm { get; set; }
    public string? MalePartnerRecentCondomlessYm { get; set; }

    public bool? HasFemalePartnerActivity { get; set; }
    public string? FemalePartnerRecentAnalNeovagYm { get; set; }
    public string? FemalePartnerRecentCondomlessYm { get; set; }

    public string? SexualRiskBehaviorCodes { get; set; }
    public string? RecentRiskMonthYear { get; set; }
    public string? OtherRiskConcernsSpec { get; set; }

    public bool? HasStiHistory { get; set; }
    public string? StiSpecification { get; set; }
    public string? LastHivScreenMonthYear { get; set; }

    public string? SexualPractices { get; set; }
    public string? ContraceptiveMethodsUsed { get; set; }
    public string? SexualViolenceHistory { get; set; }
}
