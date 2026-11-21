using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Shared.Licensing;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Challenger 2 Milestone M1 Adversarial Suite:
/// Empirically verifies EntitlementKeys registration, limits, features dictionary mapping,
/// and appsettings.json plan catalogue defaults across all production tiers.
/// </summary>
public class CommsEntitlementKeysAdversarialTests
{
    [Fact]
    public void EntitlementKeys_Constants_MatchExpectedWireFormats()
    {
        Assert.Equal("limit.call_minutes_monthly", EntitlementKeys.LimitCallMinutesMonthly);
        Assert.Equal("feature.workspace_chat", EntitlementKeys.FeatureWorkspaceChat);
        Assert.Equal("feature.patient_messaging", EntitlementKeys.FeaturePatientMessaging);
    }

    [Fact]
    public void EntitlementKeys_LimitsAndFeaturesCollections_RegisterCommsEntries()
    {
        Assert.Contains(EntitlementKeys.LimitCallMinutesMonthly, EntitlementKeys.Limits);
        Assert.Contains(EntitlementKeys.FeatureWorkspaceChat, EntitlementKeys.Features);
        Assert.Contains(EntitlementKeys.FeaturePatientMessaging, EntitlementKeys.Features);

        Assert.True(EntitlementKeys.IsKnown(EntitlementKeys.LimitCallMinutesMonthly));
        Assert.True(EntitlementKeys.IsKnown(EntitlementKeys.FeatureWorkspaceChat));
        Assert.True(EntitlementKeys.IsKnown(EntitlementKeys.FeaturePatientMessaging));
    }

    [Fact]
    public void EntitlementKeys_FacilityLicenseFeatures_MapsProperlyToFacilityFeatureKeys()
    {
        Assert.True(EntitlementKeys.FacilityLicenseFeatures.ContainsKey(EntitlementKeys.FeatureWorkspaceChat));
        Assert.Equal(FacilityFeatureKeys.WorkspaceChat, EntitlementKeys.FacilityLicenseFeatures[EntitlementKeys.FeatureWorkspaceChat]);

        Assert.True(EntitlementKeys.FacilityLicenseFeatures.ContainsKey(EntitlementKeys.FeaturePatientMessaging));
        Assert.Equal(FacilityFeatureKeys.PatientMessaging, EntitlementKeys.FacilityLicenseFeatures[EntitlementKeys.FeaturePatientMessaging]);
    }

    [Fact]
    public void Appsettings_BillingPlansCatalogue_DefaultsAllTiersToCommsDisabled()
    {
        // Locate appsettings.json for portal-api
        var baseDir = AppContext.BaseDirectory;
        var appsettingsPath = Path.Combine(baseDir, "..", "..", "..", "..", "ClinicEz.Portal.Api", "appsettings.json");
        if (!File.Exists(appsettingsPath))
        {
            appsettingsPath = Path.GetFullPath(Path.Combine(baseDir, "../../../../../services/portal-api/ClinicEz.Portal.Api/appsettings.json"));
        }

        Assert.True(File.Exists(appsettingsPath), $"appsettings.json must exist at {appsettingsPath}");

        var json = File.ReadAllText(appsettingsPath);
        using var doc = JsonDocument.Parse(json);

        var plans = doc.RootElement.GetProperty("Billing").GetProperty("Plans").EnumerateArray().ToList();
        Assert.NotEmpty(plans);

        foreach (var plan in plans)
        {
            var slug = plan.GetProperty("Slug").GetString();

            // 1. Verify EnabledFeatures does NOT enable feature.workspace_chat or feature.patient_messaging
            if (plan.TryGetProperty("EnabledFeatures", out var enabledFeatures))
            {
                var featureList = enabledFeatures.EnumerateArray().Select(f => f.GetString()).ToList();
                Assert.DoesNotContain("feature.workspace_chat", featureList);
                Assert.DoesNotContain("feature.patient_messaging", featureList);
            }

            // 2. Verify Limits does NOT grant call minutes > 0
            if (plan.TryGetProperty("Limits", out var limits))
            {
                if (limits.TryGetProperty("limit.call_minutes_monthly", out var callMinutes))
                {
                    Assert.True(callMinutes.GetInt32() <= 0,
                        $"Plan '{slug}' in appsettings.json must not grant positive default call minutes");
                }
            }
        }
    }
}
