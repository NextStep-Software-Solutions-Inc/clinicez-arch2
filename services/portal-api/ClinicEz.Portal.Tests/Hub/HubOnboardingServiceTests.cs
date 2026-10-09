using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Hub;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Hub;

public class HubOnboardingServiceTests : IDisposable
{
    private const string PublicUrl = "https://hub.clinicez.test";

    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly FakeHubAdminClient _hub = new();
    private readonly CapturingLogger<HubOnboardingService> _logger = new();
    private readonly Tenant _tenant = new() { Id = Guid.NewGuid(), TenantSlug = "metro", Name = "Metro Health", OwnerId = "o", Email = "a@metro.ph" };

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private HubOnboardingService Service(string? publicUrl = PublicUrl) =>
        new(_hub, _context, Options.Create(new HubOptions { PublicUrl = publicUrl }), _logger);

    private async Task<Facility> SaveFacilityAsync(FacilityDeploymentMode mode, FacilityType type = FacilityType.Clinic, string? hubClientId = null, FacilityStatus status = FacilityStatus.Active)
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Site",
            FacilityType = type,
            DeploymentMode = mode,
            HubClientId = hubClientId,
            Status = status
        };
        if (!_context.Tenants.Local.Contains(_tenant)) _context.Tenants.Add(_tenant);
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();
        return facility;
    }

    [Fact]
    public async Task OnPremise_CreatesEdgeCell_AndIssuesTheUpstreamAndEveryServiceClientOnce()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Laboratory);

        var credentials = await Service(PublicUrl + "/").OnboardAsync(facility, _tenant, CancellationToken.None);

        Assert.NotNull(credentials);
        Assert.Equal(PublicUrl, credentials.HubUrl);
        Assert.NotNull(credentials.Upstream);
        Assert.Equal("created-secret", credentials.Upstream.ClientSecret);
        Assert.Equal(
            EdgeHubServices.All.Where(s => s != EdgeHubServices.Upstream).Order(),
            credentials.Services.Keys.Order());
        Assert.All(credentials.Services.Values, c => Assert.Equal("created-secret", c.ClientSecret));

        var cell = Assert.Single(_hub.Cells);
        Assert.Equal($"edge-{_tenant.Id}", cell.CellId);
        Assert.Equal(CellKind.Edge, cell.Kind);

        Assert.Equal(EdgeHubServices.All.Count, _hub.CreatedClients.Count);
        Assert.All(_hub.CreatedClients, c =>
        {
            Assert.Equal($"edge-{_tenant.Id}", c.CellId);
            Assert.Equal(HubClientKind.EdgeCell, c.Request.Kind);
        });
        Assert.Equal(EdgeHubServices.All.Order(), _hub.CreatedClients.Select(c => c.Request.Service).Order());
    }

    [Fact]
    public async Task OnPremise_RemembersEveryClientId_AndLinksTheFacilityToItsServiceClient_ButNeverTheSecret()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Laboratory);

        var credentials = await Service().OnboardAsync(facility, _tenant, CancellationToken.None);

        var rows = await _context.EdgeHubClients.AsNoTracking().ToListAsync();
        Assert.Equal(EdgeHubServices.All.Order(), rows.Select(r => r.Service).Order());
        Assert.All(rows, r => Assert.Equal($"edge-{_tenant.Id}", r.CellId));

        var stored = await _context.Facilities.AsNoTracking().SingleAsync();
        Assert.Equal(credentials!.Services[InteropServices.Laboratory].ClientId, stored.HubClientId);
        Assert.DoesNotContain("created-secret", string.Join('|', typeof(Facility).GetProperties().Select(p => p.GetValue(stored)?.ToString())));
        Assert.DoesNotContain("created-secret", string.Join('|', typeof(EdgeHubClient).GetProperties().Select(p => p.GetValue(rows[0])?.ToString())));
    }

    [Fact]
    public async Task OnPremise_SecondFacility_ReturnsNoCredentials_ButIsLinkedToTheExistingServiceClient()
    {
        var first = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Clinic);
        await Service().OnboardAsync(first, _tenant, CancellationToken.None);
        var clientsAfterFirst = _hub.CreatedClients.Count;
        var second = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Clinic);

        var credentials = await Service().OnboardAsync(second, _tenant, CancellationToken.None);

        Assert.Null(credentials);
        Assert.Equal(clientsAfterFirst, _hub.CreatedClients.Count);
        var stored = await _context.Facilities.AsNoTracking().ToListAsync();
        Assert.Single(stored.Select(f => f.HubClientId).Distinct());
        Assert.All(stored, f => Assert.NotNull(f.HubClientId));
    }

    [Fact]
    public async Task OnPremise_DoesNotLogTheSecret()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);

        await Service().OnboardAsync(facility, _tenant, CancellationToken.None);

        Assert.NotEmpty(_logger.Messages);
        Assert.DoesNotContain(_logger.Messages, m => m.Contains("created-secret"));
    }

    [Fact]
    public async Task Cloud_DoesNothing()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.SharedCloud);

        var credentials = await Service().OnboardAsync(facility, _tenant, CancellationToken.None);

        Assert.Null(credentials);
        Assert.Empty(_hub.Cells);
        Assert.Empty(_hub.CreatedClients);
    }

    [Fact]
    public async Task OnPremise_WithoutAPublicHubUrl_Throws_BeforeCallingTheHub()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);

        await Assert.ThrowsAsync<InvalidOperationException>(() => Service(" ").OnboardAsync(facility, _tenant, CancellationToken.None));

        Assert.Empty(_hub.Cells);
        Assert.Empty(_hub.CreatedClients);
    }

    [Fact]
    public async Task Rotate_ReplacesTheSecretOfTheFacilitysServiceClient()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Laboratory);
        await Service().OnboardAsync(facility, _tenant, CancellationToken.None);
        var laboratoryClient = (await _context.EdgeHubClients.SingleAsync(c => c.Service == InteropServices.Laboratory)).ClientId;
        var created = _hub.CreatedClients.Count;

        var rotated = await Service().RotateAsync(facility, _tenant, null, CancellationToken.None);

        Assert.Equal(laboratoryClient, rotated.ClientId);
        Assert.Equal(InteropServices.Laboratory, rotated.Service);
        Assert.Equal("rotated-secret", rotated.ClientSecret);
        Assert.Equal(PublicUrl, rotated.HubUrl);
        Assert.Equal([laboratoryClient], _hub.RotatedClients);
        Assert.Equal(created, _hub.CreatedClients.Count);
    }

    [Fact]
    public async Task Rotate_CanTargetAnotherClientOfTheWorkspace_IncludingTheUpstreamOne()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);
        await Service().OnboardAsync(facility, _tenant, CancellationToken.None);
        var upstreamClient = (await _context.EdgeHubClients.SingleAsync(c => c.Service == EdgeHubServices.Upstream)).ClientId;

        var rotated = await Service().RotateAsync(facility, _tenant, " Cell ", CancellationToken.None);

        Assert.Equal(EdgeHubServices.Upstream, rotated.Service);
        Assert.Equal(upstreamClient, rotated.ClientId);
        Assert.Equal([upstreamClient], _hub.RotatedClients);
    }

    [Fact]
    public async Task Rotate_WithoutAClientYet_CreatesOne()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);

        var rotated = await Service().RotateAsync(facility, _tenant, null, CancellationToken.None);

        Assert.Equal("created-secret", rotated.ClientSecret);
        Assert.Equal(InteropServices.Clinic, rotated.Service);
        Assert.Single(_hub.CreatedClients);
        Assert.Empty(_hub.RotatedClients);
        Assert.Equal(rotated.ClientId, (await _context.Facilities.AsNoTracking().SingleAsync()).HubClientId);
    }

    [Fact]
    public async Task Rotate_UnknownService_IsRejected()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);

        await Assert.ThrowsAsync<InvalidOperationException>(() => Service().RotateAsync(facility, _tenant, "hub", CancellationToken.None));

        Assert.Empty(_hub.RotatedClients);
        Assert.Empty(_hub.CreatedClients);
    }

    [Fact]
    public async Task Rotate_ForACloudFacility_IsRejected()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.SharedCloud);

        await Assert.ThrowsAsync<InvalidOperationException>(() => Service().RotateAsync(facility, _tenant, null, CancellationToken.None));

        Assert.Empty(_hub.RotatedClients);
    }

    [Fact]
    public async Task HubFailure_Propagates_SoTheCallerCanMarkOnboardingPending()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);
        _hub.FailWith = new HttpRequestException("hub down");

        await Assert.ThrowsAsync<HttpRequestException>(() => Service().OnboardAsync(facility, _tenant, CancellationToken.None));

        Assert.Null((await _context.Facilities.AsNoTracking().SingleAsync()).HubClientId);
        Assert.Empty(_context.EdgeHubClients);
    }

    [Fact]
    public async Task Revoke_LastOnPremiseFacility_RevokesEveryClientAndClearsTheLink()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);
        await Service().OnboardAsync(facility, _tenant, CancellationToken.None);
        facility.Status = FacilityStatus.Suspended;
        await _context.SaveChangesAsync();

        await Service().RevokeForFacilityAsync(facility, CancellationToken.None);

        Assert.Equal(EdgeHubServices.All.Count, _hub.RevokedClients.Count);
        Assert.Empty(_context.EdgeHubClients);
        Assert.Null((await _context.Facilities.AsNoTracking().SingleAsync()).HubClientId);
    }

    [Fact]
    public async Task Revoke_WhenALiveSiblingOfTheSameTypeRemains_KeepsEverything()
    {
        var first = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Clinic);
        await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Clinic);
        await Service().OnboardAsync(first, _tenant, CancellationToken.None);

        await Service().RevokeForFacilityAsync(first, CancellationToken.None);

        Assert.Empty(_hub.RevokedClients);
        Assert.Equal(EdgeHubServices.All.Count, await _context.EdgeHubClients.CountAsync());
    }

    [Fact]
    public async Task Revoke_WhenOnlyOtherTypesRemain_RevokesJustTheFacilitysServiceClient()
    {
        var laboratory = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Laboratory);
        await SaveFacilityAsync(FacilityDeploymentMode.OnPremise, FacilityType.Clinic);
        await Service().OnboardAsync(laboratory, _tenant, CancellationToken.None);
        var laboratoryClient = (await _context.EdgeHubClients.SingleAsync(c => c.Service == InteropServices.Laboratory)).ClientId;

        await Service().RevokeForFacilityAsync(laboratory, CancellationToken.None);

        Assert.Equal([laboratoryClient], _hub.RevokedClients);
        Assert.DoesNotContain(await _context.EdgeHubClients.ToListAsync(), c => c.Service == InteropServices.Laboratory);
        Assert.Equal(EdgeHubServices.All.Count - 1, await _context.EdgeHubClients.CountAsync());
    }

    [Fact]
    public async Task Revoke_ForACloudFacility_DoesNothing()
    {
        var onPremise = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);
        await Service().OnboardAsync(onPremise, _tenant, CancellationToken.None);
        var cloud = await SaveFacilityAsync(FacilityDeploymentMode.SharedCloud, FacilityType.Laboratory, status: FacilityStatus.Suspended);

        await Service().RevokeForFacilityAsync(cloud, CancellationToken.None);

        Assert.Empty(_hub.RevokedClients);
    }

    [Fact]
    public async Task Revoke_AfterMovingToTheCloud_StillCountsTheFacilityAsLeftTheEdgeCell()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);
        await Service().OnboardAsync(facility, _tenant, CancellationToken.None);
        facility.DeploymentMode = FacilityDeploymentMode.SharedCloud;
        await _context.SaveChangesAsync();

        await Service().RevokeForFacilityAsync(facility, CancellationToken.None, leftEdgeCell: true);

        Assert.Equal(EdgeHubServices.All.Count, _hub.RevokedClients.Count);
        Assert.Empty(_context.EdgeHubClients);
    }

    [Fact]
    public async Task Revoke_ClientAlreadyGoneFromTheHub_IsTreatedAsRevoked()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);
        await Service().OnboardAsync(facility, _tenant, CancellationToken.None);
        _hub.FailRevokeWith = new HttpRequestException("gone", null, System.Net.HttpStatusCode.NotFound);
        facility.Status = FacilityStatus.Suspended;
        await _context.SaveChangesAsync();

        await Service().RevokeForFacilityAsync(facility, CancellationToken.None);

        Assert.Empty(_context.EdgeHubClients);
    }

    [Fact]
    public async Task Revoke_HubFailure_IsLoggedAndTheRowIsKeptForALaterRetry()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);
        await Service().OnboardAsync(facility, _tenant, CancellationToken.None);
        _hub.FailRevokeWith = new HttpRequestException("hub down", null, System.Net.HttpStatusCode.BadGateway);
        facility.Status = FacilityStatus.Suspended;
        await _context.SaveChangesAsync();

        await Service().RevokeForFacilityAsync(facility, CancellationToken.None);

        Assert.Equal(EdgeHubServices.All.Count, await _context.EdgeHubClients.CountAsync());
        Assert.NotNull((await _context.Facilities.AsNoTracking().SingleAsync()).HubClientId);
    }

    [Fact]
    public async Task RevokeWorkspace_RevokesEveryClientOfThatWorkspaceOnly()
    {
        var facility = await SaveFacilityAsync(FacilityDeploymentMode.OnPremise);
        await Service().OnboardAsync(facility, _tenant, CancellationToken.None);
        var otherTenant = Guid.NewGuid();
        _context.EdgeHubClients.Add(new EdgeHubClient { TenantId = otherTenant, CellId = $"edge-{otherTenant}", Service = "cell", ClientId = "other-client" });
        await _context.SaveChangesAsync();

        await Service().RevokeWorkspaceAsync(_tenant.Id, CancellationToken.None);

        Assert.Equal(EdgeHubServices.All.Count, _hub.RevokedClients.Count);
        Assert.DoesNotContain("other-client", _hub.RevokedClients);
        Assert.Equal("other-client", Assert.Single(_context.EdgeHubClients).ClientId);
    }
}

/// <summary>Keeps what was logged so tests can assert that no secret reaches the logs.</summary>
internal sealed class CapturingLogger<T> : ILogger<T>
{
    public List<string> Messages { get; } = [];

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
        Messages.Add(formatter(state, exception));
}
