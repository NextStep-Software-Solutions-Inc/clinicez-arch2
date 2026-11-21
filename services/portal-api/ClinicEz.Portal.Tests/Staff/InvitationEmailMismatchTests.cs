using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Auth;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Staff;

public class InvitationEmailMismatchTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Mock<IClerkMetadataSync> _clerkSyncMock = new();
    private readonly Mock<IClerkUserLookup> _clerkLookupMock = new();
    private readonly IFrontendUrlProvider _urlProvider;
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _adminRoleId = Guid.NewGuid();
    private const string TenantSlug = "nextstep";

    public InvitationEmailMismatchTests()
    {
        _context = TestSupport.NewContext();
        var urlMock = new Mock<IFrontendUrlProvider>();
        urlMock.Setup(u => u.GetBaseUrl()).Returns("https://dev.clinicez.net");
        _urlProvider = urlMock.Object;

        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "NextStep Workspace",
            OwnerId = "clerk_justine_admin",
            Email = "justinemae@clinicez.net",
            FirstName = "Justine Mae",
            LastName = "Tabasan",
            StaffAccountsCount = 1,
            CreatedAt = DateTime.UtcNow
        });

        _context.WorkspaceMembers.Add(new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            UserId = "clerk_justine_admin",
            Email = "justinemae@clinicez.net",
            FullName = "Justine Mae Tabasan",
            Role = WorkspaceMemberRole.Owner,
            Status = MemberStatus.Active,
            JoinedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        });

        _context.AdminRoles.Add(new AdminRole
        {
            Id = _adminRoleId,
            Name = "Content Writer",
            Description = "Editorial & blog governance",
            Permissions = new List<string> { "manage:blog" }
        });

        _context.AdminUsers.Add(new AdminUser
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "clerk_justine_admin",
            Email = "justinemae@clinicez.net",
            FullName = "Justine Mae Tabasan",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Active,
            IsActive = true,
            JoinedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        });

        _context.SaveChanges();
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task WorkspaceInvitation_Scenario1_ExistingMemberDifferentEmail_ThrowsMismatchNotAlreadyMember_AndKeepsInvitePending()
    {
        var token = TokenGenerator.GenerateSecureToken(32);
        var invited = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "marianne.rivera@clinicez.net",
            FullName = "Marianne Rivera",
            Role = WorkspaceMemberRole.Admin,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "clerk_justine_admin"
        };
        _context.WorkspaceMembers.Add(invited);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context, _clerkSyncMock.Object, TimeProvider.System, _clerkLookupMock.Object);

        // Signed-in workspace admin opens Marianne's invitation link
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(
                new AcceptInvitationCommand(token, "clerk_justine_admin", "justinemae@clinicez.net"),
                CancellationToken.None));

        Assert.Equal(InvitationEmailVerifier.EmailMismatchMessage, ex.Message);

        var dbInvited = await _context.WorkspaceMembers.FindAsync(invited.Id);
        Assert.NotNull(dbInvited);
        Assert.Equal(MemberStatus.Invited, dbInvited.Status);
        Assert.Null(dbInvited.UserId);
        Assert.Null(dbInvited.JoinedAt);
        _clerkSyncMock.Verify(c => c.SyncAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);

        // Intended recipient subsequently signs in and accepts successfully
        var accepted = await handler.Handle(
            new AcceptInvitationCommand(token, "clerk_marianne", "Marianne.Rivera@clinicez.net"),
            CancellationToken.None);

        Assert.Equal(TenantSlug, accepted.TenantSlug);
        Assert.Equal(MemberStatus.Active, (await _context.WorkspaceMembers.FindAsync(invited.Id))!.Status);
        Assert.Equal("clerk_marianne", (await _context.WorkspaceMembers.FindAsync(invited.Id))!.UserId);
    }

    [Fact]
    public async Task WorkspaceInvitation_NonMemberDifferentEmail_BlocksHijackAndRemainsPending()
    {
        var token = TokenGenerator.GenerateSecureToken(32);
        var invited = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "marianne.rivera@clinicez.net",
            FullName = "Marianne Rivera",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(invited);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context, _clerkSyncMock.Object, TimeProvider.System, _clerkLookupMock.Object);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(
                new AcceptInvitationCommand(token, "clerk_outsider_999", "outsider@otherclinic.ph"),
                CancellationToken.None));

        Assert.Equal(InvitationEmailVerifier.EmailMismatchMessage, ex.Message);

        var dbInvited = await _context.WorkspaceMembers.FindAsync(invited.Id);
        Assert.Equal(MemberStatus.Invited, dbInvited!.Status);
        Assert.Null(dbInvited.UserId);
    }

    [Fact]
    public async Task AdminInvitation_Scenario2_ExistingAdminDifferentEmail_BlocksAutoActivationAndKeepsInvitePending()
    {
        var token = TokenGenerator.GenerateSecureToken(32);
        var joanna = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "joanna.mallari@clinicez.net",
            FullName = "Joanna Mallari",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Invited,
            IsActive = true,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Justine Mae Tabasan"
        };
        _context.AdminUsers.Add(joanna);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System, _clerkLookupMock.Object);

        // Signed-in Super Admin opens Joanna's invitation link
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(
                new AcceptAdminInvitationCommand(token, "clerk_justine_admin", "justinemae@clinicez.net"),
                CancellationToken.None));

        Assert.Equal(InvitationEmailVerifier.EmailMismatchMessage, ex.Message);

        var dbJoanna = await _context.AdminUsers.FindAsync(joanna.Id);
        Assert.NotNull(dbJoanna);
        Assert.Equal(AdminUserStatus.Invited, dbJoanna.Status);
        Assert.Null(dbJoanna.ClerkUserId);
        Assert.Null(dbJoanna.JoinedAt);

        // Joanna subsequently signs in with the intended email and accepts cleanly
        var accepted = await handler.Handle(
            new AcceptAdminInvitationCommand(token, "clerk_joanna_1", "  JOANNA.MALLARI@CLINICEZ.NET  "),
            CancellationToken.None);

        Assert.Equal(AdminUserStatus.Active, accepted.Status);
        Assert.Equal("clerk_joanna_1", accepted.ClerkUserId);
        Assert.NotNull(accepted.JoinedAt);
    }

    [Fact]
    public async Task BothWorkflows_MissingEmailClaimsAndEmptyClerkLookup_FailClosed()
    {
        _clerkLookupMock
            .Setup(x => x.GetVerifiedEmailsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<string>());

        var wsToken = TokenGenerator.GenerateSecureToken(32);
        _context.WorkspaceMembers.Add(new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "target.ws@clinicez.net",
            FullName = "Target WS",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = wsToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        });

        var adminToken = TokenGenerator.GenerateSecureToken(32);
        _context.AdminUsers.Add(new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "target.admin@clinicez.net",
            FullName = "Target Admin",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = adminToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        });
        await _context.SaveChangesAsync();

        var wsHandler = new AcceptInvitationCommandHandler(_context, _clerkSyncMock.Object, TimeProvider.System, _clerkLookupMock.Object);
        var adminHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System, _clerkLookupMock.Object);

        var wsEx = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            wsHandler.Handle(new AcceptInvitationCommand(wsToken, "clerk_no_email"), CancellationToken.None));
        Assert.Equal(InvitationEmailVerifier.EmailMismatchMessage, wsEx.Message);

        var adminEx = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            adminHandler.Handle(new AcceptAdminInvitationCommand(adminToken, "clerk_no_email"), CancellationToken.None));
        Assert.Equal(InvitationEmailVerifier.EmailMismatchMessage, adminEx.Message);
    }

    [Fact]
    public async Task SecondaryVerifiedEmailViaClerkLookup_PermitsLegitimateRecipientWhenPrimaryDiffers()
    {
        _clerkLookupMock
            .Setup(x => x.GetVerifiedEmailsAsync("clerk_multi_email_user", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { "primary@personal.com", "invited.secondary@clinicez.net" });

        var token = TokenGenerator.GenerateSecureToken(32);
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "invited.secondary@clinicez.net",
            FullName = "Multi Email Admin",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System, _clerkLookupMock.Object);

        // JWT carried only primary@personal.com, but authoritative Clerk lookup confirms invited.secondary@clinicez.net
        var result = await handler.Handle(
            new AcceptAdminInvitationCommand(token, "clerk_multi_email_user", "primary@personal.com"),
            CancellationToken.None);

        Assert.Equal(AdminUserStatus.Active, result.Status);
        Assert.Equal("clerk_multi_email_user", result.ClerkUserId);
    }

    [Fact]
    public async Task AdminInvitation_AlreadyLinkedClerkUserId_RejectsDuplicateAdminBinding()
    {
        var token = TokenGenerator.GenerateSecureToken(32);
        var duplicateTarget = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "justine.alias@clinicez.net",
            FullName = "Justine Alias",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(duplicateTarget);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System, _clerkLookupMock.Object);

        // Even if Clerk account holds both emails, clerk_justine_admin is already bound to an active AdminUser
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(
                new AcceptAdminInvitationCommand(
                    token,
                    "clerk_justine_admin",
                    "justinemae@clinicez.net",
                    new[] { "justinemae@clinicez.net", "justine.alias@clinicez.net" }),
                CancellationToken.None));

        Assert.Equal("This account is already linked to an administrative profile.", ex.Message);
        Assert.Equal(AdminUserStatus.Invited, (await _context.AdminUsers.FindAsync(duplicateTarget.Id))!.Status);
    }

    [Fact]
    public async Task WorkspaceInvitation_AllowedInviteDomains_PermitsMatchedSecondaryEmailWhenPrimaryIsPersonal()
    {
        _context.WorkspaceSettings.Add(new WorkspaceSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            AllowedInviteDomains = "metro.ph",
            CreatedAt = DateTime.UtcNow
        });

        var token = TokenGenerator.GenerateSecureToken(32);
        var invited = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "marianne@metro.ph",
            FullName = "Marianne Metro",
            Role = WorkspaceMemberRole.Admin,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(invited);
        await _context.SaveChangesAsync();

        _clerkLookupMock
            .Setup(x => x.GetVerifiedEmailsAsync("clerk_marianne_multi", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { "personal@gmail.com", "marianne@metro.ph" });

        var handler = new AcceptInvitationCommandHandler(_context, _clerkSyncMock.Object, TimeProvider.System, _clerkLookupMock.Object);

        // Primary email is personal@gmail.com, but matched verified email marianne@metro.ph satisfies AllowedInviteDomains
        var accepted = await handler.Handle(
            new AcceptInvitationCommand(token, "clerk_marianne_multi", "personal@gmail.com"),
            CancellationToken.None);

        Assert.Equal(TenantSlug, accepted.TenantSlug);
        Assert.Equal(MemberStatus.Active, (await _context.WorkspaceMembers.FindAsync(invited.Id))!.Status);
    }

    [Fact]
    public async Task WorkspaceInvitation_AllowedInviteDomains_BlocksClerkResolvedEmailOutsideTightenedAllowList()
    {
        _context.WorkspaceSettings.Add(new WorkspaceSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            AllowedInviteDomains = "clinicez.net",
            CreatedAt = DateTime.UtcNow
        });

        var token = TokenGenerator.GenerateSecureToken(32);
        var invited = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "contractor@external.org",
            FullName = "External Contractor",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(invited);
        await _context.SaveChangesAsync();

        _clerkLookupMock
            .Setup(x => x.GetVerifiedEmailsAsync("clerk_contractor", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { "contractor@external.org" });

        var handler = new AcceptInvitationCommandHandler(_context, _clerkSyncMock.Object, TimeProvider.System, _clerkLookupMock.Object);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_contractor", UserEmail: null), CancellationToken.None));

        Assert.Equal("Your email domain is not permitted to join this workspace. Contact the workspace administrator.", ex.Message);
        Assert.Equal(MemberStatus.Invited, (await _context.WorkspaceMembers.FindAsync(invited.Id))!.Status);
    }

    [Fact]
    public void ClaimEmailExtractor_ExtractsDiscreteAndJsonArrayClaimsCaseInsensitively()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.Email, "  Primary@ClinicEz.net "),
            new Claim("emails", "[\"primary@clinicez.net\", \"alias@clinicez.net\"]"),
            new Claim("email_address", "third@clinicez.net")
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        var extracted = ClaimEmailExtractor.ExtractVerifiedEmails(principal);

        Assert.Equal(3, extracted.Count);
        Assert.Contains(extracted, e => string.Equals(e, "Primary@ClinicEz.net", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(extracted, e => string.Equals(e, "alias@clinicez.net", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(extracted, e => string.Equals(e, "third@clinicez.net", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ClaimEmailExtractor_SkipsExplicitlyUnverifiedSingleClaims_AndSplitsDelimitedEmailsClaim()
    {
        var unverifiedPrincipal = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Email, "spoofed@clinicez.net"),
            new Claim("email", "spoofed@clinicez.net"),
            new Claim("email_verified", "false")
        }, "Bearer"));

        Assert.Empty(ClaimEmailExtractor.ExtractVerifiedEmails(unverifiedPrincipal));

        var delimitedPrincipal = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("emails", "first@clinicez.net, second@clinicez.net; third@clinicez.net")
        }, "Bearer"));

        var delimited = ClaimEmailExtractor.ExtractVerifiedEmails(delimitedPrincipal);
        Assert.Equal(3, delimited.Count);
        Assert.Contains(delimited, e => string.Equals(e, "first@clinicez.net", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(delimited, e => string.Equals(e, "second@clinicez.net", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(delimited, e => string.Equals(e, "third@clinicez.net", StringComparison.OrdinalIgnoreCase));
    }
}
