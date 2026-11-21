using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Notifications;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Notifications;

public class PortalPasswordResetTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly RecordingEmailSender _emailSender = new();
    private readonly FakeClerkPasswordService _clerkPasswordService = new();
    private readonly Guid _roleId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string FrontendUrl = "https://portal.clinicez.test";

    private sealed class FakeClerkPasswordService : IClerkPasswordService
    {
        public List<(string? ClerkUserId, string Email, string NewPassword)> Calls { get; } = new();

        public Task SetUserPasswordAsync(
            string? clerkUserId,
            string email,
            string newPassword,
            CancellationToken cancellationToken = default)
        {
            Calls.Add((clerkUserId, email, newPassword));
            return Task.CompletedTask;
        }
    }

    public PortalPasswordResetTests()
    {
        _context = TestSupport.NewContext();

        _context.AdminRoles.Add(new AdminRole
        {
            Id = _roleId,
            Name = "Support Staff",
            Description = "Support role",
            Permissions = new List<string> { "view:tenants" },
            CreatedAt = DateTime.UtcNow
        });

        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            Name = "Sunrise Medical Group",
            TenantSlug = "sunrise",
            OwnerId = "user_owner_1",
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

    private INotificationService NotificationService =>
        new TestNotificationService(new EmailDispatchJob(new EmailTemplateRenderer(), _emailSender, NullLogger<EmailDispatchJob>.Instance));

    [Fact]
    public async Task ResetAdminUserPassword_EmailMode_GeneratesTokenAndDispatchesEmail()
    {
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin1@clinicez.com",
            FullName = "Admin One",
            RoleId = _roleId,
            ClerkUserId = "user_admin_1",
            Status = AdminUserStatus.Active,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = new ResetAdminUserPasswordCommandHandler(
            _context,
            NotificationService,
            UrlProvider,
            TimeProvider.System,
            _clerkPasswordService
        );

        var result = await handler.Handle(
            new ResetAdminUserPasswordCommand(admin.Id, TemporaryPassword: null, SendResetEmail: true, GenerateResetLink: false),
            CancellationToken.None
        );

        Assert.True(result.EmailSent);
        Assert.NotNull(result.ResetToken);
        Assert.StartsWith(ResetAdminUserPasswordCommandHandler.PasswordResetTokenPrefix, result.ResetToken);
        Assert.Contains($"/reset-password/{result.ResetToken}", result.ResetUrl);

        var mail = Assert.Single(_emailSender.Sent);
        Assert.Equal("admin1@clinicez.com", mail.To);
        Assert.Contains(result.ResetToken, mail.HtmlBody);

        var reload = await _context.AdminUsers.FindAsync(admin.Id);
        Assert.Equal(AdminUserStatus.Active, reload!.Status);
        Assert.Equal(result.ResetToken, reload.InvitationToken);
    }

    [Fact]
    public async Task ResetAdminUserPassword_DirectPasswordMode_UpdatesClerkAndSendsNoEmail()
    {
        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin2@clinicez.com",
            FullName = "Admin Two",
            RoleId = _roleId,
            ClerkUserId = "user_admin_2",
            Status = AdminUserStatus.Active,
            IsActive = true,
            InvitationToken = "pwdreset_old",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = new ResetAdminUserPasswordCommandHandler(
            _context,
            NotificationService,
            UrlProvider,
            TimeProvider.System,
            _clerkPasswordService
        );

        var result = await handler.Handle(
            new ResetAdminUserPasswordCommand(admin.Id, TemporaryPassword: "TempPass#2026", SendResetEmail: false, GenerateResetLink: false),
            CancellationToken.None
        );

        Assert.False(result.EmailSent);
        Assert.Null(result.ResetToken);
        Assert.Equal("TempPass#2026", result.TemporaryPassword);
        Assert.Empty(_emailSender.Sent);

        var call = Assert.Single(_clerkPasswordService.Calls);
        Assert.Equal("user_admin_2", call.ClerkUserId);
        Assert.Equal("TempPass#2026", call.NewPassword);

        var reload = await _context.AdminUsers.FindAsync(admin.Id);
        Assert.Null(reload!.InvitationToken);
        Assert.Null(reload.InvitationExpiresAt);
    }

    [Fact]
    public async Task ResetStaffMemberPassword_LinkMode_GeneratesTokenWithoutEmail()
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            UserId = "user_staff_1",
            FullName = "Dr. Elena Cruz",
            Email = "elena@sunrise.ph",
            Role = WorkspaceMemberRole.Admin,
            Status = MemberStatus.Active,
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new ResetStaffMemberPasswordCommandHandler(
            _context,
            NotificationService,
            UrlProvider,
            TimeProvider.System,
            _clerkPasswordService
        );

        var result = await handler.Handle(
            new ResetStaffMemberPasswordCommand("sunrise", member.Id, TemporaryPassword: null, SendResetEmail: false, GenerateResetLink: true),
            CancellationToken.None
        );

        Assert.False(result.EmailSent);
        Assert.NotNull(result.ResetToken);
        Assert.StartsWith(ResetAdminUserPasswordCommandHandler.PasswordResetTokenPrefix, result.ResetToken);
        Assert.Empty(_emailSender.Sent);
    }

    [Fact]
    public async Task CompletePortalPasswordReset_ValidToken_UpdatesClerkPasswordAndClearsToken()
    {
        const string token = "pwdreset_11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            UserId = "user_staff_99",
            FullName = "Carlos Mendoza",
            Email = "carlos@sunrise.ph",
            Role = WorkspaceMemberRole.Billing,
            Status = MemberStatus.Active,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var queryHandler = new GetPortalPasswordResetDetailsQueryHandler(_context, TimeProvider.System);
        var details = await queryHandler.Handle(new GetPortalPasswordResetDetailsQuery(token), CancellationToken.None);

        Assert.Equal("Carlos Mendoza", details.FullName);
        Assert.Equal("carlos@sunrise.ph", details.Email);
        Assert.Equal("Sunrise Medical Group", details.ScopeName);
        Assert.False(details.IsExpired);

        var completeHandler = new CompletePortalPasswordResetCommandHandler(
            _context,
            TimeProvider.System,
            _clerkPasswordService
        );

        var success = await completeHandler.Handle(
            new CompletePortalPasswordResetCommand(token, "NewStrongPass!99"),
            CancellationToken.None
        );

        Assert.True(success);
        var call = Assert.Single(_clerkPasswordService.Calls);
        Assert.Equal("user_staff_99", call.ClerkUserId);
        Assert.Equal("NewStrongPass!99", call.NewPassword);

        var reload = await _context.WorkspaceMembers.FindAsync(member.Id);
        Assert.Null(reload!.InvitationToken);
        Assert.Null(reload.InvitationExpiresAt);
    }
}
