using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Hub;

/// <summary>Creating an on-premise facility hands the owner the one-time hub credentials.</summary>
public class CreateOnPremiseFacilityTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly FakeHubAdminClient _hub = new();
    private readonly Guid _tenantId = Guid.NewGuid();

    public CreateOnPremiseFacilityTests()
    {
        _context.Tenants.Add(new Tenant { Id = _tenantId, TenantSlug = "metro", Name = "Metro Health", OwnerId = "o", Email = "a@metro.ph" });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private CreateFacilityCommandHandler Handler() =>
        TestSupport.CreateFacilityHandler(
            _context,
            new Mock<IEntitlementGuard>().Object,
            onboarding: new HubOnboardingService(
                _hub,
                _context,
                Options.Create(new HubOptions { PublicUrl = "https://hub.clinicez.test" }),
                new CapturingLogger<HubOnboardingService>()));

    private CreateFacilityCommand OnPremiseCommand(string? consoleUrl = "https://clinic.metro.example") =>
        new(_tenantId.ToString(), FacilityType.Clinic, "Site Clinic", DeploymentMode: FacilityDeploymentMode.OnPremise, ConsoleBaseUrl: consoleUrl);

    [Fact]
    public async Task OnPremise_ReturnsHubCredentials_AndStoresOnlyTheClientId()
    {
        var result = await Handler().Handle(OnPremiseCommand(), CancellationToken.None);

        Assert.True(result.Success);
        Assert.False(result.HubOnboardingPending);
        Assert.NotNull(result.HubCredentials);
        Assert.Equal("https://hub.clinicez.test", result.HubCredentials.HubUrl);
        Assert.Equal("created-secret", result.HubCredentials.Upstream!.ClientSecret);
        Assert.Equal("created-secret", result.HubCredentials.Services[InteropServices.Clinic].ClientSecret);

        var facility = await _context.Facilities.AsNoTracking().SingleAsync();
        Assert.Equal(FacilityDeploymentMode.OnPremise, facility.DeploymentMode);
        Assert.Equal($"edge-{_tenantId}", facility.CellId);
        Assert.Equal(result.HubCredentials.Services[InteropServices.Clinic].ClientId, facility.HubClientId);
        Assert.All(_hub.CreatedClients, c => Assert.Equal($"edge-{_tenantId}", c.CellId));
    }

    [Fact]
    public async Task OnPremise_WhenTheHubIsDown_StillCreatesTheFacility_AndFlagsOnboardingAsPending()
    {
        _hub.FailWith = new HttpRequestException("hub unreachable");

        var result = await Handler().Handle(OnPremiseCommand(), CancellationToken.None);

        Assert.True(result.Success);
        Assert.True(result.HubOnboardingPending);
        Assert.Null(result.HubCredentials);

        var facility = await _context.Facilities.AsNoTracking().SingleAsync();
        Assert.Null(facility.HubClientId);
        Assert.NotEmpty(TestSupport.Outbox(_context));
    }

    [Fact]
    public async Task CloudFacility_ReturnsNoCredentials_AndNeverCallsTheHubAdminApi()
    {
        var result = await Handler().Handle(
            new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Cloud Clinic"),
            CancellationToken.None);

        Assert.True(result.Success);
        Assert.Null(result.HubCredentials);
        Assert.False(result.HubOnboardingPending);
        Assert.Empty(_hub.CreatedClients);
        Assert.Empty(_hub.Cells);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("http://insecure.example")]
    public void OnPremise_RequiresAnHttpsConsoleUrl(string? url)
    {
        var validation = new CreateFacilityCommandValidator().Validate(OnPremiseCommand(url));

        Assert.False(validation.IsValid);
    }

    [Fact]
    public void OnPremise_WithAnHttpsConsoleUrl_IsValid()
    {
        Assert.True(new CreateFacilityCommandValidator().Validate(OnPremiseCommand()).IsValid);
    }
}
