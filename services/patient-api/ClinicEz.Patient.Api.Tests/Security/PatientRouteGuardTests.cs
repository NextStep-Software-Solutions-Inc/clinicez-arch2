using ClinicEz.Patient.Api.Middleware;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;

namespace ClinicEz.Patient.Api.Tests.Security;

/// <summary>Guards the guard: every patient route is covered by the ownership check, and removed surfaces stay removed.</summary>
public sealed class PatientRouteGuardTests : IAsyncLifetime
{
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync() => _host = await PatientApiTestHost.StartAsync();

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private List<RouteEndpoint> Routes() =>
        _host.EndpointSources.SelectMany(s => s.Endpoints).OfType<RouteEndpoint>().ToList();

    [Theory]
    [InlineData("/patients/{patientId:guid}/appointments", "patientId")]
    [InlineData("/patients/{id:guid}/full-record", "id")]
    [InlineData("/patients/{id:guid}/yakap/profile", "id")]
    [InlineData("/patients/by-clerk/{clerkUserId}", "clerkUserId")]
    [InlineData("/clinics/{clinicId:guid}/providers/{providerId:guid}/slots", null)]
    [InlineData("/clinics", null)]
    [InlineData("/patients", null)]
    [InlineData("/patients/claim-intake", null)]
    [InlineData("/patients/me", null)]
    [InlineData("/webhooks/clerk", null)]
    public void ResolveGuardedParameter_ClassifiesRouteShapes(string template, string? expected)
    {
        var parameter = PatientOwnershipMiddleware.ResolveGuardedParameter(RoutePatternFactory.Parse(template));

        parameter.Should().Be(expected);
    }

    [Fact]
    public void EveryRouteUnderPatients_ExceptCreateAndClaimIntake_IsOwnershipGuarded()
    {
        var patientRoutes = Routes()
            .Where(r => r.RoutePattern.RawText!.StartsWith("/api/v1/patients/", StringComparison.Ordinal))
            .Where(r => !string.Equals(r.RoutePattern.RawText, "/api/v1/patients/claim-intake", StringComparison.Ordinal)
                     && !string.Equals(r.RoutePattern.RawText, "/api/v1/patients/me", StringComparison.Ordinal))
            .ToList();

        patientRoutes.Should().NotBeEmpty();
        patientRoutes
            .Where(r => PatientOwnershipMiddleware.ResolveGuardedParameter(r.RoutePattern) is null)
            .Select(r => r.RoutePattern.RawText)
            .Should().BeEmpty("a patient route without {id}/{patientId}/by-clerk would skip the ownership check");
    }

    [Fact]
    public void PatientsMeRoute_RequiresAuthorization()
    {
        var meRoute = Routes().Single(r => string.Equals(r.RoutePattern.RawText, "/api/v1/patients/me", StringComparison.Ordinal));
        meRoute.Metadata.GetOrderedMetadata<IAuthorizeData>().Should().NotBeEmpty();
    }

    [Fact]
    public void EveryRouteNamingAPatient_IsOwnershipGuarded()
    {
        Routes()
            .Where(r => r.RoutePattern.Parameters.Any(p => p.Name.Contains("patient", StringComparison.OrdinalIgnoreCase)))
            .Where(r => PatientOwnershipMiddleware.ResolveGuardedParameter(r.RoutePattern) is null)
            .Select(r => r.RoutePattern.RawText)
            .Should().BeEmpty();
    }

    [Fact]
    public void EveryGuardedRoute_RequiresAuthentication()
    {
        Routes()
            .Where(r => PatientOwnershipMiddleware.ResolveGuardedParameter(r.RoutePattern) is not null)
            .Where(r => !r.Metadata.GetOrderedMetadata<IAuthorizeData>().Any())
            .Select(r => r.RoutePattern.RawText)
            .Should().BeEmpty();
    }

    [Fact]
    public void ClinicPushWebhookAndInternalApprovalRoutes_NoLongerExist()
    {
        var templates = Routes().Select(r => r.RoutePattern.RawText!).ToList();

        templates.Should().NotContain(t =>
            t.Contains("/webhooks/clinics", StringComparison.OrdinalIgnoreCase)
            || t.Contains("/webhooks/organizations", StringComparison.OrdinalIgnoreCase)
            || t.Contains("clinic-push", StringComparison.OrdinalIgnoreCase)
            || t.Contains("/internal/", StringComparison.OrdinalIgnoreCase));
        templates.Where(t => t.Contains("/webhooks", StringComparison.OrdinalIgnoreCase))
            .Should().BeEquivalentTo(["/api/v1/webhooks/clerk"]);
    }
}
