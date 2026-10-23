using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Staff;

public class PendingSelfInvitationTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Mock<IClerkUserLookup> _clerkLookupMock = new();
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "metro-health";

    public PendingSelfInvitationTests()
    {
        _context = TestSupport.NewContext();

        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Metro Health Clinic",
            OwnerId = "owner_clerk_123",
            Email = "owner@metrohealth.ph",
            FirstName = "Maria",
            LastName = "Santos",
            CreatedAt = DateTime.UtcNow
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private GetPendingSelfInvitationQueryHandler CreateHandler() =>
        new(_context, _clerkLookupMock.Object, TimeProvider.System);

    [Fact]
    public async Task PendingSelf_ReturnsWorkspaceInvitation_WhenMatchingVerifiedEmail()
    {
        var token = "token_workspace_valid_123";
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "nurse.jane@metrohealth.ph",
            FullName = "Jane Doe",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_jane_123", new[] { "nurse.jane@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Workspace", result.InvitationType);
        Assert.Equal(token, result.Token);
        Assert.Equal(TenantSlug, result.TenantSlug);
        Assert.Equal("Metro Health Clinic", result.WorkspaceName);
        Assert.Equal("Member", result.Role);
        Assert.Equal("nurse.jane@metrohealth.ph", result.Email);
        Assert.Equal($"/invitations/{token}", result.RedirectUrl);
    }

    [Fact]
    public async Task PendingSelf_ReturnsAdminInvitation_WhenMatchingVerifiedEmail()
    {
        var token = "token_admin_valid_456";
        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Platform Admin" };
        _context.AdminRoles.Add(role);

        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "superadmin@clinicez.ph",
            FullName = "Super Admin",
            RoleId = role.Id,
            Role = role,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_admin_123", new[] { "superadmin@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Admin", result.InvitationType);
        Assert.Equal(token, result.Token);
        Assert.Null(result.TenantSlug);
        Assert.Equal("Platform Administration", result.WorkspaceName);
        Assert.Equal("Platform Admin", result.Role);
        Assert.Equal("superadmin@clinicez.ph", result.Email);
        Assert.Equal($"/admin/invitations/{token}", result.RedirectUrl);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenInvitationExpired()
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "expired.nurse@metrohealth.ph",
            FullName = "Expired Nurse",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_expired_123",
            InvitationExpiresAt = DateTime.UtcNow.AddHours(-1), // Expired
            CreatedAt = DateTime.UtcNow.AddDays(-8)
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_expired_123", new[] { "expired.nurse@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenInvitationRevoked()
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "revoked@metrohealth.ph",
            FullName = "Revoked User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Revoked, // Revoked
            InvitationToken = "token_revoked_123",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_revoked_123", new[] { "revoked@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenAccountSuspended()
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "suspended@metrohealth.ph",
            FullName = "Suspended User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Suspended, // Suspended
            InvitationToken = "token_suspended_123",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_suspended_123", new[] { "suspended@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenWorkspaceArchived()
    {
        var archivedTenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "archived-clinic",
            Name = "Archived Clinic",
            OwnerId = "archived_owner",
            ArchivedAt = DateTime.UtcNow.AddDays(-1), // Archived workspace
            CreatedAt = DateTime.UtcNow.AddMonths(-1)
        };
        _context.Tenants.Add(archivedTenant);

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = archivedTenant.Id,
            Email = "archived.member@metrohealth.ph",
            FullName = "Archived Member",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_archived_123",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_archived_123", new[] { "archived.member@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenAlreadyAccepted()
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "active@metrohealth.ph",
            FullName = "Active User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Active, // Already accepted/active
            UserId = "clerk_active_123",
            InvitationToken = "token_active_123",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_active_123", new[] { "active@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_MatchesAnyOfMultipleVerifiedEmails()
    {
        var token = "token_multi_verified_123";
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "work.email@metrohealth.ph",
            FullName = "Dr. Multiemails",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        // Caller presents personal, work, and secondary emails
        var query = new GetPendingSelfInvitationQuery(
            "clerk_user_multi",
            new[] { "personal@gmail.com", "work.email@metrohealth.ph", "backup@yahoo.com" }
        );

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        Assert.Equal("work.email@metrohealth.ph", result.Email);
    }

    [Fact]
    public async Task PendingSelf_CaseInsensitiveEmailMatching()
    {
        var token = "token_case_test_123";
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "Jane.Doe@MetroHealth.PH", // Mixed case in DB
            FullName = "Jane Doe",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        // Caller presents lower-case email in query
        var query = new GetPendingSelfInvitationQuery("clerk_jane_lower", new[] { "jane.doe@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
    }

    [Fact]
    public async Task PendingSelf_FallsBackToClerkLookup_WhenJwtHasNoEmailClaims()
    {
        var token = "token_clerk_fallback_123";
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "oauth.verified@metrohealth.ph",
            FullName = "OAuth User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        _clerkLookupMock
            .Setup(c => c.GetVerifiedEmailsAsync("clerk_oauth_user_999", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<string> { "oauth.verified@metrohealth.ph" });

        var handler = CreateHandler();
        // JWT has zero email claims
        var query = new GetPendingSelfInvitationQuery("clerk_oauth_user_999", Array.Empty<string>());

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        Assert.Equal("oauth.verified@metrohealth.ph", result.Email);
        _clerkLookupMock.Verify(c => c.GetVerifiedEmailsAsync("clerk_oauth_user_999", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task PendingSelf_PrioritizesWorkspaceOverAdmin_WhenBothExist()
    {
        var workspaceToken = "token_workspace_prio";
        var adminToken = "token_admin_prio";
        var commonEmail = "dual.role@metrohealth.ph";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = commonEmail,
            FullName = "Dual Role User",
            Role = WorkspaceMemberRole.Admin,
            Status = MemberStatus.Invited,
            InvitationToken = workspaceToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow.AddMinutes(-10)
        };
        _context.WorkspaceMembers.Add(member);

        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = commonEmail,
            FullName = "Dual Role Admin",
            RoleId = Guid.NewGuid(),
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = adminToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow // newer
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_dual_user", new[] { commonEmail });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Workspace", result.InvitationType);
        Assert.Equal(workspaceToken, result.Token);
    }

    [Fact]
    public async Task PendingSelf_TokenEnumerationImmunity_NeverInspectsUnverifiedEmailParameters()
    {
        // Victim has a valid invitation
        var victimToken = "victim_secret_token_123456";
        var victimMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "victim.doctor@metrohealth.ph",
            FullName = "Dr. Victim",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = victimToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(victimMember);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();

        // Attacker is authenticated with attacker@malicious.com
        // Attacker attempts to lookup pending invitations without possessing victim's verified email
        var query = new GetPendingSelfInvitationQuery("attacker_clerk_id", new[] { "attacker@malicious.com" });

        var result = await handler.Handle(query, CancellationToken.None);

        // Result MUST be null — attacker receives no information about victim's token
        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenAdminInvitationExpired()
    {
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "expired.admin@clinicez.ph",
            FullName = "Expired Admin",
            RoleId = Guid.NewGuid(),
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = "token_expired_admin",
            InvitationExpiresAt = DateTime.UtcNow.AddMinutes(-5),
            CreatedAt = DateTime.UtcNow.AddDays(-7)
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_expired_admin", new[] { "expired.admin@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenAdminInvitationRevoked()
    {
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revoked.admin@clinicez.ph",
            FullName = "Revoked Admin",
            RoleId = Guid.NewGuid(),
            IsActive = true,
            Status = AdminUserStatus.Revoked,
            InvitationToken = "token_revoked_admin",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_revoked_admin", new[] { "revoked.admin@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenAdminInvitationSuspended()
    {
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspended.admin@clinicez.ph",
            FullName = "Suspended Admin",
            RoleId = Guid.NewGuid(),
            IsActive = true,
            Status = AdminUserStatus.Suspended,
            InvitationToken = "token_suspended_admin",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_suspended_admin", new[] { "suspended.admin@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenAdminInactive()
    {
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "inactive.admin@clinicez.ph",
            FullName = "Inactive Admin",
            RoleId = Guid.NewGuid(),
            IsActive = false, // Inactive
            Status = AdminUserStatus.Invited,
            InvitationToken = "token_inactive_admin",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_inactive_admin", new[] { "inactive.admin@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenMemberTokenNullOrEmpty()
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "notoken@metrohealth.ph",
            FullName = "No Token",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = null, // null token
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_notoken", new[] { "notoken@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNewestInvitation_WhenMultiplePendingInvitationsExist()
    {
        var olderToken = "token_older_invitation";
        var newerToken = "token_newer_invitation";
        var email = "repeated.invite@metrohealth.ph";

        var olderMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = email,
            FullName = "Repeated User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = olderToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            CreatedAt = DateTime.UtcNow.AddDays(-2)
        };

        var newerMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = email,
            FullName = "Repeated User",
            Role = WorkspaceMemberRole.Billing,
            Status = MemberStatus.Invited,
            InvitationToken = newerToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow // newer
        };

        _context.WorkspaceMembers.AddRange(olderMember, newerMember);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_repeat", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(newerToken, result.Token);
        Assert.Equal("Billing", result.Role);
    }

    [Fact]
    public async Task PendingSelf_TrimsWhitespaceInVerifiedEmails()
    {
        var token = "token_whitespace_trim";
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "trim.test@metrohealth.ph",
            FullName = "Trim Test",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_trim", new[] { "   trim.test@metrohealth.ph   " });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
    }

    [Fact]
    public async Task PendingSelf_ReturnsJobProfileRole_WhenStaffMemberProfileExists()
    {
        var token = "token_doctor_profile";
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "surgeon@metrohealth.ph",
            FullName = "Dr. Surgeon",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);

        var profile = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            WorkspaceMemberId = member.Id,
            Role = "Chief Surgeon", // Custom job role
            CreatedAt = DateTime.UtcNow
        };
        _context.StaffMembers.Add(profile);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_surgeon", new[] { "surgeon@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        Assert.Equal("Chief Surgeon", result.Role);
    }

    [Fact]
    public async Task PendingSelf_ReturnsNull_WhenClerkLookupFailsOrReturnsNoEmails()
    {
        _clerkLookupMock
            .Setup(c => c.GetVerifiedEmailsAsync("clerk_no_emails", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<string>());

        var handler = CreateHandler();
        var query = new GetPendingSelfInvitationQuery("clerk_no_emails", Array.Empty<string>());

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }
}
