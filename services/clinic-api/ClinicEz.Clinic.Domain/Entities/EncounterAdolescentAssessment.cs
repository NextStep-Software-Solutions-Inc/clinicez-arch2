using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class EncounterAdolescentAssessment : ClinicScopedEntity
{
    public Guid ConsultationEncounterId { get; set; }
    public ConsultationEncounter ConsultationEncounter { get; set; } = null!;

    // Tanner Sexual Maturity Rating (SMR)
    public bool SmrAssessed { get; set; } = false;
    public int? PubicHairStage { get; set; }
    public int? BreastStage { get; set; }
    public int? GenitalStage { get; set; }
    public string? SmrResultCode { get; set; }

    // Rapid HEADSSS
    public bool RapidHeadsssAssentConsent { get; set; } = true;

    public string? EducationEmploymentCode { get; set; }
    public string? RelationshipStatusCode { get; set; }
    public string? LivingArrangementCode { get; set; }
    public string? LivingArrangementOtherSpec { get; set; }

    public bool? Q01HomeViolenceOrConflict { get; set; }
    public bool? Q02SchoolOrWorkProblems { get; set; }
    public bool? Q03BodyImageOrEatingDistress { get; set; }
    public bool? Q04LackOfFriendsOrActivities { get; set; }
    public bool? Q05TobaccoAlcoholDrugUse { get; set; }
    public bool? Q06SexuallyActiveUnsafeSex { get; set; }
    public bool? Q07DepressionOrSadness { get; set; }
    public bool? Q08SuicidalThoughtsOrSelfHarm { get; set; }
    public bool? Q09BullyingOrCyberbullying { get; set; }
    public bool? Q10PhysicalOrSexualAbuse { get; set; }
    public bool? Q11DangerousBehaviorsOrWeapons { get; set; }
    public bool? Q12RequestsConfidentialCounseling { get; set; }

    public bool ProceedToFullHeadsss { get; set; } = false;
    public string? Remarks { get; set; }
}
