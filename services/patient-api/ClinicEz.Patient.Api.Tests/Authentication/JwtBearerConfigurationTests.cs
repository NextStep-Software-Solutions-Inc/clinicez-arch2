using System.Security.Claims;
using ClinicEz.Patient.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Api.Tests.Authentication;

public sealed class JwtBearerConfigurationTests
{
    [Fact]
    public void AddClerkAuthentication_WhenAudienceIsEmpty_DisablesAudienceValidation()
    {
        // Arrange
        var inMemorySettings = new Dictionary<string, string?>
        {
            ["Clerk:Authority"] = "https://amazing-mosquito-75.clerk.accounts.dev",
            ["Clerk:Audience"] = ""
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var services = new ServiceCollection();

        // Act
        services.AddClerkAuthentication(configuration);
        var serviceProvider = services.BuildServiceProvider();
        var optionsMonitor = serviceProvider.GetRequiredService<IOptionsMonitor<JwtBearerOptions>>();
        var jwtOptions = optionsMonitor.Get(JwtBearerDefaults.AuthenticationScheme);

        // Assert
        jwtOptions.Authority.Should().Be("https://amazing-mosquito-75.clerk.accounts.dev");
        jwtOptions.TokenValidationParameters.Should().NotBeNull();
        jwtOptions.TokenValidationParameters.ValidateAudience.Should().BeFalse();
        jwtOptions.TokenValidationParameters.ValidAudience.Should().BeNull();
        jwtOptions.TokenValidationParameters.NameClaimType.Should().Be(ClaimTypes.NameIdentifier);
    }

    [Fact]
    public void AddClerkAuthentication_WhenAudienceMatchesAuthority_SafelyDisablesAudienceValidation()
    {
        // Arrange: simulates the bug where authority was copy-pasted into audience
        var authority = "https://amazing-mosquito-75.clerk.accounts.dev";
        var inMemorySettings = new Dictionary<string, string?>
        {
            ["Clerk:Authority"] = authority,
            ["Clerk:Audience"] = authority
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var services = new ServiceCollection();

        // Act
        services.AddClerkAuthentication(configuration);
        var serviceProvider = services.BuildServiceProvider();
        var optionsMonitor = serviceProvider.GetRequiredService<IOptionsMonitor<JwtBearerOptions>>();
        var jwtOptions = optionsMonitor.Get(JwtBearerDefaults.AuthenticationScheme);

        // Assert
        jwtOptions.TokenValidationParameters.ValidateAudience.Should().BeFalse(
            "standard Clerk session tokens do not contain an audience claim and authority URL should not be validated as audience");
        jwtOptions.TokenValidationParameters.ValidAudience.Should().BeNull();
    }

    [Fact]
    public void AddClerkAuthentication_WhenCustomAudienceConfigured_EnablesAudienceValidation()
    {
        // Arrange: custom JWT template scenario
        var inMemorySettings = new Dictionary<string, string?>
        {
            ["Clerk:Authority"] = "https://amazing-mosquito-75.clerk.accounts.dev",
            ["Clerk:Audience"] = "api://clinicez-patient"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var services = new ServiceCollection();

        // Act
        services.AddClerkAuthentication(configuration);
        var serviceProvider = services.BuildServiceProvider();
        var optionsMonitor = serviceProvider.GetRequiredService<IOptionsMonitor<JwtBearerOptions>>();
        var jwtOptions = optionsMonitor.Get(JwtBearerDefaults.AuthenticationScheme);

        // Assert
        jwtOptions.TokenValidationParameters.ValidateAudience.Should().BeTrue();
        jwtOptions.TokenValidationParameters.ValidAudience.Should().Be("api://clinicez-patient");
    }

    [Fact]
    public void AddClerkAuthentication_WhenAuthorityMissing_ThrowsInvalidOperationException()
    {
        // Arrange
        var inMemorySettings = new Dictionary<string, string?>();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var services = new ServiceCollection();

        // Act
        var act = () => services.AddClerkAuthentication(configuration);

        // Assert
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Clerk:Authority is not configured.*");
    }
}
