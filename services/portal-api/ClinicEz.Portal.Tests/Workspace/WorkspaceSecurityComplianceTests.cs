using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Workspace;

public class WorkspaceSecurityComplianceTests : IDisposable
{
    private const string Slug = "metro-clinic";
    private static readonly WorkspaceActor Actor = new("clerk_owner_111", "Juan Dela Cruz", "Owner");

    private readonly IWorkspaceProfilePublisher _publisher;
    private readonly Mock<IEntitlementGuard> _guard = new();
    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();

    public WorkspaceSecurityComplianceTests()
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

    private static UpdateWorkspaceSecurityCommand Security(bool mfa = true, int idle = 30, params string[] domains) =>
        new(Slug, Actor, mfa, idle, domains);

    private static UpdateWorkspaceComplianceCommand Compliance(string? name = "Ana Reyes", string? email = "dpo@metro.ph", string? url = "https://metro.ph/privacy") =>
        new(Slug, Actor, name, email, url);

    // ---- Security --------------------------------------------------------------------------

    [Fact]
    public async Task Security_Update_NormalizesDomains_Audits_AndDoesNotBumpProfileVersion()
    {
        var handler = new UpdateWorkspaceSecurityCommandHandler(_context);

        var result = await handler.Handle(Security(true, 30, "@Metro.PH", "metro.ph", " clinic.example.com "), CancellationToken.None);

        Assert.True(result.RequireMfa);
        Assert.Equal(30, result.IdleTimeoutMinutes);
        Assert.Equal(["metro.ph", "clinic.example.com"], result.AllowedInviteDomains);

        var stored = await _context.WorkspaceSettings.SingleAsync();
        Assert.Equal(1, stored.ProfileVersion);

        var audit = await _context.WorkspaceAuditEntries.SingleAsync();
        Assert.Equal("security", audit.Section);
        Assert.Contains("requireMfa", audit.ChangesJson);
    }

    [Fact]
    public async Task Security_Update_Unchanged_DoesNotAudit()
    {
        var handler = new UpdateWorkspaceSecurityCommandHandler(_context);
        await handler.Handle(Security(), CancellationToken.None);

        await handler.Handle(Security(), CancellationToken.None);

        Assert.Single(_context.WorkspaceAuditEntries);
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(5, true)]
    [InlineData(480, true)]
    [InlineData(4, false)]
    [InlineData(481, false)]
    [InlineData(-1, false)]
    public void Security_Validator_IdleTimeoutRange(int minutes, bool valid)
    {
        var result = new UpdateWorkspaceSecurityCommandValidator().Validate(Security(false, minutes));
        Assert.Equal(valid, result.IsValid);
    }

    [Theory]
    [InlineData("metro.ph", true)]
    [InlineData("mail.metro.co.ph", true)]
    [InlineData("localhost", false)]
    [InlineData("metro", false)]
    [InlineData("metro.ph/path", false)]
    [InlineData("me tro.ph", false)]
    [InlineData("-metro.ph", false)]
    public void Security_Validator_Domains(string domain, bool valid)
    {
        var result = new UpdateWorkspaceSecurityCommandValidator().Validate(Security(false, 0, domain));
        Assert.Equal(valid, result.IsValid);
    }

    [Fact]
    public void Security_Validator_RejectsMoreThanMaxDomains()
    {
        var many = Enumerable.Range(0, InviteDomains.MaxDomains + 1).Select(i => $"d{i}.example.com").ToArray();
        Assert.False(new UpdateWorkspaceSecurityCommandValidator().Validate(Security(false, 0, many)).IsValid);
    }

    [Theory]
    [InlineData(null, "a@x.com", true)]
    [InlineData("", "a@x.com", true)]
    [InlineData("metro.ph", "a@METRO.ph", true)]
    [InlineData("metro.ph", "a@evil.com", false)]
    [InlineData("metro.ph", "a@sub.metro.ph", false)]
    [InlineData("metro.ph", "not-an-email", false)]
    [InlineData("metro.ph", "a@", false)]
    [InlineData("metro.ph", null, false)]
    public void InviteDomains_IsAllowed(string? stored, string? email, bool expected)
        => Assert.Equal(expected, InviteDomains.IsAllowed(stored, email));

    [Fact]
    public async Task Invite_WithAllowList_RejectsOtherDomains_AndAcceptsListed()
    {
        await new UpdateWorkspaceSecurityCommandHandler(_context).Handle(Security(false, 0, "metro.ph"), CancellationToken.None);
        var handler = new InviteStaffMemberCommandHandler(_context, _guard.Object, TestSupport.InvitationNotifier(_context), TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new InviteStaffMemberCommand(Slug, "nurse@gmail.com", "Nurse Joy", "Viewer"), CancellationToken.None));
        Assert.Contains("metro.ph", ex.Message);

