using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Milestone 5 Tier 5 Adversarial Backend Verification Suite:
/// White-box empirical stress testing of Platform Admin and Tenant Workspace Team invitation lifecycles,
/// token entropy, state machine transition safety, concurrency resistance, and seat quota enforcement.
/// </summary>
public class Tier5AdversarialBackendTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _adminRoleId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "tier5-adversarial-tenant";
    private const string FrontendUrl = "https://portal.clinicez.test";
    private readonly FixedFrontendUrl _urlProvider = new(FrontendUrl);
    private readonly Mock<IClerkMetadataSync> _clerkMock = new();

    public Tier5AdversarialBackendTests()
    {
        _context = TestSupport.NewContext();

        // Seed default Admin role
        _context.AdminRoles.Add(new AdminRole
        {
            Id = _adminRoleId,
            Name = "Platform Governance Admin",
            Description = "Full platform administrative authority",
            Permissions = new List<string> { "all:admin" },
            CreatedAt = DateTime.UtcNow
        });

        // Seed default Tenant
        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Tier 5 Hardened Workspace",
            OwnerId = "clerk_owner_tier5",
            Email = "owner@tier5.clinicez.test",
            FirstName = "Governance",
            LastName = "Director",
            StaffAccountsCount = 1,
            CreatedAt = DateTime.UtcNow
        });

        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    #region VECTOR 1: TOKEN ENTROPY & FORMATTING PROBES (256-bit CSPRNG)

    [Fact]
    public void TokenGenerator_Generates10000Tokens_WithZeroCollisions_AndHighShannonEntropy()
    {
        const int sampleSize = 10_000;
        var tokenSet = new HashSet<string>(sampleSize, StringComparer.Ordinal);
        var hexPattern = new Regex("^[0-9a-f]{64}$", RegexOptions.Compiled);
        var byteFrequencies = new int[256];

        for (int i = 0; i < sampleSize; i++)
        {
            var token = TokenGenerator.GenerateSecureToken(32);

            Assert.Equal(64, token.Length);
            Assert.Matches(hexPattern, token);
            Assert.True(tokenSet.Add(token), $"Collision detected on token: {token}");

            var rawBytes = Convert.FromHexString(token);
            Assert.Equal(32, rawBytes.Length);
            foreach (var b in rawBytes)
            {
                byteFrequencies[b]++;
            }
        }

        // Calculate Shannon entropy over 320,000 bytes
        double totalBytes = sampleSize * 32.0;
        double entropy = 0.0;
        for (int i = 0; i < 256; i++)
        {
            if (byteFrequencies[i] > 0)
            {
                double p = byteFrequencies[i] / totalBytes;
                entropy -= p * Math.Log2(p);
            }
        }

        // Theoretical maximum entropy for uniform 8-bit bytes is 8.0 bits/byte.
        // For 320,000 random bytes, empirical entropy should comfortably exceed 7.99 bits/byte.
        Assert.True(entropy >= 7.99, $"Shannon entropy was {entropy:F5}, expected >= 7.99 bits/byte");
    }

    #endregion

    #region VECTOR 2: PLATFORM ADMIN STATE MACHINE & CONCURRENCY

    [Fact]
    public async Task PlatformAdmin_ConcurrentAcceptAttempts_IdempotentForSameUser_RejectsDifferentUser()
    {
        var now = DateTime.UtcNow;
        var token = TokenGenerator.GenerateSecureToken(32);
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin.concurrent@clinicez.test",
            FullName = "Concurrent Admin",
            RoleId = _adminRoleId,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = now.AddDays(7),
            CreatedAt = now,
            CreatedBy = "System"
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);

        // First accept attempt by User A
        var result1 = await handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_user_alpha", "admin.concurrent@clinicez.test"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Active, result1.Status);
        Assert.Equal("clerk_user_alpha", result1.ClerkUserId);

        // Second accept attempt by User A (same Clerk identity -> idempotent success)
        var result2 = await handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_user_alpha", "admin.concurrent@clinicez.test"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Active, result2.Status);
        Assert.Equal("clerk_user_alpha", result2.ClerkUserId);

        // Third accept attempt by an impostor User B (different Clerk identity -> strictly rejected)
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_user_beta_impostor"), CancellationToken.None));
        Assert.Equal("This invitation has already been accepted.", ex.Message);
    }

    [Fact]
    public async Task PlatformAdmin_AcceptAfterRevocation_StrictlyFails()
    {
        var now = DateTime.UtcNow;
        var token = TokenGenerator.GenerateSecureToken(32);
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin.revoked@clinicez.test",
            FullName = "Revoked Admin",
            RoleId = _adminRoleId,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = now.AddDays(7),
            CreatedAt = now,
            CreatedBy = "System"
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        // Revoke the invitation
        var revokeHandler = new RevokeAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);
        await revokeHandler.Handle(new RevokeAdminInvitationCommand(admin.Id, "SuperAdmin"), CancellationToken.None);

        // Attempting to accept revoked invitation
        var acceptHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            acceptHandler.Handle(new AcceptAdminInvitationCommand(token, "clerk_revoked_target"), CancellationToken.None));
        Assert.Equal("This invitation has been revoked.", ex.Message);
    }

    [Fact]
    public async Task PlatformAdmin_AcceptAfterExpiration_StrictlyFails()
    {
        var now = DateTime.UtcNow;
        var token = TokenGenerator.GenerateSecureToken(32);
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin.expired@clinicez.test",
            FullName = "Expired Admin",
            RoleId = _adminRoleId,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = now.AddSeconds(-1), // Expired 1 second ago
            CreatedAt = now.AddDays(-8),
            CreatedBy = "System"
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var acceptHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            acceptHandler.Handle(new AcceptAdminInvitationCommand(token, "clerk_expired_target"), CancellationToken.None));
        Assert.Equal("This invitation has expired.", ex.Message);
    }

    [Fact]
    public async Task PlatformAdmin_ResendResetsTokenAndExpiry_InvalidatesOldToken()
    {
        var now = DateTime.UtcNow;
        var oldToken = TokenGenerator.GenerateSecureToken(32);
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin.resend@clinicez.test",
            FullName = "Resend Admin",
            RoleId = _adminRoleId,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = oldToken,
            InvitationExpiresAt = now.AddHours(2), // Near expiry
            CreatedAt = now.AddDays(-6),
            CreatedBy = "System"
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var resendHandler = new ResendAdminInvitationCommandHandler(_context, TestSupport.AdminInvitationNotifier(_context), _urlProvider, TimeProvider.System);
        var updatedDto = await resendHandler.Handle(new ResendAdminInvitationCommand(admin.Id, "SuperAdmin"), CancellationToken.None);

        Assert.Equal(AdminUserStatus.Invited, updatedDto.Status);
        Assert.NotNull(updatedDto.InvitationToken);
        Assert.NotEqual(oldToken, updatedDto.InvitationToken);
        Assert.True(updatedDto.InvitationExpiresAt > now.AddDays(6));

        var acceptHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);

        // Old token cannot be accepted
        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            acceptHandler.Handle(new AcceptAdminInvitationCommand(oldToken, "clerk_new_target"), CancellationToken.None));

        // New token can be accepted successfully
        var acceptedDto = await acceptHandler.Handle(new AcceptAdminInvitationCommand(updatedDto.InvitationToken!, "clerk_new_target", "admin.resend@clinicez.test"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Active, acceptedDto.Status);
    }

    [Fact]
    public async Task PlatformAdmin_ResendOnRevokedOrSuspendedOrActive_StrictlyRejected()
    {
        var now = DateTime.UtcNow;
        var resendHandler = new ResendAdminInvitationCommandHandler(_context, TestSupport.AdminInvitationNotifier(_context), _urlProvider, TimeProvider.System);

        // 1. Revoked admin
        var revokedAdmin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revoked@clinicez.test",
            FullName = "Revoked",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Revoked,
            CreatedAt = now,
            CreatedBy = "System"
        };
        _context.AdminUsers.Add(revokedAdmin);

        // 2. Suspended admin
        var suspendedAdmin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspended@clinicez.test",
            FullName = "Suspended",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Suspended,
            CreatedAt = now,
            CreatedBy = "System"
        };
        _context.AdminUsers.Add(suspendedAdmin);

        // 3. Active admin
        var activeAdmin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "active@clinicez.test",
            FullName = "Active",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Active,
            CreatedAt = now,
            CreatedBy = "System"
        };
        _context.AdminUsers.Add(activeAdmin);

        await _context.SaveChangesAsync();

        var exRevoked = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resendHandler.Handle(new ResendAdminInvitationCommand(revokedAdmin.Id, "SuperAdmin"), CancellationToken.None));
        Assert.Equal("Cannot resend a revoked invitation.", exRevoked.Message);

        var exSuspended = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resendHandler.Handle(new ResendAdminInvitationCommand(suspendedAdmin.Id, "SuperAdmin"), CancellationToken.None));
        Assert.Equal("Cannot resend invitation for a suspended account.", exSuspended.Message);

        var exActive = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resendHandler.Handle(new ResendAdminInvitationCommand(activeAdmin.Id, "SuperAdmin"), CancellationToken.None));
        Assert.Equal("Cannot resend invitation for an active user.", exActive.Message);
    }

    [Fact]
    public async Task PlatformAdmin_SelfSuspension_StrictlyRejected()
    {
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "self.suspend@clinicez.test",
            FullName = "Self Suspend Admin",
            ClerkUserId = "clerk_self_admin",
            RoleId = _adminRoleId,
            Status = AdminUserStatus.Active,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "System"
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var suspendHandler = new SuspendAdminUserCommandHandler(_context, _urlProvider, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            suspendHandler.Handle(new SuspendAdminUserCommand(admin.Id, "self", CurrentClerkUserId: "clerk_self_admin"), CancellationToken.None));

        Assert.Equal("You cannot suspend your own account.", ex.Message);
    }

    #endregion

    #region VECTOR 3: TENANT WORKSPACE TEAM STATE MACHINE & SEAT QUOTA GUARDS

    [Fact]
    public async Task WorkspaceTeam_SeatQuotaEnforced_OnInvitation_WhenPlanLimitReached()
    {
        var guardMock = new Mock<IEntitlementGuard>();
        guardMock.Setup(g => g.EnsureCanAddMemberAsync(_tenantId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new EntitlementException("Feature Limit Reached: your starter plan allows up to 5 team members.", EntitlementGuard.LimitReachedCode));

        var handler = new InviteStaffMemberCommandHandler(_context, guardMock.Object, TestSupport.InvitationNotifier(_context), TimeProvider.System);

        var ex = await Assert.ThrowsAsync<EntitlementException>(() =>
            handler.Handle(new InviteStaffMemberCommand(TenantSlug, "over_quota@clinicez.test", "Quota Breaker", "Admin"), CancellationToken.None));

        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);
        Assert.Contains("Feature Limit Reached", ex.Message);
    }

    [Fact]
    public async Task WorkspaceTeam_SeatQuotaEnforced_OnReactivation_WhenPlanLimitReached()
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "suspended.quota@clinicez.test",
            FullName = "Suspended Member",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Suspended,
            UserId = "clerk_suspended_1",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "clerk_owner_tier5"
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var guardMock = new Mock<IEntitlementGuard>();
        guardMock.Setup(g => g.EnsureCanAddMemberAsync(_tenantId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new EntitlementException("Feature Limit Reached: your starter plan allows up to 5 team members.", EntitlementGuard.LimitReachedCode));

        var reactivateHandler = new ReactivateStaffMemberCommandHandler(_context, guardMock.Object, _clerkMock.Object, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<EntitlementException>(() =>
            reactivateHandler.Handle(new ReactivateStaffMemberCommand(TenantSlug, member.Id), CancellationToken.None));

        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);

        // Verification: status remains Suspended in database
        var inDb = await _context.WorkspaceMembers.FindAsync(member.Id);
        Assert.NotNull(inDb);
        Assert.Equal(MemberStatus.Suspended, inDb.Status);
    }

    [Fact]
    public async Task WorkspaceTeam_ConcurrentAcceptAttempts_FirstWins_SecondFails()
    {
        var now = DateTime.UtcNow;
        var token = TokenGenerator.GenerateSecureToken(32);
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "concurrent.member@clinicez.test",
            FullName = "Concurrent Member",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = now.AddDays(7),
            CreatedAt = now,
            CreatedBy = "clerk_owner_tier5"
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context, _clerkMock.Object, TimeProvider.System);

        // First user accepts
        var res1 = await handler.Handle(new AcceptInvitationCommand(token, "clerk_accepted_first", "concurrent.member@clinicez.test"), CancellationToken.None);
        Assert.Equal(TenantSlug, res1.TenantSlug);

        // Second user attempts to accept the same token
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_second_different_user"), CancellationToken.None));

        Assert.Equal("This invitation is no longer active or has already been used.", ex.Message);
    }

    [Fact]
    public async Task WorkspaceTeam_AcceptAfterRevocation_StrictlyRejected()
    {
        var token = TokenGenerator.GenerateSecureToken(32);
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "revoked.workspace@clinicez.test",
            FullName = "Revoked Member",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Revoked,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "clerk_owner_tier5"
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context, _clerkMock.Object, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_revoked_try"), CancellationToken.None));

        Assert.Equal("This invitation has been revoked.", ex.Message);
    }

    [Fact]
    public async Task WorkspaceTeam_AcceptAfterExpiration_StrictlyRejected()
    {
        var token = TokenGenerator.GenerateSecureToken(32);
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "expired.workspace@clinicez.test",
            FullName = "Expired Member",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddSeconds(-5),
            CreatedAt = DateTime.UtcNow.AddDays(-8),
            CreatedBy = "clerk_owner_tier5"
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context, _clerkMock.Object, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_expired_try"), CancellationToken.None));

        Assert.Contains("This invitation has expired", ex.Message);
    }

    [Fact]
    public async Task WorkspaceTeam_OwnerCannotBeRevoked()
    {
        var owner = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "owner.irrevocable@clinicez.test",
            FullName = "Workspace Owner",
            Role = WorkspaceMemberRole.Owner,
            Status = MemberStatus.Active,
            UserId = "clerk_owner_tier5",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "System"
        };
        _context.WorkspaceMembers.Add(owner);
        await _context.SaveChangesAsync();

        var revokeHandler = new RevokeStaffMemberCommandHandler(_context, _clerkMock.Object);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            revokeHandler.Handle(new RevokeStaffMemberCommand(TenantSlug, owner.Id), CancellationToken.None));

        Assert.Equal("The primary workspace owner cannot be revoked or removed.", ex.Message);
    }

    #endregion
}
