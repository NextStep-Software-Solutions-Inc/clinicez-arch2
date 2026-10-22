using System.Collections.Generic;
using ClinicEz.Shared.Security.Turnstile;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ClinicEz.Portal.Tests.Security;

public class TurnstileSettingResolverTests
{
    [Fact]
    public void IsEnabled_WhenTurnstileEnabledEnvVarIsTrue_OverridesFacilitySettingToTrue()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["TURNSTILE_ENABLED"] = "true"
            })
            .Build();

        var resolver = new TurnstileSettingResolver(configuration);

        Assert.True(resolver.IsEnabled(facilityEnabled: false));
        Assert.True(resolver.IsEnabled(facilityEnabled: true));
        Assert.True(resolver.IsEnabled(facilityEnabled: null));

        var (isOverridden, overrideValue) = resolver.GetEnvironmentOverride();
        Assert.True(isOverridden);
        Assert.True(overrideValue);
    }

    [Fact]
    public void IsEnabled_WhenTurnstileEnabledEnvVarIsFalse_OverridesFacilitySettingToFalse()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["TURNSTILE_ENABLED"] = "false"
            })
            .Build();

        var resolver = new TurnstileSettingResolver(configuration);

        Assert.False(resolver.IsEnabled(facilityEnabled: true));
        Assert.False(resolver.IsEnabled(facilityEnabled: false));
        Assert.False(resolver.IsEnabled(facilityEnabled: null));

        var (isOverridden, overrideValue) = resolver.GetEnvironmentOverride();
        Assert.True(isOverridden);
        Assert.False(overrideValue);
    }

    [Fact]
    public void IsEnabled_WhenTurnstileEnabledSectionIsTrue_OverridesFacilitySettingToTrue()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Turnstile:Enabled"] = "true"
            })
            .Build();

        var resolver = new TurnstileSettingResolver(configuration);

        Assert.True(resolver.IsEnabled(facilityEnabled: false));
        var (isOverridden, overrideValue) = resolver.GetEnvironmentOverride();
        Assert.True(isOverridden);
        Assert.True(overrideValue);
    }

    [Fact]
    public void IsEnabled_WhenNoEnvironmentVariableSet_DefersToFacilitySetting()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var resolver = new TurnstileSettingResolver(configuration);

        Assert.True(resolver.IsEnabled(facilityEnabled: true));
        Assert.False(resolver.IsEnabled(facilityEnabled: false));
        Assert.False(resolver.IsEnabled(facilityEnabled: null));

        var (isOverridden, overrideValue) = resolver.GetEnvironmentOverride();
        Assert.False(isOverridden);
        Assert.Null(overrideValue);
    }

    [Fact]
    public void GetSiteKey_WhenEnvironmentSiteKeySet_ReturnsEnvironmentKey()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["TURNSTILE_SITE_KEY"] = "custom-env-site-key-123"
            })
            .Build();

        var resolver = new TurnstileSettingResolver(configuration);

        Assert.Equal("custom-env-site-key-123", resolver.GetSiteKey("facility-key-456"));
    }

    [Fact]
    public void GetSiteKey_WhenNoEnvironmentSiteKey_ReturnsFacilityKeyOrOfficialTestKey()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var resolver = new TurnstileSettingResolver(configuration);

        Assert.Equal("facility-key-456", resolver.GetSiteKey("facility-key-456"));
        Assert.Equal(CloudflareTurnstileValidator.OfficialTestSiteKeyPass, resolver.GetSiteKey(null));
        Assert.Equal(CloudflareTurnstileValidator.OfficialTestSiteKeyPass, resolver.GetSiteKey("   "));
    }
}