        var ok = await handler.Handle(new InviteStaffMemberCommand(Slug, "nurse@metro.ph", "Nurse Joy", "Viewer"), CancellationToken.None);
        Assert.Equal("nurse@metro.ph", ok.Email);
    }

    [Fact]
    public async Task Invite_WithoutAllowList_AcceptsAnyDomain()
    {
        var handler = new InviteStaffMemberCommandHandler(_context, _guard.Object, TestSupport.InvitationNotifier(_context), TimeProvider.System);

        var ok = await handler.Handle(new InviteStaffMemberCommand(Slug, "nurse@gmail.com", "Nurse Joy", "Viewer"), CancellationToken.None);

        Assert.Equal("nurse@gmail.com", ok.Email);
    }

    [Fact]
    public async Task AcceptInvitation_AfterAllowListTightened_IsRejected_AndExistingMembersUntouched()
    {
        var invited = new WorkspaceMember
        {
            TenantId = _tenantId,
            Email = "nurse@gmail.com",
            FullName = "Nurse Joy",
            Status = MemberStatus.Invited,
            InvitationToken = "tok123",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(1)
        };
        var existing = new WorkspaceMember { TenantId = _tenantId, Email = "doc@gmail.com", FullName = "Doc", Status = MemberStatus.Active, UserId = "u1" };
        _context.WorkspaceMembers.AddRange(invited, existing);
        await _context.SaveChangesAsync();

        await new UpdateWorkspaceSecurityCommandHandler(_context).Handle(Security(false, 0, "metro.ph"), CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new AcceptInvitationCommandHandler(_context, TestSupport.NoClerkSync(), TimeProvider.System).Handle(new AcceptInvitationCommand("tok123", "u2", "nurse@gmail.com"), CancellationToken.None));

        Assert.Equal(MemberStatus.Invited, (await _context.WorkspaceMembers.SingleAsync(s => s.Id == invited.Id)).Status);
        Assert.Equal(MemberStatus.Active, (await _context.WorkspaceMembers.SingleAsync(s => s.Id == existing.Id)).Status);
    }

    [Fact]
    public async Task AcceptInvitation_RejectsAccountEmailOutsideAllowList()
    {
        _context.WorkspaceMembers.Add(new WorkspaceMember
        {
            TenantId = _tenantId,
            Email = "nurse@metro.ph",
            FullName = "Nurse Joy",
            Status = MemberStatus.Invited,
            InvitationToken = "tok456",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await _context.SaveChangesAsync();
        await new UpdateWorkspaceSecurityCommandHandler(_context).Handle(Security(false, 0, "metro.ph"), CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new AcceptInvitationCommandHandler(_context, TestSupport.NoClerkSync(), TimeProvider.System).Handle(new AcceptInvitationCommand("tok456", "u3", "someone@gmail.com"), CancellationToken.None));

        var result = await new AcceptInvitationCommandHandler(_context, TestSupport.NoClerkSync(), TimeProvider.System)
            .Handle(new AcceptInvitationCommand("tok456", "u3", "nurse@metro.ph"), CancellationToken.None);
        Assert.Equal(Slug, result.TenantSlug);
    }

    [Fact]
    public async Task SessionPolicy_ReturnsMfaAndIdleTimeout_AndDefaultsWhenNeverConfigured()
    {
        var handler = new GetWorkspaceSessionPolicyQueryHandler(_context);

        var defaults = await handler.Handle(new GetWorkspaceSessionPolicyQuery(Slug), CancellationToken.None);
        Assert.Equal(new WorkspaceSessionPolicyDto(false, 0), defaults);
        Assert.Empty(_context.WorkspaceSettings); // read-only: nothing persisted

        await new UpdateWorkspaceSecurityCommandHandler(_context).Handle(Security(true, 15), CancellationToken.None);
        var configured = await handler.Handle(new GetWorkspaceSessionPolicyQuery(Slug), CancellationToken.None);
        Assert.Equal(new WorkspaceSessionPolicyDto(true, 15), configured);

        Assert.Null(await handler.Handle(new GetWorkspaceSessionPolicyQuery("nope"), CancellationToken.None));
    }

    // ---- Compliance ------------------------------------------------------------------------

    [Fact]
    public async Task Compliance_Update_PersistsBumpsVersionPublishesAndAudits()
    {
        await AddFacilityAsync();
        var handler = new UpdateWorkspaceComplianceCommandHandler(_context, _publisher);

        var result = await handler.Handle(Compliance(email: "DPO@Metro.ph"), CancellationToken.None);

        Assert.Equal("Ana Reyes", result.DpoName);
        Assert.Equal("dpo@metro.ph", result.DpoEmail);
        Assert.Equal("https://metro.ph/privacy", result.PrivacyNoticeUrl);
        Assert.Equal(2, (await _context.WorkspaceSettings.SingleAsync()).ProfileVersion);
        Assert.Equal("compliance", (await _context.WorkspaceAuditEntries.SingleAsync()).Section);
        Assert.Single(TestSupport.Outbox(_context, InteropTypes.WorkspaceProfileUpdated));
    }

    [Fact]
    public async Task Compliance_Unchanged_DoesNotBumpOrPublish()
    {
        await AddFacilityAsync();
        var handler = new UpdateWorkspaceComplianceCommandHandler(_context, _publisher);
        await handler.Handle(Compliance(), CancellationToken.None);

        await handler.Handle(Compliance(), CancellationToken.None);

        Assert.Equal(2, (await _context.WorkspaceSettings.SingleAsync()).ProfileVersion);
        Assert.Single(TestSupport.Outbox(_context, InteropTypes.WorkspaceProfileUpdated));
    }

    private async Task AddFacilityAsync()
    {
        _context.Facilities.Add(new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Metro Clinic Main",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        });
        await _context.SaveChangesAsync();
    }

    [Theory]
    [InlineData("Ana Reyes", "dpo@metro.ph", "https://metro.ph/privacy", true)]
    [InlineData(null, null, null, true)]
    [InlineData("Ana Reyes", null, null, true)]
    [InlineData(null, "dpo@metro.ph", null, false)]
    [InlineData("Ana Reyes", "not-an-email", null, false)]
    [InlineData("Ana Reyes", "dpo@metro.ph", "http://metro.ph/privacy", false)]
    [InlineData("Ana Reyes", "dpo@metro.ph", "https://localhost/privacy", false)]
    [InlineData("A", null, null, false)]
    public void Compliance_Validator(string? name, string? email, string? url, bool valid)
    {
        var result = new UpdateWorkspaceComplianceCommandValidator().Validate(Compliance(name, email, url));
        Assert.Equal(valid, result.IsValid);
    }

    [Fact]
    public async Task Profile_ExposesDpoAndPrivacyNotice()
    {
        await new UpdateWorkspaceComplianceCommandHandler(_context, _publisher).Handle(Compliance(), CancellationToken.None);

        var profile = await new GetWorkspaceProfileQueryHandler(_context).Handle(new GetWorkspaceProfileQuery(Slug), CancellationToken.None);

        Assert.Equal("Ana Reyes", profile!.DpoName);
        Assert.Equal("dpo@metro.ph", profile.DpoEmail);
        Assert.Equal("https://metro.ph/privacy", profile.PrivacyNoticeUrl);
    }

    [Fact]
    public async Task SettingsDto_IncludesSecurityAndCompliance()
    {
        await new UpdateWorkspaceSecurityCommandHandler(_context).Handle(Security(true, 20, "metro.ph"), CancellationToken.None);
        await new UpdateWorkspaceComplianceCommandHandler(_context, _publisher).Handle(Compliance(), CancellationToken.None);

        var dto = await new GetWorkspaceSettingsQueryHandler(_context).Handle(new GetWorkspaceSettingsQuery(Slug), CancellationToken.None);

        Assert.True(dto!.Security.RequireMfa);
        Assert.Equal(20, dto.Security.IdleTimeoutMinutes);
        Assert.Equal(["metro.ph"], dto.Security.AllowedInviteDomains);
        Assert.Equal("Ana Reyes", dto.Compliance.DpoName);
    }

    // ---- Facility deployment ---------------------------------------------------------------

    private Facility SeedFacility(Guid? tenantId = null, string name = "Metro Lab")
    {
        var facility = new Facility
        {
            TenantId = tenantId ?? _tenantId,
            Name = name,
            Slug = name.ToLowerInvariant().Replace(' ', '-'),
            FacilityType = FacilityType.Laboratory,
            Status = FacilityStatus.Active
        };
        _context.Facilities.Add(facility);
        _context.SaveChanges();
        return facility;
    }

    [Fact]
    public async Task Deployment_OnPremise_StoresNormalizedUrl_AndAudits()
    {
        var facility = SeedFacility();
        var handler = new UpdateFacilityDeploymentCommandHandler(_context, new Mock<IHubOnboardingService>().Object);

        var result = await handler.Handle(
            new UpdateFacilityDeploymentCommand(Slug, Actor, facility.Id, FacilityDeploymentMode.OnPremise, " https://lab.hospital.local/ "),
            CancellationToken.None);

        Assert.Equal(FacilityDeploymentMode.OnPremise, result.DeploymentMode);
        Assert.Equal("https://lab.hospital.local", result.ConsoleBaseUrl);
        Assert.Equal("facilities", (await _context.WorkspaceAuditEntries.SingleAsync()).Section);
    }

    [Fact]
    public async Task Deployment_BackToSharedCloud_ClearsUrl()
    {
        var facility = SeedFacility();
        var handler = new UpdateFacilityDeploymentCommandHandler(_context, new Mock<IHubOnboardingService>().Object);
        await handler.Handle(new UpdateFacilityDeploymentCommand(Slug, Actor, facility.Id, FacilityDeploymentMode.OnPremise, "https://lab.hospital.local"), CancellationToken.None);

        var result = await handler.Handle(new UpdateFacilityDeploymentCommand(Slug, Actor, facility.Id, FacilityDeploymentMode.SharedCloud, null), CancellationToken.None);

        Assert.Equal(FacilityDeploymentMode.SharedCloud, result.DeploymentMode);
        Assert.Null(result.ConsoleBaseUrl);
    }

    [Fact]
    public async Task Deployment_OtherTenantsFacility_IsNotFound()
    {
        var otherTenant = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = otherTenant, TenantSlug = "other", Name = "Other", OwnerId = "x", Email = "o@o.ph" });
        _context.SaveChanges();
        var foreign = SeedFacility(otherTenant, "Foreign Lab");

        await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.NotFoundException>(() =>
            new UpdateFacilityDeploymentCommandHandler(_context, new Mock<IHubOnboardingService>().Object).Handle(
                new UpdateFacilityDeploymentCommand(Slug, Actor, foreign.Id, FacilityDeploymentMode.OnPremise, "https://lab.hospital.local"),
                CancellationToken.None));
    }

    [Theory]
    [InlineData(FacilityDeploymentMode.OnPremise, "https://clinic.hospital.local", true)]
    [InlineData(FacilityDeploymentMode.OnPremise, "https://10.0.0.5:8443", true)]
    [InlineData(FacilityDeploymentMode.OnPremise, "http://clinic.hospital.local", false)]
    [InlineData(FacilityDeploymentMode.OnPremise, "https://user:pw@clinic.hospital.local", false)]
    [InlineData(FacilityDeploymentMode.OnPremise, "https://clinic.hospital.local/?x=1", false)]
    [InlineData(FacilityDeploymentMode.OnPremise, "https://clinic.hospital.local/#frag", false)]
    [InlineData(FacilityDeploymentMode.OnPremise, "not a url", false)]
    [InlineData(FacilityDeploymentMode.OnPremise, null, false)]
    [InlineData(FacilityDeploymentMode.SharedCloud, null, true)]
    [InlineData(FacilityDeploymentMode.SharedCloud, "https://clinic.hospital.local", false)]
    public void Deployment_Validator(FacilityDeploymentMode mode, string? url, bool valid)
    {
        var cmd = new UpdateFacilityDeploymentCommand(Slug, Actor, Guid.NewGuid(), mode, url);
        Assert.Equal(valid, new UpdateFacilityDeploymentCommandValidator().Validate(cmd).IsValid);
    }

    [Fact]
    public void ResolveConsoleUrl_ExplicitAddressWinsOverGeneratedSubdomain_OnlyWhenActive()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Facility:BaseDomain"] = "clinicez.example" })
            .Build();
        var id = Guid.NewGuid();

        Assert.Equal("https://lab.hospital.local",
            GetFacilitiesQueryHandler.ResolveConsoleUrl(config, FacilityType.Laboratory, FacilityStatus.Active, id, "metro-lab", Slug, "https://lab.hospital.local"));
        Assert.Equal("https://metro-lab.lab.clinicez.example",
            GetFacilitiesQueryHandler.ResolveConsoleUrl(config, FacilityType.Laboratory, FacilityStatus.Active, id, "metro-lab", Slug));
        Assert.Null(
            GetFacilitiesQueryHandler.ResolveConsoleUrl(config, FacilityType.Laboratory, FacilityStatus.Suspended, id, "metro-lab", Slug, "https://lab.hospital.local"));
    }

    [Fact]
    public async Task GetFacilities_ReturnsDeploymentFields_AndOverrideConsoleUrl()
    {
        var facility = SeedFacility();
        await new UpdateFacilityDeploymentCommandHandler(_context, new Mock<IHubOnboardingService>().Object).Handle(
            new UpdateFacilityDeploymentCommand(Slug, Actor, facility.Id, FacilityDeploymentMode.OnPremise, "https://lab.hospital.local"),
            CancellationToken.None);

        var list = await new GetFacilitiesQueryHandler(_context, new ConfigurationBuilder().Build())
            .Handle(new GetFacilitiesQuery(Slug), CancellationToken.None);

        var dto = Assert.Single(list);
        Assert.Equal(FacilityDeploymentMode.OnPremise, dto.DeploymentMode);
        Assert.Equal("https://lab.hospital.local", dto.ConsoleBaseUrl);
        Assert.Equal("https://lab.hospital.local", dto.ConsoleUrl);
    }
}
