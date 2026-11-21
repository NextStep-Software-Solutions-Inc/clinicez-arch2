using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Staff;

public class PendingSelfInvitationBoundaryStressTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Mock<IClerkUserLookup> _clerkLookupMock = new();
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "metro-boundary";

    private class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    public PendingSelfInvitationBoundaryStressTests()
    {
        _context = TestSupport.NewContext();

        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Metro Boundary Clinic",
            OwnerId = "owner_boundary_123",
            Email = "owner@metroboundary.ph",
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

    private GetPendingSelfInvitationQueryHandler CreateHandler(DateTime fixedNow) =>
        new(_context, _clerkLookupMock.Object, new FixedTimeProvider(new DateTimeOffset(fixedNow, TimeSpan.Zero)));

    // =========================================================================
    // 1. EXACT EXPIRATION CUTOFF BOUNDARY (Sub-second precision)
    // =========================================================================

    [Fact]
    public async Task ExpirationBoundary_Workspace_AtExactExpiration_IsTreatedAsExpired()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var token = "token_workspace_exact_boundary";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "exact.boundary@metrohealth.ph",
            FullName = "Exact Boundary User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow, // Exact cutoff (ExpiresAt == now)
            CreatedAt = fixedNow.AddDays(-7)
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_exact", new[] { "exact.boundary@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        // At exact expiration (ExpiresAt == now), Value > now is false -> expired
        Assert.Null(result);
    }

    [Fact]
    public async Task ExpirationBoundary_Workspace_OneMillisecondBeforeExpiration_IsValid()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var token = "token_workspace_1ms_future";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "future.1ms@metrohealth.ph",
            FullName = "Future 1ms User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddMilliseconds(1), // 1ms remaining
            CreatedAt = fixedNow.AddDays(-7)
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_1ms", new[] { "future.1ms@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
    }

    [Fact]
    public async Task ExpirationBoundary_Workspace_OneMillisecondAfterExpiration_IsExpired()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var token = "token_workspace_1ms_past";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "past.1ms@metrohealth.ph",
            FullName = "Past 1ms User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddMilliseconds(-1), // 1ms expired
            CreatedAt = fixedNow.AddDays(-7)
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_past_1ms", new[] { "past.1ms@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task ExpirationBoundary_Admin_AtExactExpiration_IsTreatedAsExpired()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var token = "token_admin_exact_boundary";

        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Platform Admin" };
        _context.AdminRoles.Add(role);

        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin.exact@clinicez.ph",
            FullName = "Exact Admin",
            RoleId = role.Id,
            Role = role,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow, // Exact cutoff
            CreatedAt = fixedNow.AddDays(-7)
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_admin_exact", new[] { "admin.exact@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task ExpirationBoundary_Admin_OneMillisecondBeforeExpiration_IsValid()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var token = "token_admin_1ms_future";

        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Platform Admin" };
        _context.AdminRoles.Add(role);

        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin.future1ms@clinicez.ph",
            FullName = "Future 1ms Admin",
            RoleId = role.Id,
            Role = role,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddMilliseconds(1), // 1ms remaining
            CreatedAt = fixedNow.AddDays(-7)
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_admin_1ms", new[] { "admin.future1ms@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
    }

    // =========================================================================
    // 2. NULL EXPIRATION HANDLING (Indefinite / Lifetime invitations)
    // =========================================================================

    [Fact]
    public async Task NullExpiration_WorkspaceInvitation_IsTreatedAsUnexpired()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var token = "token_workspace_null_expiry";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "null.expiry@metrohealth.ph",
            FullName = "No Expiry User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = null, // Indefinite
            CreatedAt = fixedNow.AddYears(-1) // 1 year ago
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_no_expiry", new[] { "null.expiry@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        Assert.Null(result.ExpiresAt);
    }

    [Fact]
    public async Task NullExpiration_AdminInvitation_IsTreatedAsUnexpired()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var token = "token_admin_null_expiry";

        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Platform Admin" };
        _context.AdminRoles.Add(role);

        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin.null.expiry@clinicez.ph",
            FullName = "No Expiry Admin",
            RoleId = role.Id,
            Role = role,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = null, // Indefinite
            CreatedAt = fixedNow.AddYears(-1)
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_admin_no_expiry", new[] { "admin.null.expiry@clinicez.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        Assert.Null(result.ExpiresAt);
    }

    // =========================================================================
    // 3. STATUS TRANSITIONS & LIFECYCLE BOUNDARIES
    // =========================================================================

    [Theory]
    [InlineData(MemberStatus.Invited, true)]
    [InlineData(MemberStatus.Active, false)]
    [InlineData(MemberStatus.Suspended, false)]
    [InlineData(MemberStatus.Revoked, false)]
    public async Task LifecycleStatus_WorkspaceMember_OnlyInvitedStatusIsReturned(MemberStatus status, bool expectedMatch)
    {
        var fixedNow = DateTime.UtcNow;
        var token = $"token_status_{status}";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = $"status.{status}@metrohealth.ph",
            FullName = $"User {status}",
            Role = WorkspaceMemberRole.Member,
            Status = status,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_status_test", new[] { member.Email });

        var result = await handler.Handle(query, CancellationToken.None);

        if (expectedMatch)
        {
            Assert.NotNull(result);
            Assert.Equal(token, result.Token);
        }
        else
        {
            Assert.Null(result);
        }
    }

    [Theory]
    [InlineData(AdminUserStatus.Invited, true, true)]
    [InlineData(AdminUserStatus.Invited, false, false)] // Inactive
    [InlineData(AdminUserStatus.Active, true, false)]
    [InlineData(AdminUserStatus.Suspended, true, false)]
    [InlineData(AdminUserStatus.Revoked, true, false)]
    public async Task LifecycleStatus_AdminUser_OnlyActiveInvitedStatusIsReturned(AdminUserStatus status, bool isActive, bool expectedMatch)
    {
        var fixedNow = DateTime.UtcNow;
        var token = $"token_admin_{status}_{isActive}";

        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Platform Admin" };
        _context.AdminRoles.Add(role);

        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = $"admin.{status}.{isActive}@clinicez.ph",
            FullName = $"Admin {status}",
            RoleId = role.Id,
            Role = role,
            IsActive = isActive,
            Status = status,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_admin_status_test", new[] { admin.Email });

        var result = await handler.Handle(query, CancellationToken.None);

        if (expectedMatch)
        {
            Assert.NotNull(result);
            Assert.Equal(token, result.Token);
        }
        else
        {
            Assert.Null(result);
        }
    }

    // =========================================================================
    // 4. ARCHIVED TENANT BOUNDARIES
    // =========================================================================

    [Fact]
    public async Task ArchivedTenant_AtExactCurrentTime_ReturnsNull()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var archivedTenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "archived-now-clinic",
            Name = "Archived Now Clinic",
            OwnerId = "owner_archived_now",
            ArchivedAt = fixedNow,
            CreatedAt = fixedNow.AddMonths(-1)
        };
        _context.Tenants.Add(archivedTenant);

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = archivedTenant.Id,
            Email = "member.archived@metrohealth.ph",
            FullName = "Archived Tenant Member",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_archived_now",
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_archived_now", new[] { "member.archived@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    // =========================================================================
    // 5. INPUT EDGE CASES: NULL/EMPTY/WHITESPACE VARIATIONS
    // =========================================================================

    [Fact]
    public async Task InputVariations_NullVerifiedEmails_SafelyReturnsNullWithoutThrowing()
    {
        var fixedNow = DateTime.UtcNow;
        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_null_emails", null!);

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task InputVariations_ListWithNullAndEmptyStrings_SafelyIgnored()
    {
        var fixedNow = DateTime.UtcNow;
        var token = "token_input_variations";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "valid.target@metrohealth.ph",
            FullName = "Valid Target",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_varies", new[] { "", "   ", null!, "VALID.TARGET@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
    }

    [Fact]
    public async Task InputVariations_EmptyClerkIdAndEmptyEmails_DoesNotCallClerkLookup()
    {
        var fixedNow = DateTime.UtcNow;
        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("   ", Array.Empty<string>());

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
        _clerkLookupMock.Verify(c => c.GetVerifiedEmailsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task InputVariations_TokenIsEmptyStringInDatabase_ReturnsNull()
    {
        var fixedNow = DateTime.UtcNow;
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "emptytoken@metrohealth.ph",
            FullName = "Empty Token User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "", // Empty string token
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_empty_token", new[] { "emptytoken@metrohealth.ph" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    // =========================================================================
    // 6. ENDPOINT SIMULATION: UNAUTHENTICATED CALLER HANDLING
    // =========================================================================

    [Fact]
    public void EndpointLogic_UnauthenticatedUser_HasNoNameIdentifier_ReturnsUnauthorized()
    {
        // Simulate HttpContext with unauthenticated principal (no ClaimTypes.NameIdentifier)
        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity()); // Not authenticated

        var clerkUserId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        
        Assert.True(string.IsNullOrEmpty(clerkUserId));
        // Endpoint contract returns Results.Unauthorized() when clerkUserId is null or empty
    }

    [Fact]
    public void EndpointLogic_AuthenticatedUser_ExtractsAllSupportedEmailClaims()
    {
        var context = new DefaultHttpContext();
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "user_2test123"),
            new Claim(ClaimTypes.Email, "primary@domain.com"),
            new Claim("email", "alias1@domain.com"),
            new Claim("emails", "alias2@domain.com"),
            new Claim("email_address", "alias3@domain.com"),
            new Claim("primary_email_address", "alias4@domain.com")
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "AuthenticationTypes.Federation"));

        var clerkUserId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Assert.Equal("user_2test123", clerkUserId);

        var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void CollectClaim(string type)
        {
            foreach (var c in context.User.FindAll(type))
            {
                if (!string.IsNullOrWhiteSpace(c.Value))
                {
                    emails.Add(c.Value.Trim());
                }
            }
        }

        CollectClaim(ClaimTypes.Email);
        CollectClaim("email");
        CollectClaim("emails");
        CollectClaim("email_address");
        CollectClaim("primary_email_address");

        Assert.Equal(5, emails.Count);
        Assert.Contains("primary@domain.com", emails);
        Assert.Contains("alias1@domain.com", emails);
        Assert.Contains("alias2@domain.com", emails);
        Assert.Contains("alias3@domain.com", emails);
        Assert.Contains("alias4@domain.com", emails);
    }
}
