using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

/// <summary>
/// Empirical challenge tests authored by Challenger 2 for Milestone 1:
/// Platform Users & Admin Invitations.
/// Stress-tests boundary conditions, token validation, unauthenticated route isolation,
/// state transitions, and authorization invariants.
/// </summary>
public class AdminUserInvitationChallengerTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _roleId = Guid.NewGuid();
    private const string RoleName = "Platform Administrator";
    private const string FrontendUrl = "https://portal.clinicez.test";

    public AdminUserInvitationChallengerTests()
    {
        _context = TestSupport.NewContext();

        _context.AdminRoles.Add(new AdminRole
        {
            Id = _roleId,
            Name = RoleName,
            Description = "Full administrative platform governance",
            Permissions = new List<string> { "manage:admins", "view:analytics" },
            CreatedAt = DateTime.UtcNow
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private FixedFrontendUrl UrlProvider => new(FrontendUrl);

    // =========================================================================
    // 1. BOUNDARY CONDITIONS ON TOKENS
    // =========================================================================

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task GetAdminInvitationDetails_EmptyOrNullToken_ReturnsNull(string? token)
    {
        var handler = new GetAdminInvitationDetailsQueryHandler(_context, TimeProvider.System);
        var result = await handler.Handle(new GetAdminInvitationDetailsQuery(token!), CancellationToken.None);
        Assert.Null(result);
    }

    [Theory]
    [InlineData("mc-2026-0001")]
    [InlineData("ref-2026-0001")]
    [InlineData("rx-2026-0001")]
    [InlineData("lab-2026-0001")]
    [InlineData("sec-sha256-abcdef123456")]
    public async Task GetAdminInvitationDetails_MismatchedClinicalDocumentToken_ReturnsNull(string mismatchedToken)
    {
        var handler = new GetAdminInvitationDetailsQueryHandler(_context, TimeProvider.System);
        var result = await handler.Handle(new GetAdminInvitationDetailsQuery(mismatchedToken), CancellationToken.None);
        Assert.Null(result);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task AcceptAdminInvitation_EmptyOrNullToken_ThrowsKeyNotFoundException(string? token)
    {
        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token!, "user_clerk_123"), CancellationToken.None)
        );
        Assert.Contains("required", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetAdminInvitationDetails_NonExistentToken_ReturnsNull()
    {
        var handler = new GetAdminInvitationDetailsQueryHandler(_context, TimeProvider.System);
        var result = await handler.Handle(
            new GetAdminInvitationDetailsQuery("non_existent_token_0123456789abcdef"),
            CancellationToken.None
        );
        Assert.Null(result);
    }

    [Fact]
    public async Task AcceptAdminInvitation_NonExistentToken_ThrowsKeyNotFoundException()
    {
        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            handler.Handle(
                new AcceptAdminInvitationCommand("non_existent_token_0123456789abcdef", "user_clerk_123"),
                CancellationToken.None
            )
        );
        Assert.Contains("not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AcceptAdminInvitation_TokenCaseInsensitive_Succeeds()
    {
        var rawToken = "abcdef0123456789abcdef0123456789";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "case@clinicez.com",
            FullName = "Case Test",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = rawToken.ToLowerInvariant(),
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        // Send UPPERCASE token
        var result = await handler.Handle(
            new AcceptAdminInvitationCommand(rawToken.ToUpperInvariant(), "user_clerk_case", "case@clinicez.com"),
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal(AdminUserStatus.Active, result.Status);
        Assert.Equal("user_clerk_case", result.ClerkUserId);
    }

    [Fact]
    public async Task AcceptAdminInvitation_TokenWithSurroundingWhitespace_TrimsAndSucceeds()
    {
        var rawToken = "whitespace_token_test_12345";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "trim@clinicez.com",
            FullName = "Trim Test",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = rawToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        var result = await handler.Handle(
            new AcceptAdminInvitationCommand($"   {rawToken}   ", "user_clerk_trim", "trim@clinicez.com"),
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal(AdminUserStatus.Active, result.Status);
    }

    // =========================================================================
    // 2. EXPIRATION & REVOCATION BOUNDARIES
    // =========================================================================

    [Fact]
    public async Task AcceptAdminInvitation_OneSecondBeforeExpiry_Succeeds()
    {
        var token = "boundary_token_valid";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "validboundary@clinicez.com",
            FullName = "Valid Boundary",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddSeconds(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var result = await handler.Handle(
            new AcceptAdminInvitationCommand(token, "user_clerk_boundary", "validboundary@clinicez.com"),
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal(AdminUserStatus.Active, result.Status);
    }

    [Fact]
    public async Task AcceptAdminInvitation_OneSecondAfterExpiry_ThrowsExpiredException()
    {
        var token = "boundary_token_expired";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "expiredboundary@clinicez.com",
            FullName = "Expired Boundary",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddSeconds(-2),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_boundary"), CancellationToken.None)
        );

        Assert.Contains("expired", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AcceptAdminInvitation_BothExpiredAndRevoked_RevokedTakesPrecedence()
    {
        var token = "both_revoked_and_expired";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "both@clinicez.com",
            FullName = "Both Revoked and Expired",
            RoleId = _roleId,
            Status = AdminUserStatus.Revoked,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_both"), CancellationToken.None)
        );

        // Revoked check runs before expired check
        Assert.Contains("revoked", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // =========================================================================
    // 3. AUTHENTICATION & IDENTITY BINDING
    // =========================================================================

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task AcceptAdminInvitation_MissingClerkUserId_ThrowsInvalidOperationException(string? clerkUserId)
    {
        var token = "auth_missing_clerk";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "noclerk@clinicez.com",
            FullName = "No Clerk",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, clerkUserId!), CancellationToken.None)
        );

        Assert.Contains("identity is required", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AcceptAdminInvitation_ValidAcceptance_SetsAllLifecycleTimestampsAndStatus()
    {
        var token = "lifecycle_audit_token";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "lifecycle@clinicez.com",
            FullName = "Audit Lifecycle",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddHours(-1),
            CreatedBy = "Admin Lead"
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var result = await handler.Handle(
            new AcceptAdminInvitationCommand(token, "user_clerk_lifecycle", "lifecycle@clinicez.com"),
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal("user_clerk_lifecycle", result.ClerkUserId);
        Assert.Equal(AdminUserStatus.Active, result.Status);
        Assert.Equal("Active", result.DisplayStatus);
        Assert.True(result.IsActive);
        Assert.NotNull(result.JoinedAt);
        Assert.NotNull(result.UpdatedAt);

        var dbUser = await _context.AdminUsers.FindAsync(user.Id);
        Assert.NotNull(dbUser);
        Assert.Equal("user_clerk_lifecycle", dbUser.ClerkUserId);
        Assert.Equal(AdminUserStatus.Active, dbUser.Status);
        Assert.True(dbUser.IsActive);
        Assert.Equal(dbUser.FullName, dbUser.UpdatedBy);
    }

    [Fact]
    public async Task AcceptAdminInvitation_AlreadyActiveUser_DifferentClerkId_Rejected()
    {
        var token = "hijack_attempt_token";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "legitimate@clinicez.com",
            FullName = "Legitimate Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Active,
            ClerkUserId = "user_clerk_legitimate_owner",
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        // Imposter tries to bind their ClerkUserId to this token
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_imposter"), CancellationToken.None)
        );

        Assert.Contains("already been accepted", ex.Message, StringComparison.OrdinalIgnoreCase);

        // Verify the original ClerkUserId was not overwritten
        var dbUser = await _context.AdminUsers.FindAsync(user.Id);
        Assert.Equal("user_clerk_legitimate_owner", dbUser!.ClerkUserId);
    }

    // =========================================================================
    // 4. SUSPENDED ACCOUNT ADVERSARIAL STRESS TEST
    // =========================================================================

    [Fact]
    public async Task AcceptAdminInvitation_SuspendedAccountWithToken_ExploresBehavior()
    {
        // Adversarial scenario:
        // A user was created/invited or was active, but an admin suspended them.
        // What does AcceptAdminInvitationCommand do if the token is presented while suspended?
        var token = "suspended_account_token";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspended_target@clinicez.com",
            FullName = "Suspended Target",
            RoleId = _roleId,
            Status = AdminUserStatus.Suspended,
            ClerkUserId = "user_clerk_suspended_target",
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = false,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        // Attempting to accept on a suspended account must strictly throw InvalidOperationException
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(
                new AcceptAdminInvitationCommand(token, "user_clerk_suspended_target"),
                CancellationToken.None
            )
        );
        Assert.Contains("suspended", ex.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("This administrative account is suspended.", ex.Message);

        var dbUser = await _context.AdminUsers.FindAsync(user.Id);
        Assert.Equal(AdminUserStatus.Suspended, dbUser!.Status);
        Assert.False(dbUser.IsActive);
    }

    [Fact]
    public async Task ResendAdminInvitation_SuspendedAccount_ThrowsInvalidOperationException()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspended_challenger@clinicez.com",
            FullName = "Suspended Challenger Target",
            RoleId = _roleId,
            Status = AdminUserStatus.Suspended,
            ClerkUserId = "user_clerk_suspended_challenger",
            InvitationToken = "suspended_token_123",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = false,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new ResendAdminInvitationCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl),
            UrlProvider,
            TimeProvider.System
        );

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new ResendAdminInvitationCommand(user.Id, "Super Admin"), CancellationToken.None)
        );

        Assert.Contains("suspended", ex.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Cannot resend invitation for a suspended account.", ex.Message);

        var dbUser = await _context.AdminUsers.FindAsync(user.Id);
        Assert.Equal(AdminUserStatus.Suspended, dbUser!.Status);
        Assert.False(dbUser.IsActive);
    }
}
