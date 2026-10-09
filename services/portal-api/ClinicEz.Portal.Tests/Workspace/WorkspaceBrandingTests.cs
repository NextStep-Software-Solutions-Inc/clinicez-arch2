using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using Moq;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Workspace;

public class WorkspaceBrandingTests : IDisposable
{
    private const string Slug = "metro-clinic";
    private static readonly WorkspaceActor Actor = new("clerk_owner_111", "Juan Dela Cruz", "Owner");

    private readonly IWorkspaceProfilePublisher _publisher;
    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();

    public WorkspaceBrandingTests()
    {
        _context = TestSupport.NewContext();
        _publisher = TestSupport.ProfilePublisher(_context);
        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = Slug,
            Name = "Metro Clinic",
            OwnerId = "clerk_owner_111",
            Email = "owner@metro.ph"
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private static UpdateWorkspaceBrandingCommand Cmd(string? name = "Metro Health", string? logo = "https://cdn.metro.ph/logo.png", string? color = "#0284c7") =>
        new(Slug, Actor, name, logo, color);

    [Fact]
    public async Task Update_PersistsBranding_NormalizesColor_BumpsVersion_AndAudits()
    {
        var handler = new UpdateWorkspaceBrandingCommandHandler(_context, _publisher);

        var result = await handler.Handle(Cmd(), CancellationToken.None);

        Assert.Equal("Metro Health", result.BrandName);
        Assert.Equal("#0284C7", result.AccentColorHex);

        var stored = await _context.WorkspaceSettings.SingleAsync();
        Assert.Equal("https://cdn.metro.ph/logo.png", stored.LogoUrl);
        Assert.Equal(2, stored.ProfileVersion);

        var audit = await _context.WorkspaceAuditEntries.SingleAsync();
        Assert.Equal("branding", audit.Section);
        Assert.Contains("accentColorHex", audit.ChangesJson);
    }

    [Fact]
    public async Task Update_Unchanged_DoesNotBumpVersionOrAudit()
    {
        var handler = new UpdateWorkspaceBrandingCommandHandler(_context, _publisher);
        await handler.Handle(Cmd(), CancellationToken.None);

        await handler.Handle(Cmd(), CancellationToken.None);

        Assert.Equal(2, (await _context.WorkspaceSettings.SingleAsync()).ProfileVersion);
        Assert.Single(_context.WorkspaceAuditEntries);
    }

    [Fact]
    public async Task Update_BlankValues_ClearOverrides()
    {
        var handler = new UpdateWorkspaceBrandingCommandHandler(_context, _publisher);
        await handler.Handle(Cmd(), CancellationToken.None);

        var result = await handler.Handle(Cmd(name: " ", logo: "", color: null), CancellationToken.None);

        Assert.Null(result.BrandName);
        Assert.Null(result.LogoUrl);
        Assert.Null(result.AccentColorHex);
        Assert.Equal(3, (await _context.WorkspaceSettings.SingleAsync()).ProfileVersion);
    }

    [Fact]
    public async Task Get_ReturnsBrandingSection()
    {
        await new UpdateWorkspaceBrandingCommandHandler(_context, _publisher).Handle(Cmd(), CancellationToken.None);

        var dto = await new GetWorkspaceSettingsQueryHandler(_context)
            .Handle(new GetWorkspaceSettingsQuery(Slug), CancellationToken.None);

        Assert.Equal("Metro Health", dto!.Branding.BrandName);
    }

    [Fact]
    public async Task UpdateGeneral_BumpsProfileVersion()
    {
        var handler = new UpdateWorkspaceGeneralCommandHandler(_context, _publisher);
        await handler.Handle(new UpdateWorkspaceGeneralCommand(Slug, Actor, "Metro Renamed", null, "owner@metro.ph", null,
            "Asia/Manila", "en-PH", "MMM d, yyyy", "PHP"), CancellationToken.None);

        Assert.Equal(2, (await _context.WorkspaceSettings.SingleAsync()).ProfileVersion);
    }

    // ---------- propagation event ----------

    private async Task<Facility> AddFacilityAsync(FacilityStatus status = FacilityStatus.Active)
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = $"Facility {Guid.NewGuid():N}",
            FacilityType = FacilityType.Clinic,
            Status = status
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();
        return facility;
    }

    [Fact]
    public async Task Update_PublishesProfileUpdatedToEachFacility_OnlyWhenSomethingChanged()
    {
        var clinic = await AddFacilityAsync();
        var lab = await AddFacilityAsync();
        await AddFacilityAsync(FacilityStatus.Failed);
        var handler = new UpdateWorkspaceBrandingCommandHandler(_context, _publisher);

        await handler.Handle(Cmd(), CancellationToken.None);
        await handler.Handle(Cmd(), CancellationToken.None); // identical => no change => no event

        var messages = TestSupport.Outbox(_context, InteropTypes.WorkspaceProfileUpdated);
        Assert.Equal(2, messages.Count);
        Assert.All(messages, m => Assert.Equal(PartyKind.Facility, m.To.Kind));
        Assert.Equivalent(new[] { clinic.Id.ToString(), lab.Id.ToString() }, messages.Select(m => m.To.FacilityId));
        Assert.All(messages, m =>
        {
            var payload = m.GetPayload<ClinicEz.Shared.Common.WorkspaceProfileUpdatedEvent>();
            Assert.Equal(Slug, payload.TenantSlug);
            Assert.Equal(_tenantId.ToString(), payload.TenantId);
            Assert.Equal(2, payload.Version);
        });
    }

