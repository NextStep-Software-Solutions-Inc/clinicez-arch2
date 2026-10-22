using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

public class AdminUserInvitationTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly RecordingEmailSender _emailSender = new();
    private readonly Guid _roleId = Guid.NewGuid();
    private const string RoleName = "Support Staff";
    private const string FrontendUrl = "https://portal.clinicez.test";

    public AdminUserInvitationTests()
    {
        _context = TestSupport.NewContext();

        _context.AdminRoles.Add(new AdminRole
        {
            Id = _roleId,
            Name = RoleName,
            Description = "Support and operational governance",
            Permissions = new List<string> { "view:analytics", "view:tenants" },
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

    [Fact]
    public async Task InviteAdminUser_WithEmailDelivery_CreatesInvitedUserAndEnqueuesEmail()
    {
        var handler = new InviteAdminUserCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl, _emailSender),
            UrlProvider,
            TimeProvider.System
        );

        var result = await handler.Handle(
            new InviteAdminUserCommand("newadmin@clinicez.com", "Alex Rivera", _roleId, "email", "Super Admin"),
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal("newadmin@clinicez.com", result.Email);
        Assert.Equal("Alex Rivera", result.FullName);
        Assert.Equal(AdminUserStatus.Invited, result.Status);
        Assert.Equal("Invited", result.DisplayStatus);
        Assert.True(result.IsActive);
        Assert.NotNull(result.InvitationToken);
        Assert.Equal(64, result.InvitationToken.Length); // 32 bytes hex = 64 chars
        Assert.NotNull(result.InvitationExpiresAt);
        Assert.True(result.InvitationExpiresAt.Value > DateTime.UtcNow.AddDays(6));
        Assert.Contains(result.InvitationToken, result.InviteUrl!);

        // Verify direct email dispatched
        var mail = Assert.Single(_emailSender.Sent);
        Assert.Equal("newadmin@clinicez.com", mail.To);
        Assert.Contains(result.InvitationToken, mail.HtmlBody);
        Assert.Contains(result.InvitationToken, mail.TextBody);
    }

    [Fact]
    public async Task InviteAdminUser_WithLinkOnlyDelivery_CreatesInvitedUserWithoutEnqueuingEmail()
    {
        var handler = new InviteAdminUserCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl, _emailSender),
            UrlProvider,
            TimeProvider.System
        );

        var result = await handler.Handle(
            new InviteAdminUserCommand("linkonly@clinicez.com", "Morgan Lee", _roleId, "link", "Super Admin"),
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal(AdminUserStatus.Invited, result.Status);
        Assert.Equal(64, result.InvitationToken!.Length);

        // Verify NO email was dispatched
        Assert.Empty(_emailSender.Sent);
    }

    [Fact]
    public async Task InviteAdminUser_DuplicateEmail_ThrowsInvalidOperationException()
    {
        var handler = new InviteAdminUserCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl),
            UrlProvider,
            TimeProvider.System
        );

        await handler.Handle(
            new InviteAdminUserCommand("duplicate@clinicez.com", "First User", _roleId, "link", "Super Admin"),
            CancellationToken.None
        );

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(
                new InviteAdminUserCommand("duplicate@clinicez.com", "Second User", _roleId, "link", "Super Admin"),
                CancellationToken.None
            )
        );
    }

    [Fact]
    public async Task InviteAdminUser_InvalidRole_ThrowsKeyNotFoundException()
    {
        var handler = new InviteAdminUserCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl),
            UrlProvider,
            TimeProvider.System
        );

        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            handler.Handle(
                new InviteAdminUserCommand("badrole@clinicez.com", "Test User", Guid.NewGuid(), "link", "Super Admin"),
                CancellationToken.None
            )
        );
    }

    [Fact]
    public async Task ResendAdminInvitation_PendingInvite_Regenerates256BitTokenAndResetsExpiryAndEmails()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "resend@clinicez.com",
            FullName = "Pending Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = "old-token-12345",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(1),
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-6)
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new ResendAdminInvitationCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl, _emailSender),
            UrlProvider,
            TimeProvider.System
        );

        var result = await handler.Handle(new ResendAdminInvitationCommand(user.Id, "Super Admin"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.NotEqual("old-token-12345", result.InvitationToken);
        Assert.Equal(64, result.InvitationToken!.Length);
        Assert.Equal(AdminUserStatus.Invited, result.Status);
        Assert.True(result.InvitationExpiresAt > DateTime.UtcNow.AddDays(6));

        // Verify direct email dispatched
        var mail = Assert.Single(_emailSender.Sent);
        Assert.Equal("resend@clinicez.com", mail.To);
        Assert.Contains(result.InvitationToken, mail.HtmlBody);
    }

    [Fact]
    public async Task ResendAdminInvitation_ActiveUser_ThrowsInvalidOperationException()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "active@clinicez.com",
            FullName = "Active Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Active,
            ClerkUserId = "user_clerk_123",
            IsActive = true,
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

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new ResendAdminInvitationCommand(user.Id, "Super Admin"), CancellationToken.None)
        );
    }

    [Fact]
    public async Task ResendAdminInvitation_RevokedUser_ThrowsInvalidOperationException()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revoked@clinicez.com",
            FullName = "Revoked Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Revoked,
            IsActive = true,
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

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new ResendAdminInvitationCommand(user.Id, "Super Admin"), CancellationToken.None)
        );
    }

    [Fact]
    public async Task ResendAdminInvitation_SuspendedUser_ThrowsInvalidOperationException()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspended_resend@clinicez.com",
            FullName = "Suspended Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Suspended,
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
    }

    [Fact]
    public async Task RevokeAdminInvitation_ValidUser_SetsStatusRevoked()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "torevoke@clinicez.com",
            FullName = "To Revoke",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = "token-revoke-123",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new RevokeAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var result = await handler.Handle(new RevokeAdminInvitationCommand(user.Id, "Super Admin"), CancellationToken.None);

        Assert.Equal(AdminUserStatus.Revoked, result.Status);
        Assert.Equal("Revoked", result.DisplayStatus);

        var dbUser = await _context.AdminUsers.FindAsync(user.Id);
        Assert.Equal(AdminUserStatus.Revoked, dbUser!.Status);
        Assert.Equal("Super Admin", dbUser.UpdatedBy);
    }

    [Fact]
    public async Task SuspendAdminUser_ValidUser_SetsStatusSuspendedAndIsActiveFalse()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "tosuspend@clinicez.com",
            FullName = "To Suspend",
            RoleId = _roleId,
            Status = AdminUserStatus.Active,
            ClerkUserId = "user_clerk_other",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new SuspendAdminUserCommandHandler(_context, UrlProvider, TimeProvider.System);
        var result = await handler.Handle(new SuspendAdminUserCommand(user.Id, "Super Admin", "user_clerk_caller"), CancellationToken.None);

        Assert.Equal(AdminUserStatus.Suspended, result.Status);
        Assert.False(result.IsActive);
        Assert.Equal("Suspended", result.DisplayStatus);
    }

    [Fact]
    public async Task SuspendAdminUser_SelfSuspension_ThrowsInvalidOperationException()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "self@clinicez.com",
            FullName = "Self Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Active,
            ClerkUserId = "user_clerk_self",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new SuspendAdminUserCommandHandler(_context, UrlProvider, TimeProvider.System);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new SuspendAdminUserCommand(user.Id, "Super Admin", "user_clerk_self"), CancellationToken.None)
        );
    }

    [Fact]
    public async Task ReactivateAdminUser_SuspendedUser_SetsStatusActiveAndIsActiveTrue()
    {
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "reactivate@clinicez.com",
            FullName = "Reactivated Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Suspended,
            ClerkUserId = "user_clerk_react",
            IsActive = false,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new ReactivateAdminUserCommandHandler(_context, UrlProvider, TimeProvider.System);
        var result = await handler.Handle(new ReactivateAdminUserCommand(user.Id, "Super Admin"), CancellationToken.None);

        Assert.Equal(AdminUserStatus.Active, result.Status);
        Assert.True(result.IsActive);
        Assert.Equal("Active", result.DisplayStatus);
    }

    [Fact]
    public async Task GetAdminInvitationDetails_ValidToken_ReturnsMetadata()
    {
        var token = "valid-token-hex-123456";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "details@clinicez.com",
            FullName = "Details Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new GetAdminInvitationDetailsQueryHandler(_context, TimeProvider.System);
        var result = await handler.Handle(new GetAdminInvitationDetailsQuery(token), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("details@clinicez.com", result.Email);
        Assert.Equal("Details Admin", result.FullName);
        Assert.Equal(RoleName, result.RoleName);
        Assert.False(result.IsExpired);
        Assert.False(result.IsAlreadyAccepted);
        Assert.False(result.IsRevoked);
    }

    [Fact]
    public async Task GetAdminInvitationDetails_ExpiredToken_ReturnsIsExpiredTrue()
    {
        var token = "expired-token-hex-123";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "expired@clinicez.com",
            FullName = "Expired Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-2),
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-10)
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new GetAdminInvitationDetailsQueryHandler(_context, TimeProvider.System);
        var result = await handler.Handle(new GetAdminInvitationDetailsQuery(token), CancellationToken.None);

        Assert.NotNull(result);
        Assert.True(result.IsExpired);
    }

    [Fact]
    public async Task GetAdminInvitationDetails_RevokedToken_ReturnsIsRevokedTrue()
    {
        var token = "revoked-token-hex-123";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revoked2@clinicez.com",
            FullName = "Revoked Admin 2",
            RoleId = _roleId,
            Status = AdminUserStatus.Revoked,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(2),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new GetAdminInvitationDetailsQueryHandler(_context, TimeProvider.System);
        var result = await handler.Handle(new GetAdminInvitationDetailsQuery(token), CancellationToken.None);

        Assert.NotNull(result);
        Assert.True(result.IsRevoked);
    }

    [Fact]
    public async Task GetAdminInvitationDetails_SuspendedUser_ReturnsIsRevokedAndIsSuspendedTrue()
    {
        var token = "suspended-token-hex-456";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspended_details@clinicez.com",
            FullName = "Suspended Details Admin",
            RoleId = _roleId,
            Status = AdminUserStatus.Suspended,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(2),
            IsActive = false,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new GetAdminInvitationDetailsQueryHandler(_context, TimeProvider.System);
        var result = await handler.Handle(new GetAdminInvitationDetailsQuery(token), CancellationToken.None);

        Assert.NotNull(result);
        Assert.True(result.IsRevoked);
        Assert.True(result.IsSuspended);
    }

    [Fact]
    public async Task AcceptAdminInvitation_ValidToken_LinksClerkUserAndActivates()
    {
        var token = "accept-valid-token-777";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "accept@clinicez.com",
            FullName = "Jordan Taylor",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(4),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);
        var result = await handler.Handle(
            new AcceptAdminInvitationCommand(token, "user_clerk_jordan", "accept@clinicez.com"),
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal("user_clerk_jordan", result.ClerkUserId);
        Assert.Equal(AdminUserStatus.Active, result.Status);
        Assert.Equal("Active", result.DisplayStatus);
        Assert.True(result.IsActive);
        Assert.NotNull(result.JoinedAt);

        var dbUser = await _context.AdminUsers.FindAsync(user.Id);
        Assert.Equal("user_clerk_jordan", dbUser!.ClerkUserId);
        Assert.Equal(AdminUserStatus.Active, dbUser.Status);
    }

    [Fact]
    public async Task AcceptAdminInvitation_ExpiredToken_ThrowsInvalidOperationException()
    {
        var token = "accept-expired-token";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "expiredaccept@clinicez.com",
            FullName = "Expired Accept",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-1),
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-8)
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_999"), CancellationToken.None)
        );
        Assert.Contains("expired", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AcceptAdminInvitation_RevokedToken_ThrowsInvalidOperationException()
    {
        var token = "accept-revoked-token";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revokedaccept@clinicez.com",
            FullName = "Revoked Accept",
            RoleId = _roleId,
            Status = AdminUserStatus.Revoked,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_999"), CancellationToken.None)
        );
        Assert.Contains("revoked", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AcceptAdminInvitation_SuspendedToken_ThrowsInvalidOperationException()
    {
        var token = "accept-suspended-token";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspendedaccept@clinicez.com",
            FullName = "Suspended Accept",
            RoleId = _roleId,
            Status = AdminUserStatus.Suspended,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = false,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_999"), CancellationToken.None)
        );
        Assert.Contains("suspended", ex.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("This administrative account is suspended.", ex.Message);
    }

    [Fact]
    public async Task AcceptAdminInvitation_NonInvitedStatus_ThrowsInvalidOperationException()
    {
        var token = "accept-corrupted-token";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "corrupted@clinicez.com",
            FullName = "Corrupted Status Admin",
            RoleId = _roleId,
            Status = (AdminUserStatus)999, // Non-invited / invalid status
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_999"), CancellationToken.None)
        );
        Assert.Equal("This invitation is not valid for acceptance.", ex.Message);
    }

    [Fact]
    public async Task AcceptAdminInvitation_AlreadyAccepted_IdempotentSameUser_ThrowsIfDifferent()
    {
        var token = "already-accepted-token";
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "already@clinicez.com",
            FullName = "Already Accepted",
            RoleId = _roleId,
            Status = AdminUserStatus.Active,
            ClerkUserId = "user_clerk_original",
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, UrlProvider, TimeProvider.System);

        // Same user -> idempotent success
        var idempotent = await handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_original"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Active, idempotent.Status);

        // Different user -> throws
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "user_clerk_different"), CancellationToken.None)
        );
    }

    [Fact]
    public async Task GetAdminUsers_DynamicDisplayStatus_ResolvesExpiredForPastDates()
    {
        _context.AdminUsers.AddRange(
            new AdminUser
            {
                Id = Guid.NewGuid(),
                Email = "pending@clinicez.com",
                FullName = "Pending",
                RoleId = _roleId,
                Status = AdminUserStatus.Invited,
                InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            },
            new AdminUser
            {
                Id = Guid.NewGuid(),
                Email = "expired@clinicez.com",
                FullName = "Expired",
                RoleId = _roleId,
                Status = AdminUserStatus.Invited,
                InvitationExpiresAt = DateTime.UtcNow.AddDays(-2),
                IsActive = true,
                CreatedAt = DateTime.UtcNow.AddDays(-9)
            },
            new AdminUser
            {
                Id = Guid.NewGuid(),
                Email = "active@clinicez.com",
                FullName = "Active",
                RoleId = _roleId,
                Status = AdminUserStatus.Active,
                ClerkUserId = "user_clerk_act",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            }
        );
        await _context.SaveChangesAsync();

        var handler = new GetAdminUsersQueryHandler(_context, UrlProvider, TimeProvider.System);
        var users = await handler.Handle(new GetAdminUsersQuery(), CancellationToken.None);

        var pendingUser = users.First(u => u.Email == "pending@clinicez.com");
        Assert.Equal("Invited", pendingUser.DisplayStatus);

        var expiredUser = users.First(u => u.Email == "expired@clinicez.com");
        Assert.Equal("Expired", expiredUser.DisplayStatus);

        var activeUser = users.First(u => u.Email == "active@clinicez.com");
        Assert.Equal("Active", activeUser.DisplayStatus);
    }

    [Fact]
    public async Task GetAdminMe_RejectsNonActiveUsers()
    {
        _context.AdminUsers.AddRange(
            new AdminUser
            {
                Id = Guid.NewGuid(),
                Email = "invitedme@clinicez.com",
                FullName = "Invited Me",
                RoleId = _roleId,
                Status = AdminUserStatus.Invited,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            },
            new AdminUser
            {
                Id = Guid.NewGuid(),
                Email = "suspendedme@clinicez.com",
                FullName = "Suspended Me",
                RoleId = _roleId,
                ClerkUserId = "user_clerk_susp",
                Status = AdminUserStatus.Suspended,
                IsActive = false,
                CreatedAt = DateTime.UtcNow
            }
        );
        await _context.SaveChangesAsync();

        var handler = new GetAdminMeQueryHandler(_context);

        // Try getting Me for invited user by email: must not auto-link and must return null
        var invitedResult = await handler.Handle(new GetAdminMeQuery("user_clerk_random", "invitedme@clinicez.com"), CancellationToken.None);
        Assert.Null(invitedResult);

        // Check that invited user wasn't auto-linked
        var dbInvited = await _context.AdminUsers.FirstOrDefaultAsync(u => u.Email == "invitedme@clinicez.com");
        Assert.Null(dbInvited!.ClerkUserId);

        // Try getting Me for suspended user by ClerkUserId: must return null
        var suspendedResult = await handler.Handle(new GetAdminMeQuery("user_clerk_susp", null), CancellationToken.None);
        Assert.Null(suspendedResult);
    }
}
