using System;
using System.ComponentModel.DataAnnotations.Schema;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class NcdRiskAssessment : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    public DateTime AssessmentDate { get; set; } = DateTime.UtcNow;

    [NotMapped]
    public DateTime AssessmentDateUtc
    {
        get => AssessmentDate;
        set => AssessmentDate = value;
    }

    public Guid? AssessedByStaffId { get; set; }
    public string? AssessedByStaffName { get; set; }

    // Nutrition & Behavioral (Q1 - Q4)
    public bool EatsProcessedFoodWeekly { get; set; } // Q1
    public bool ThreeServingsVegetablesDaily { get; set; } // Q2
    public bool TwoToThreeServingsFruitDaily { get; set; } // Q3
    public bool PhysicalActivityAtLeast150MinsWeekly { get; set; } // Q4

    // Diabetes Screening (Q5 - Q8, Q18 - Q19)
    public string DiagnosedDiabetes { get; set; } = "N"; // Q5: "Y", "N", "X"
    public bool HasPolyphagia { get; set; } // Q6
    public bool HasPolydipsia { get; set; } // Q7
    public bool HasPolyuria { get; set; } // Q8
    public string? DiabetesMedicationStatus { get; set; } // Q18: "Y", "N"
    public bool HasRaisedBloodGlucose { get; set; } // Q19
    public decimal? FastingBloodSugarMgDl { get; set; }
    public decimal? FastingBloodSugarMmolL { get; set; }
    public DateOnly? FastingBloodSugarDate { get; set; }

    // Cardiovascular Screening (Q9 - Q16, Q20, Q23 - Q24)
    public bool HasChestPain { get; set; } // Q9
    public bool PainInCenterOfChestOrLeftArm { get; set; } // Q10
    public bool PainWhenWalkingUphill { get; set; } // Q11
    public bool SlowsDownWhenPainOccurs { get; set; } // Q12
    public bool PainRelievedWithin10Mins { get; set; } // Q13
    public bool PainRelievedByNitrates { get; set; } // Q14
    public bool PainRelievedWithin10MinsOrNitrates { get; set; } // Q13 & Q14
    public bool SevereChestPainOver30Mins { get; set; } // Q15
    public bool TransientNeurologicalDeficits { get; set; } // Q16
    public bool HasRaisedBloodLipids { get; set; } // Q20
    public decimal? TotalCholesterolMgDl { get; set; }
    public DateOnly? TotalCholesterolDate { get; set; }
    public bool HasHistoryAnginaHeartAttack { get; set; } // Q23
    public bool HasHistoryStrokeOrTia { get; set; } // Q24

    // Urinalysis Biomarkers (Q21 - Q22)
    public bool UrineKetonesPresent { get; set; } // Q21
    public string? UrineKetonesValue { get; set; }
    public DateOnly? UrineKetonesDate { get; set; }
    public bool UrineProteinPresent { get; set; } // Q22
    public string? UrineProteinValue { get; set; }
    public DateOnly? UrineProteinDate { get; set; }

    // WHO / ISH Cardiovascular Risk Band (Q17: Band A to Band E)
    public string RiskBand { get; set; } = "BandA";

    [NotMapped]
    public string RiskLevelLetter
    {
        get => RiskBand.Replace("Band", "");
        set => RiskBand = value.StartsWith("Band", StringComparison.OrdinalIgnoreCase) ? value : $"Band{value}";
    }

    public decimal? CalculatedRiskScorePercent { get; set; }

    public string? Remarks { get; set; }

    public string? VoidReason { get; set; }
}
