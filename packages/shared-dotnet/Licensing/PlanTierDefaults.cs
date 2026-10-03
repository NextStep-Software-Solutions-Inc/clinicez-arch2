using System.Collections.Generic;

namespace ClinicEz.Shared.Licensing;

public static class PlanTierDefaults
{
    public static FacilityLimits GetLimitsForTier(string? planTier) =>
        planTier?.ToLowerInvariant() switch
        {
            "standard" => new FacilityLimits
            {
                MaxStaff = 25,
                MaxBeds = 10,
                MaxAnalyzers = 3,
                MaxMonthlyConsultations = 2500,
                MaxStorageMb = 20480,
                ConcurrentTerminals = 5
            },
            "enterprise" => new FacilityLimits
            {
                MaxStaff = 100,
                MaxBeds = 50,
                MaxAnalyzers = 10,
                MaxMonthlyConsultations = 10000,
                MaxStorageMb = 102400,
                ConcurrentTerminals = 20
            },
            _ => new FacilityLimits // Community / Default
            {
                MaxStaff = 5,
                MaxBeds = 0,
                MaxAnalyzers = 1,
                MaxMonthlyConsultations = 500,
                MaxStorageMb = 5120,
                ConcurrentTerminals = 2
            }
        };

    public static List<string> GetFeaturesForTier(string? planTier) =>
        planTier?.ToLowerInvariant() switch
        {
            "standard" => new List<string>
            {
                FacilityFeatureKeys.Teleconsultation,
                FacilityFeatureKeys.ElectronicPrescriptions,
                FacilityFeatureKeys.LisIntegration,
                FacilityFeatureKeys.InventoryManagement,
                FacilityFeatureKeys.PhilHealthKonsulta,
                FacilityFeatureKeys.CustomLetterhead
            },
            "enterprise" => new List<string>
            {
                FacilityFeatureKeys.Teleconsultation,
                FacilityFeatureKeys.ElectronicPrescriptions,
                FacilityFeatureKeys.LisIntegration,
                FacilityFeatureKeys.InventoryManagement,
                FacilityFeatureKeys.PhilHealthKonsulta,
                FacilityFeatureKeys.MultiTerminalSync,
                FacilityFeatureKeys.AdvancedAnalytics,
                FacilityFeatureKeys.CustomLetterhead
            },
            _ => new List<string>
            {
                FacilityFeatureKeys.ElectronicPrescriptions,
                FacilityFeatureKeys.InventoryManagement
            }
        };
}