    [Fact]
    public async Task UpdateGeneral_PublishesProfileUpdatedEvent()
    {
        await AddFacilityAsync();

        await new UpdateWorkspaceGeneralCommandHandler(_context, _publisher).Handle(
            new UpdateWorkspaceGeneralCommand(Slug, Actor, "Metro Renamed", null, "owner@metro.ph", null,
                "Asia/Manila", "en-PH", "MMM d, yyyy", "PHP"), CancellationToken.None);

        Assert.Single(TestSupport.Outbox(_context, InteropTypes.WorkspaceProfileUpdated));
    }

    [Fact]
    public async Task Profile_CanBeResolvedByTenantId()
    {
        var profile = await new GetWorkspaceProfileQueryHandler(_context)
            .Handle(new GetWorkspaceProfileQuery(_tenantId.ToString()), CancellationToken.None);

        Assert.Equal(Slug, profile!.TenantSlug);
    }

    // ---------- workspace profile (facility-facing projection) ----------

    [Fact]
    public async Task Profile_WithoutOverrides_FallsBackToTenantNameAndDefaults()
    {
        var profile = await new GetWorkspaceProfileQueryHandler(_context)
            .Handle(new GetWorkspaceProfileQuery("METRO-CLINIC"), CancellationToken.None);

        Assert.NotNull(profile);
        Assert.Equal("Metro Clinic", profile.DisplayName);
        Assert.Null(profile.LogoUrl);
        Assert.Null(profile.AccentColorHex);
        Assert.Equal("Asia/Manila", profile.TimeZoneId);
        Assert.Equal(1, profile.Version);
    }

    [Fact]
    public async Task Profile_AfterBranding_UsesOverridesAndNewVersion_AndExposesNoContactDetails()
    {
        await new UpdateWorkspaceBrandingCommandHandler(_context, _publisher).Handle(Cmd(), CancellationToken.None);

        var profile = await new GetWorkspaceProfileQueryHandler(_context)
            .Handle(new GetWorkspaceProfileQuery(Slug), CancellationToken.None);

        Assert.Equal("Metro Health", profile!.DisplayName);
        Assert.Equal("#0284C7", profile.AccentColorHex);
        Assert.Equal(2, profile.Version);

        var exposed = typeof(WorkspaceProfileDto).GetProperties().Select(p => p.Name).ToArray();
        Assert.DoesNotContain("Email", exposed);
        Assert.DoesNotContain("PhoneNumber", exposed);
        Assert.DoesNotContain("RepresentativeName", exposed);
    }

    [Fact]
    public async Task Profile_UnknownWorkspace_ReturnsNull() =>
        Assert.Null(await new GetWorkspaceProfileQueryHandler(_context)
            .Handle(new GetWorkspaceProfileQuery("nope"), CancellationToken.None));

    // ---------- validation ----------

    private static readonly UpdateWorkspaceBrandingCommandValidator Validator = new();

    [Theory]
    [InlineData("Metro", "https://cdn.metro.ph/a.png", "#0284C7", true)]
    [InlineData(null, null, null, true)]
    [InlineData("M", null, null, false)]                                   // name too short
    [InlineData("Metro", "http://cdn.metro.ph/a.png", null, false)]         // not https
    [InlineData("Metro", "https://user:pw@cdn.metro.ph/a.png", null, false)] // credentials
    [InlineData("Metro", "https://localhost/a.png", null, false)]
    [InlineData("Metro", "https://192.168.1.10/a.png", null, false)]
    [InlineData("Metro", "https://169.254.169.254/latest", null, false)]
    [InlineData("Metro", "javascript:alert(1)", null, false)]
    [InlineData("Metro", null, "red", false)]
    [InlineData("Metro", null, "#12345", false)]
    [InlineData("Metro", null, "#GGGGGG", false)]
    public void Validator_EnforcesBrandingRules(string? name, string? logo, string? color, bool valid)
    {
        var result = Validator.Validate(new UpdateWorkspaceBrandingCommand(Slug, Actor, name, logo, color));
        Assert.Equal(valid, result.IsValid);
    }

    [Theory]
    [InlineData("https://example.com/x", true)]
    [InlineData("https://sub.example.co.ph:8443/x?y=1", true)]
    [InlineData("https://8.8.8.8/x", true)]
    [InlineData("http://example.com", false)]
    [InlineData("https://10.0.0.5/", false)]
    [InlineData("https://172.16.0.1/", false)]
    [InlineData("https://100.64.0.1/", false)]
    [InlineData("https://[::1]/", false)]
    [InlineData("https://[fc00::1]/", false)]
    [InlineData("https://intranet/", false)]
    [InlineData("https://thing.internal/", false)]
    [InlineData("", false)]
    public void PublicHttpsUrl_BlocksUnsafeTargets(string url, bool expected) =>
        Assert.Equal(expected, PublicHttpsUrl.IsValid(url));
}
