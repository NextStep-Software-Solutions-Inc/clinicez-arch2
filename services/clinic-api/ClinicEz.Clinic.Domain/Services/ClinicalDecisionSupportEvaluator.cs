using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using System;
using System.Collections.Generic;
using System.Linq;

namespace ClinicEz.Clinic.Domain.Services;

public enum CdsAlertSeverity
{
    Information,
    Moderate,
    Major,
    Critical
}

public enum CdsAlertType
{
    DrugAllergy,
    CrossReactivity,
    DrugDrugInteraction,
    DrugDiseaseInteraction,
    RenalDoseAdjustment,
    LabValueWarning
}

public record CdsAlert
{
    public required string AlertId { get; init; }
    public required CdsAlertType Type { get; init; }
    public required CdsAlertSeverity Severity { get; init; }
    public required string Title { get; init; }
    public required string ClinicalMechanism { get; init; }
    public required string Recommendation { get; init; }
    public required string OffendingDrug { get; init; }
    public string? InteractingDrug { get; init; }
    public bool RequiresOverrideReason { get; init; }
    public bool IsHardStop { get; init; } = false;
    public string? RuleType { get; init; }
}

public record PrescriptionCandidate
{
    public required string GenericName { get; init; }
    public string? BrandName { get; init; }
    public string? Dosage { get; init; }
}

