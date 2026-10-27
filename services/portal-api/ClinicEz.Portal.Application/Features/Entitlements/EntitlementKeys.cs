using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Portal.Application.Features.Entitlements;

/// <summary>
/// The vocabulary of plan entitlements. Keys are stable strings stored in <c>PlanEntitlement.Key</c>; what each plan
/// grants is data (seeded from <c>Billing:Plans</c>), never code. Limits of kind "pool" are carved up across facilities.
/// </summary>
public static class EntitlementKeys
{
    public const string LimitClinics = "limit.clinics";
    public const string LimitLaboratories = "limit.laboratories";
    public const string LimitPharmacies = "limit.pharmacies";
    public const string LimitOrganizations = "limit.organizations";
    public const string LimitBranches = "limit.branches";
    public const string LimitMembers = "limit.members";
    public const string LimitBeds = "limit.beds";
    public const string LimitAnalyzers = "limit.analyzers";
    public const string LimitMonthlyConsultations = "limit.monthly_consultations";
    public const string LimitApiRequestsMonthly = "limit.api_requests_monthly";
    public const string LimitPatients = "limit.patients";
    public const string LimitCallMinutesMonthly = "limit.call_minutes_monthly";

    // Workspace pools: divided among the workspace's facilities through FacilityAllocation.
    public const string PoolStaff = "limit.staff";
    public const string PoolStorageGb = "limit.storage_gb";
    public const string PoolTerminals = "limit.terminals";

    public const string FeatureCrossTenantInterop = "feature.cross_tenant_interop";
    public const string FeatureTeleconsultation = "feature.teleconsultation";
    public const string FeatureElectronicPrescriptions = "feature.electronic_prescriptions";
    public const string FeatureLisIntegration = "feature.lis_integration";
    public const string FeatureInventoryManagement = "feature.inventory_management";
    public const string FeaturePhilHealthKonsulta = "feature.philhealth_konsulta";
    public const string FeatureMultiTerminalSync = "feature.multi_terminal_sync";
    public const string FeatureAdvancedAnalytics = "feature.advanced_analytics";
    public const string FeatureCustomLetterhead = "feature.custom_letterhead";
    public const string FeatureOnPrem = "feature.on_prem";
    public const string FeatureWorkspaceChat = "feature.workspace_chat";
    public const string FeaturePatientMessaging = "feature.patient_messaging";

    public static readonly IReadOnlyList<string> Limits =
    [
        LimitClinics, LimitLaboratories, LimitPharmacies, LimitOrganizations, LimitBranches, LimitMembers,
        PoolStaff, PoolStorageGb, PoolTerminals, LimitBeds, LimitAnalyzers, LimitMonthlyConsultations,
        LimitApiRequestsMonthly, LimitPatients, LimitCallMinutesMonthly
    ];

    public static readonly IReadOnlyList<string> Features =
    [
        FeatureCrossTenantInterop, FeatureTeleconsultation, FeatureElectronicPrescriptions, FeatureLisIntegration,
        FeatureInventoryManagement, FeaturePhilHealthKonsulta, FeatureMultiTerminalSync, FeatureAdvancedAnalytics,
        FeatureCustomLetterhead, FeatureOnPrem, FeatureWorkspaceChat, FeaturePatientMessaging
    ];

    public static bool IsKnown(string key) => Limits.Contains(key) || Features.Contains(key);

    /// <summary>The facility-count limit that applies to a facility of this type.</summary>
    public static string FacilityLimitFor(FacilityType type) => type switch
    {
        FacilityType.Clinic => LimitClinics,
        FacilityType.Laboratory => LimitLaboratories,
        FacilityType.Pharmacy => LimitPharmacies,
        FacilityType.Organization => LimitOrganizations,
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown facility type.")
    };

    /// <summary>Features that travel inside a facility license, keyed the way facilities know them.</summary>
    public static readonly IReadOnlyDictionary<string, string> FacilityLicenseFeatures = new Dictionary<string, string>
    {
        [FeatureTeleconsultation] = FacilityFeatureKeys.Teleconsultation,
        [FeatureElectronicPrescriptions] = FacilityFeatureKeys.ElectronicPrescriptions,
        [FeatureLisIntegration] = FacilityFeatureKeys.LisIntegration,
        [FeatureInventoryManagement] = FacilityFeatureKeys.InventoryManagement,
        [FeaturePhilHealthKonsulta] = FacilityFeatureKeys.PhilHealthKonsulta,
        [FeatureMultiTerminalSync] = FacilityFeatureKeys.MultiTerminalSync,
        [FeatureAdvancedAnalytics] = FacilityFeatureKeys.AdvancedAnalytics,
        [FeatureCustomLetterhead] = FacilityFeatureKeys.CustomLetterhead,
        [FeatureWorkspaceChat] = FacilityFeatureKeys.WorkspaceChat,
        [FeaturePatientMessaging] = FacilityFeatureKeys.PatientMessaging
    };
}