public static class ClinicalDecisionSupportEvaluator
{
    // Drug classes dictionary for taxonomy grouping
    private static readonly Dictionary<string, string[]> DrugClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Penicillin"] = new[]
        {
            "Amoxicillin", "Ampicillin", "Co-Amoxiclav", "Augmentin", "Penicillin", "Piperacillin", "Oxacillin", "Cloxacillin", "Amoxil"
        },
        ["Cephalosporin"] = new[]
        {
            "Cephalexin", "Cefalexin", "Cefuroxime", "Ceftriaxone", "Cefixime", "Cefotaxime", "Cefazolin", "Cefepime"
        },
        ["Sulfa"] = new[]
        {
            "Co-Trimoxazole", "Trimethoprim-Sulfamethoxazole", "Bactrim", "Sulfadiazine", "Silver Sulfadiazine", "Sulfasalazine"
        },
        ["NSAID"] = new[]
        {
            "Aspirin", "Ibuprofen", "Mefenamic Acid", "Naproxen", "Ketorolac", "Celecoxib", "Meloxicam", "Diclofenac", "Indomethacin", "Piroxicam"
        },
        ["Macrolide"] = new[]
        {
            "Azithromycin", "Clarithromycin", "Erythromycin", "Roxithromycin"
        },
        ["Fluoroquinolone"] = new[]
        {
            "Ciprofloxacin", "Levofloxacin", "Moxifloxacin", "Ofloxacin"
        },
        ["Statin"] = new[]
        {
            "Simvastatin", "Atorvastatin", "Lovastatin", "Rosuvastatin", "Pravastatin"
        },
        ["AceInhibitor"] = new[]
        {
            "Enalapril", "Captopril", "Ramipril", "Lisinopril", "Perindopril"
        },
        ["Arb"] = new[]
        {
            "Losartan", "Valsartan", "Telmisartan", "Irbesartan", "Candesartan"
        },
        ["PotassiumSparing"] = new[]
        {
            "Spironolactone", "Potassium Chloride", "Amiloride", "Eplerenone", "Kalium Durule"
        },
        ["SSRI"] = new[]
        {
            "Sertraline", "Fluoxetine", "Escitalopram", "Paroxetine", "Citalopram"
        },
        ["BetaBlockers_NonSelective"] = new[]
        {
            "Propranolol", "Carvedilol", "Nadolol", "Sotalol", "Timolol"
        },
    };

    public static List<CdsAlert> Evaluate(
        IEnumerable<PrescriptionCandidate> candidates,
        string? patientAllergies = null,
        IEnumerable<PrescriptionCandidate>? existingMedications = null,
        double? serumCreatinineMgDl = null,
        double? egfrMlMin = null,
        double? serumPotassiumMmolL = null,
        IEnumerable<PatientAllergy>? structuredAllergies = null,
        IEnumerable<PatientMedicalHistory>? activeProblems = null)
    {
        var alerts = new List<CdsAlert>();
        var candidateList = candidates.ToList();
        var allMedications = candidateList.Concat(existingMedications ?? Enumerable.Empty<PrescriptionCandidate>()).ToList();

        // 1. DRUG-ALLERGY CROSS CHECKING
        if (!string.IsNullOrWhiteSpace(patientAllergies))
        {
            var allergies = patientAllergies.Split(new[] { ',', ';', '/' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(a => a.Trim())
                .ToList();

            foreach (var drug in candidateList)
            {
                var matchedDrugClasses = GetDrugClasses(drug.GenericName);

                foreach (var allergy in allergies)
                {
                    // Direct name match (e.g. Allergy: "Amoxicillin", Drug: "Amoxicillin")
                    if (drug.GenericName.Contains(allergy, StringComparison.OrdinalIgnoreCase) ||
                        allergy.Contains(drug.GenericName, StringComparison.OrdinalIgnoreCase))
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"ALLERGY-DIR-{Guid.NewGuid():N}",
                            Type = CdsAlertType.DrugAllergy,
                            Severity = CdsAlertSeverity.Critical,
                            Title = $"🚨 CONTRAINDICATION: Patient has documented allergy to {allergy}",
                            ClinicalMechanism = $"Patient has recorded allergy to '{allergy}'. Direct administration risks severe Type I hypersensitivity (anaphylaxis) or severe cutaneous adverse reactions.",
                            Recommendation = "Do not prescribe this medication. Select an alternative non-cross-reactive drug class.",
                            OffendingDrug = drug.GenericName,
                            RequiresOverrideReason = true
                        });
                        continue;
                    }

                    // Class match (e.g. Allergy: "Penicillin", Drug: "Amoxicillin" or "Co-Amoxiclav")
                    if (matchedDrugClasses.Any(c => c.Equals(allergy, StringComparison.OrdinalIgnoreCase) || allergy.Contains(c, StringComparison.OrdinalIgnoreCase)))
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"ALLERGY-CLS-{Guid.NewGuid():N}",
                            Type = CdsAlertType.DrugAllergy,
                            Severity = CdsAlertSeverity.Critical,
                            Title = $"🚨 CONTRAINDICATION: Patient has {allergy} class allergy",
                            ClinicalMechanism = $"{drug.GenericName} belongs to the {allergy} class. Administration may trigger severe hypersensitivity reactions in sensitized individuals.",
                            Recommendation = "Do not prescribe this beta-lactam/class agent. Use alternative therapeutic class (e.g. Macrolides).",
                            OffendingDrug = drug.GenericName,
                            RequiresOverrideReason = true
                        });
                        continue;
                    }

                    // Cephalosporin cross-reactivity with severe Penicillin allergy
                    if (allergy.Contains("Penicillin", StringComparison.OrdinalIgnoreCase) &&
                        matchedDrugClasses.Contains("Cephalosporin", StringComparer.OrdinalIgnoreCase))
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"ALLERGY-CROSS-{Guid.NewGuid():N}",
                            Type = CdsAlertType.DrugAllergy,
                            Severity = CdsAlertSeverity.Major,
                            Title = $"⚠️ CROSS-REACTIVITY WARNING: Cephalosporin in Penicillin-Allergic Patient",
                            ClinicalMechanism = $"{drug.GenericName} is a cephalosporin. Cross-reactivity between penicillins and 1st/2nd generation cephalosporins can occur due to beta-lactam ring similarity (~2-5% risk).",
                            Recommendation = "Assess severity of penicillin allergy history. If previous reaction was anaphylaxis or angioedema, avoid cephalosporins.",
                            OffendingDrug = drug.GenericName,
                            RequiresOverrideReason = true
                        });
                    }

                    // Aspirin & NSAID class cross-reactivity
                    if ((allergy.Contains("Aspirin", StringComparison.OrdinalIgnoreCase) || allergy.Contains("NSAID", StringComparison.OrdinalIgnoreCase)) &&
                        matchedDrugClasses.Contains("NSAID", StringComparer.OrdinalIgnoreCase))
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"ALLERGY-NSAID-{Guid.NewGuid():N}",
                            Type = CdsAlertType.DrugAllergy,
                            Severity = CdsAlertSeverity.Critical,
                            Title = $"🚨 CONTRAINDICATION: NSAID prescribed to Aspirin/NSAID-sensitive patient",
                            ClinicalMechanism = $"{drug.GenericName} inhibits COX-1, which can trigger severe bronchospasm or urticaria in aspirin-exacerbated respiratory disease (AERD).",
                            Recommendation = "Do not prescribe NSAIDs. Use Paracetamol/Acetaminophen for mild analgesia.",
                            OffendingDrug = drug.GenericName,
                            RequiresOverrideReason = true
                        });
                    }
                }
            }
        }

        // 1B. STRUCTURED DRUG-ALLERGY & CROSS-REACTIVITY CHECKING
        if (structuredAllergies != null)
        {
            var activeDrugAllergies = structuredAllergies
                .Where(a => a.Category == AllergyCategory.Medication && a.Status == AllergyStatus.Active)
                .ToList();

            foreach (var drug in candidateList)
            {
                var drugName = drug.GenericName.Trim();
                var matchedDrugClasses = GetDrugClasses(drugName);

                foreach (var allergy in activeDrugAllergies)
                {
                    var allergen = allergy.Allergen.Trim();
                    bool isDirectMatch = allergen.Equals(drugName, StringComparison.OrdinalIgnoreCase) ||
                        allergen.Contains(drugName, StringComparison.OrdinalIgnoreCase) ||
                        drugName.Contains(allergen, StringComparison.OrdinalIgnoreCase);

                    bool isPenicillinClassMatch = allergen.Contains("Penicillin", StringComparison.OrdinalIgnoreCase) &&
                        (drugName.Equals("Amoxicillin", StringComparison.OrdinalIgnoreCase) ||
                         drugName.Equals("Ampicillin", StringComparison.OrdinalIgnoreCase) ||
                         drugName.Equals("Co-Amoxiclav", StringComparison.OrdinalIgnoreCase) ||
                         drugName.Equals("Penicillin", StringComparison.OrdinalIgnoreCase));

                    if (isDirectMatch || isPenicillinClassMatch)
                    {
                        bool isCritical = allergy.IsAnaphylactic || allergy.Severity == AllergySeverity.LifeThreatening;
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"ALLERGY-STR-{Guid.NewGuid():N}",
                            Type = CdsAlertType.DrugAllergy,
                            Severity = CdsAlertSeverity.Critical,
                            RuleType = "DrugAllergy",
                            Title = $"🚨 CONTRAINDICATION: Patient has documented allergy to {allergen}",
                            ClinicalMechanism = $"Patient has recorded allergy to '{allergen}' ({allergy.ReactionManifestation ?? "Severe reaction"}). Direct administration risks severe hypersensitivity (anaphylaxis).",
                            Recommendation = "Do not prescribe this medication. Select an alternative non-cross-reactive drug class.",
                            OffendingDrug = drugName,
                            RequiresOverrideReason = true,
                            IsHardStop = isCritical
                        });
                        continue;
                    }

                    // Penicillin -> Cephalosporin cross-reactivity
                    bool hasPenicillinAllergy = allergen.Contains("Penicillin", StringComparison.OrdinalIgnoreCase);
                    bool isCephalosporin = drugName.StartsWith("Cef", StringComparison.OrdinalIgnoreCase) ||
                                           drugName.StartsWith("Ceph", StringComparison.OrdinalIgnoreCase) ||
                                           matchedDrugClasses.Contains("Cephalosporin", StringComparer.OrdinalIgnoreCase);

                    if (hasPenicillinAllergy && isCephalosporin)
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"ALLERGY-STR-CEPH-{Guid.NewGuid():N}",
                            Type = CdsAlertType.CrossReactivity,
                            Severity = CdsAlertSeverity.Major,
                            RuleType = "CrossReactivity",
                            Title = $"⚠️ CROSS-REACTIVITY WARNING: Cephalosporin in Penicillin-Allergic Patient",
                            ClinicalMechanism = $"{drugName} shares beta-lactam homology with {allergen}. Cross-reactivity risk is approximately 2-10%.",
                            Recommendation = "Assess severity of penicillin allergy history. If previous reaction was anaphylaxis, avoid cephalosporins.",
                            OffendingDrug = drugName,
                            RequiresOverrideReason = true,
                            IsHardStop = false
                        });
                    }

                    // Aspirin -> NSAID cross-sensitivity
                    bool hasAspirinAllergy = allergen.Contains("Aspirin", StringComparison.OrdinalIgnoreCase);
                    bool isNsaid = matchedDrugClasses.Contains("NSAID", StringComparer.OrdinalIgnoreCase) ||
                        drugName.Equals("Ibuprofen", StringComparison.OrdinalIgnoreCase) ||
                        drugName.Equals("Naproxen", StringComparison.OrdinalIgnoreCase) ||
                        drugName.Equals("Mefenamic Acid", StringComparison.OrdinalIgnoreCase) ||
                        drugName.Equals("Ketorolac", StringComparison.OrdinalIgnoreCase) ||
                        drugName.Equals("Diclofenac", StringComparison.OrdinalIgnoreCase);

                    if (hasAspirinAllergy && isNsaid)
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"ALLERGY-STR-NSAID-{Guid.NewGuid():N}",
                            Type = CdsAlertType.CrossReactivity,
                            Severity = CdsAlertSeverity.Critical,
                            RuleType = "CrossReactivity",
                            Title = $"🚨 CONTRAINDICATION: NSAID prescribed to Aspirin/NSAID-sensitive patient",
                            ClinicalMechanism = $"{drugName} inhibits COX-1, triggering severe bronchospasm or cutaneous reactions in aspirin-sensitive patients.",
                            Recommendation = "Do not prescribe NSAIDs. Use Paracetamol for mild analgesia.",
                            OffendingDrug = drugName,
                            RequiresOverrideReason = true,
                            IsHardStop = true
                        });
                    }
                }
            }
        }

        // 1C. DRUG-DISEASE INTERACTIONS (DDI)
        if (activeProblems != null)
        {
            var problemList = activeProblems
                .Where(p => p.Status == ProblemStatus.Active || p.Status == ProblemStatus.Relapsed)
                .ToList();

            foreach (var drug in candidateList)
            {
                var drugName = drug.GenericName.Trim();
                var matchedDrugClasses = GetDrugClasses(drugName);
                bool isNsaid = matchedDrugClasses.Contains("NSAID", StringComparer.OrdinalIgnoreCase) ||
                    drugName.Equals("Ibuprofen", StringComparison.OrdinalIgnoreCase) ||
                    drugName.Equals("Naproxen", StringComparison.OrdinalIgnoreCase) ||
                    drugName.Equals("Mefenamic Acid", StringComparison.OrdinalIgnoreCase) ||
                    drugName.Equals("Ketorolac", StringComparison.OrdinalIgnoreCase) ||
                    drugName.Equals("Diclofenac", StringComparison.OrdinalIgnoreCase);

                bool isNonSelectiveBetaBlocker = matchedDrugClasses.Contains("BetaBlockers_NonSelective", StringComparer.OrdinalIgnoreCase) ||
                    drugName.Equals("Propranolol", StringComparison.OrdinalIgnoreCase) ||
                    drugName.Equals("Timolol", StringComparison.OrdinalIgnoreCase) ||
                    drugName.Equals("Nadolol", StringComparison.OrdinalIgnoreCase) ||
                    drugName.Equals("Carvedilol", StringComparison.OrdinalIgnoreCase);

                if (isNsaid)
                {
                    // Peptic Ulcer Disease (K25-K28)
                    var pud = problemList.FirstOrDefault(p =>
                        p.Icd10Code != null && (
                        p.Icd10Code.StartsWith("K25", StringComparison.OrdinalIgnoreCase) ||
                        p.Icd10Code.StartsWith("K26", StringComparison.OrdinalIgnoreCase) ||
                        p.Icd10Code.StartsWith("K27", StringComparison.OrdinalIgnoreCase) ||
                        p.Icd10Code.StartsWith("K28", StringComparison.OrdinalIgnoreCase)));

                    if (pud != null)
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"DDI-PUD-{Guid.NewGuid():N}",
                            Type = CdsAlertType.DrugDiseaseInteraction,
                            Severity = CdsAlertSeverity.Critical,
                            RuleType = "DrugDisease",
                            Title = "Contraindication: NSAID in Active Peptic Ulcer Disease",
                            ClinicalMechanism = $"{drugName} is contraindicated in patients with active peptic ulceration ({pud.Icd10Code}) due to severe gastrointestinal bleeding risk.",
                            Recommendation = "Discontinue NSAID. Consider paracetamol for analgesia.",
                            OffendingDrug = drugName,
                            RequiresOverrideReason = true,
                            IsHardStop = true
                        });
                    }

                    // Chronic Kidney Disease (N18)
                    var ckd = problemList.FirstOrDefault(p =>
                        p.Icd10Code != null && p.Icd10Code.StartsWith("N18", StringComparison.OrdinalIgnoreCase));

                    if (ckd != null)
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"DDI-CKD-{Guid.NewGuid():N}",
                            Type = CdsAlertType.DrugDiseaseInteraction,
                            Severity = CdsAlertSeverity.Critical,
                            RuleType = "DrugDisease",
                            Title = "Contraindication: NSAID in Chronic Kidney Disease",
                            ClinicalMechanism = $"{drugName} inhibits renal prostaglandin synthesis, exacerbating renal failure in CKD ({ckd.Icd10Code}).",
                            Recommendation = "Avoid prolonged NSAID therapy. Monitor renal function and serum creatinine.",
                            OffendingDrug = drugName,
                            RequiresOverrideReason = true,
                            IsHardStop = false
                        });
                    }
                }

                if (isNonSelectiveBetaBlocker)
                {
                    // Asthma (J45) or COPD (J44)
                    var airway = problemList.FirstOrDefault(p =>
                        p.Icd10Code != null && (
                        p.Icd10Code.StartsWith("J45", StringComparison.OrdinalIgnoreCase) ||
                        p.Icd10Code.StartsWith("J44", StringComparison.OrdinalIgnoreCase)));

                    if (airway != null)
                    {
                        alerts.Add(new CdsAlert
                        {
                            AlertId = $"DDI-AIRWAY-{Guid.NewGuid():N}",
                            Type = CdsAlertType.DrugDiseaseInteraction,
                            Severity = CdsAlertSeverity.Critical,
                            RuleType = "DrugDisease",
                            Title = "Contraindication: Beta-Blocker in Bronchospastic Disease",
                            ClinicalMechanism = $"{drugName} causes beta-2 receptor blockade, triggering severe bronchospasm in asthma and COPD ({airway.Icd10Code} - {airway.ConditionTitle}).",
                            Recommendation = "Discontinue non-selective beta-blocker. Switch to cardioselective beta-1 blocker with caution.",
                            OffendingDrug = drugName,
                            RequiresOverrideReason = true,
                            IsHardStop = true
                        });
                    }
                }
            }
        }

        // 2. DRUG-DRUG INTERACTIONS (DDI)
        for (int i = 0; i < allMedications.Count; i++)
        {
            for (int j = i + 1; j < allMedications.Count; j++)
            {
                var med1 = allMedications[i];
                var med2 = allMedications[j];

                CheckPairwiseDdi(med1, med2, alerts);
            }
        }

        // 3. LAB-TO-RX RENAL DOSING & ELECTROLYTE ALERTS
        foreach (var drug in candidateList)
        {
            var name = drug.GenericName;

            // Metformin Renal Evaluation
            if (name.Contains("Metformin", StringComparison.OrdinalIgnoreCase))
            {
                if (egfrMlMin.HasValue && egfrMlMin.Value < 30)
                {
                    alerts.Add(new CdsAlert
                    {
                        AlertId = $"RENAL-MET-30-{Guid.NewGuid():N}",
                        Type = CdsAlertType.RenalDoseAdjustment,
                        Severity = CdsAlertSeverity.Critical,
                        Title = $"🚨 RENAL CONTRAINDICATION: Metformin in Severe CKD (eGFR {egfrMlMin.Value:F1} mL/min)",
                        ClinicalMechanism = "Metformin is eliminated renally. In severe renal impairment (eGFR < 30), drug accumulation drastically increases the risk of fatal lactic acidosis.",
                        Recommendation = "Discontinue Metformin immediately. Switch to DPP-4 inhibitors (Linagliptin) or Insulin.",
                        OffendingDrug = drug.GenericName,
                        RequiresOverrideReason = true
                    });
                }
                else if (egfrMlMin.HasValue && egfrMlMin.Value < 45)
                {
                    alerts.Add(new CdsAlert
                    {
                        AlertId = $"RENAL-MET-45-{Guid.NewGuid():N}",
                        Type = CdsAlertType.RenalDoseAdjustment,
                        Severity = CdsAlertSeverity.Major,
                        Title = $"⚠️ RENAL DOSE ADJUSTMENT: Metformin in Moderate CKD (eGFR {egfrMlMin.Value:F1} mL/min)",
                        ClinicalMechanism = "Decreased renal clearance increases risk of drug accumulation. Maximum recommended dose is 1,000 mg daily.",
                        Recommendation = "Cap Metformin at 500mg BID and monitor renal function every 3 months.",
                        OffendingDrug = drug.GenericName,
                        RequiresOverrideReason = false
                    });
                }
                else if (serumCreatinineMgDl.HasValue && serumCreatinineMgDl.Value >= 1.5)
                {
                    alerts.Add(new CdsAlert
                    {
                        AlertId = $"RENAL-MET-CR-{Guid.NewGuid():N}",
                        Type = CdsAlertType.RenalDoseAdjustment,
                        Severity = CdsAlertSeverity.Major,
                        Title = $"⚠️ ELEVATED CREATININE WARNING: Metformin (Serum Creatinine {serumCreatinineMgDl.Value:F2} mg/dL)",
                        ClinicalMechanism = "Elevated baseline creatinine suggests impaired renal clearance. Assess eGFR before initiating or continuing full dose.",
                        Recommendation = "Verify eGFR > 45 mL/min before administering standard therapeutic doses.",
                        OffendingDrug = drug.GenericName,
                        RequiresOverrideReason = false
                    });
                }
            }

            // NSAID in Renal Impairment
            if (IsClass(name, "NSAID"))
            {
                if (egfrMlMin.HasValue && egfrMlMin.Value < 60)
                {
                    alerts.Add(new CdsAlert
                    {
                        AlertId = $"RENAL-NSAID-{Guid.NewGuid():N}",
                        Type = CdsAlertType.RenalDoseAdjustment,
                        Severity = CdsAlertSeverity.Major,
                        Title = $"⚠️ NEPHROTOXICITY ALERT: NSAID in Renal Impairment (eGFR {egfrMlMin.Value:F1} mL/min)",
                        ClinicalMechanism = "NSAIDs inhibit renal prostaglandin synthesis, reducing renal blood flow and precipitating acute-on-chronic kidney injury.",
                        Recommendation = "Avoid NSAIDs in patients with eGFR < 60. Use Paracetamol or topical analgesics.",
                        OffendingDrug = drug.GenericName,
                        RequiresOverrideReason = true
                    });
                }
            }

            // Ciprofloxacin in Renal Impairment
            if (name.Contains("Ciprofloxacin", StringComparison.OrdinalIgnoreCase))
            {
                if (egfrMlMin.HasValue && egfrMlMin.Value < 50)
                {
                    alerts.Add(new CdsAlert
                    {
                        AlertId = $"RENAL-CIPRO-{Guid.NewGuid():N}",
                        Type = CdsAlertType.RenalDoseAdjustment,
                        Severity = CdsAlertSeverity.Moderate,
                        Title = $"ℹ️ DOSE ADJUSTMENT: Ciprofloxacin in Renal Impairment (eGFR {egfrMlMin.Value:F1} mL/min)",
                        ClinicalMechanism = "Renal clearance is reduced. Standard 500mg Q12H doses can cause neurological toxicity and crystalluria.",
                        Recommendation = "Adjust dose to 250-500 mg every 18-24 hours depending on infection severity.",
                        OffendingDrug = drug.GenericName,
                        RequiresOverrideReason = false
                    });
                }
            }

            // Hyperkalemia with ACEi/ARB/Spironolactone
            if (serumPotassiumMmolL.HasValue && serumPotassiumMmolL.Value >= 5.2)
            {
                if (IsClass(name, "AceInhibitor") || IsClass(name, "Arb") || IsClass(name, "PotassiumSparing"))
                {
                    alerts.Add(new CdsAlert
                    {
                        AlertId = $"LAB-HYPERK-{Guid.NewGuid():N}",
                        Type = CdsAlertType.LabValueWarning,
                        Severity = CdsAlertSeverity.Critical,
                        Title = $"🚨 HYPERKALEMIA ALERT: Baseline Potassium {serumPotassiumMmolL.Value:F1} mmol/L",
                        ClinicalMechanism = $"{drug.GenericName} suppresses aldosterone and increases potassium retention, worsening preexisting hyperkalemia with cardiac conduction risk.",
                        Recommendation = "Withhold potassium-retaining agents until serum potassium normalizes (< 5.0 mmol/L).",
                        OffendingDrug = drug.GenericName,
                        RequiresOverrideReason = true
                    });
                }
            }
        }

        return alerts;
    }

    private static void CheckPairwiseDdi(PrescriptionCandidate med1, PrescriptionCandidate med2, List<CdsAlert> alerts)
    {
        var n1 = med1.GenericName;
        var n2 = med2.GenericName;

        // 1. Warfarin + NSAID
        if ((n1.Contains("Warfarin", StringComparison.OrdinalIgnoreCase) && IsClass(n2, "NSAID")) ||
            (n2.Contains("Warfarin", StringComparison.OrdinalIgnoreCase) && IsClass(n1, "NSAID")))
        {
            var nsaid = IsClass(n1, "NSAID") ? n1 : n2;
            alerts.Add(new CdsAlert
            {
                AlertId = $"DDI-WARF-NSAID-{Guid.NewGuid():N}",
                Type = CdsAlertType.DrugDrugInteraction,
                Severity = CdsAlertSeverity.Critical,
                Title = $"🚨 SEVERE BLEEDING RISK: Warfarin + {nsaid}",
                ClinicalMechanism = "Synergistic gastrointestinal ulceration and platelet inhibition combined with systemic anticoagulation drastically increases major hemorrhage and upper GI bleeding risk.",
                Recommendation = "Contraindicated for routine analgesia. Substitute Paracetamol / Acetaminophen (≤ 2 g/day). If unavoidable, prescribe PPI co-therapy and closely monitor INR.",
                OffendingDrug = nsaid,
                InteractingDrug = "Warfarin",
                RequiresOverrideReason = true
            });
        }

        // 2. ACEi / ARB + Potassium-Sparing Agent
        if ((IsClass(n1, "AceInhibitor") || IsClass(n1, "Arb")) && IsClass(n2, "PotassiumSparing") ||
            (IsClass(n2, "AceInhibitor") || IsClass(n2, "Arb")) && IsClass(n1, "PotassiumSparing"))
        {
            alerts.Add(new CdsAlert
            {
                AlertId = $"DDI-ACE-K-{Guid.NewGuid():N}",
                Type = CdsAlertType.DrugDrugInteraction,
                Severity = CdsAlertSeverity.Major,
                Title = $"⚠️ HYPERKALEMIA RISK: {n1} + {n2}",
                ClinicalMechanism = "Both agents diminish aldosterone activity and potassium secretion. Concomitant use can cause severe, potentially fatal hyperkalemia and cardiac dysrhythmias.",
                Recommendation = "Monitor serum potassium and renal panel within 1-2 weeks of initiation. Advise patient against dietary potassium supplements.",
                OffendingDrug = n1,
                InteractingDrug = n2,
                RequiresOverrideReason = false
            });
        }

        // 3. Clopidogrel + Omeprazole / Esomeprazole
        if ((n1.Contains("Clopidogrel", StringComparison.OrdinalIgnoreCase) && (n2.Contains("Omeprazole", StringComparison.OrdinalIgnoreCase) || n2.Contains("Esomeprazole", StringComparison.OrdinalIgnoreCase))) ||
            (n2.Contains("Clopidogrel", StringComparison.OrdinalIgnoreCase) && (n1.Contains("Omeprazole", StringComparison.OrdinalIgnoreCase) || n1.Contains("Esomeprazole", StringComparison.OrdinalIgnoreCase))))
        {
            var ppi = n1.Contains("prazole", StringComparison.OrdinalIgnoreCase) ? n1 : n2;
            alerts.Add(new CdsAlert
            {
                AlertId = $"DDI-CLOP-OMEP-{Guid.NewGuid():N}",
                Type = CdsAlertType.DrugDrugInteraction,
                Severity = CdsAlertSeverity.Major,
                Title = $"⚠️ ANTIPLATELET ATTENUATION: Clopidogrel + {ppi}",
                ClinicalMechanism = $"{ppi} competitively inhibits CYP2C19, significantly reducing bioactivation of clopidogrel into its active antiplatelet metabolite.",
                Recommendation = "Switch PPI to Pantoprazole or Rabeprazole, which exhibit minimal CYP2C19 inhibition.",
                OffendingDrug = ppi,
                InteractingDrug = "Clopidogrel",
                RequiresOverrideReason = false
            });
        }

        // 4. Statin + Clarithromycin / Gemfibrozil
        if ((IsClass(n1, "Statin") && (n2.Contains("Clarithromycin", StringComparison.OrdinalIgnoreCase) || n2.Contains("Gemfibrozil", StringComparison.OrdinalIgnoreCase))) ||
            (IsClass(n2, "Statin") && (n1.Contains("Clarithromycin", StringComparison.OrdinalIgnoreCase) || n1.Contains("Gemfibrozil", StringComparison.OrdinalIgnoreCase))))
        {
            var statin = IsClass(n1, "Statin") ? n1 : n2;
            var inhibitor = IsClass(n1, "Statin") ? n2 : n1;
            alerts.Add(new CdsAlert
            {
                AlertId = $"DDI-STATIN-RHABDO-{Guid.NewGuid():N}",
                Type = CdsAlertType.DrugDrugInteraction,
                Severity = CdsAlertSeverity.Major,
                Title = $"⚠️ RHABDOMYOLYSIS RISK: {statin} + {inhibitor}",
                ClinicalMechanism = $"{inhibitor} potently inhibits CYP3A4/OATP1B1 statin elimination, causing severe statin accumulation and high risk of myopathy or acute rhabdomyolysis.",
                Recommendation = "Temporarily suspend statin therapy during antibiotic course, or substitute Azithromycin if indicated.",
                OffendingDrug = statin,
                InteractingDrug = inhibitor,
                RequiresOverrideReason = true
            });
        }

        // 5. SSRI + Tramadol (Serotonin Syndrome)
        if ((IsClass(n1, "SSRI") && n2.Contains("Tramadol", StringComparison.OrdinalIgnoreCase)) ||
            (IsClass(n2, "SSRI") && n1.Contains("Tramadol", StringComparison.OrdinalIgnoreCase)))
        {
            alerts.Add(new CdsAlert
            {
                AlertId = $"DDI-SSRI-TRAM-{Guid.NewGuid():N}",
                Type = CdsAlertType.DrugDrugInteraction,
                Severity = CdsAlertSeverity.Major,
                Title = $"⚠️ SEROTONIN TOXICITY: {n1} + {n2}",
                ClinicalMechanism = "Both agents enhance serotonergic neurotransmission. Concomitant use increases risk of Serotonin Syndrome (hyperthermia, clonus, autonomic instability).",
                Recommendation = "Use lowest effective tramadol dose; educate patient on signs of serotonin toxicity (tremors, sweating, agitation).",
                OffendingDrug = "Tramadol",
                InteractingDrug = IsClass(n1, "SSRI") ? n1 : n2,
                RequiresOverrideReason = false
            });
        }
    }

    private static List<string> GetDrugClasses(string drugName)
    {
        var classes = new List<string>();
        foreach (var (className, drugs) in DrugClasses)
        {
            if (drugs.Any(d => drugName.Contains(d, StringComparison.OrdinalIgnoreCase) || d.Contains(drugName, StringComparison.OrdinalIgnoreCase)))
            {
                classes.Add(className);
            }
        }
        return classes;
    }

    private static bool IsClass(string drugName, string className)
    {
        if (DrugClasses.TryGetValue(className, out var drugs))
        {
            return drugs.Any(d => drugName.Contains(d, StringComparison.OrdinalIgnoreCase) || d.Contains(drugName, StringComparison.OrdinalIgnoreCase));
        }
        return false;
    }
}
