using System;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Notifications;

public class PortalNotificationTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantA = Guid.NewGuid();
    private readonly Guid _tenantB = Guid.NewGuid();
    private readonly string _userA = "user_clerk_aaa";
    private readonly string _userB = "user_clerk_bbb";
    private readonly string _userOutsider = "user_clerk_outsider";

    public PortalNotificationTests()
    {
        _context = TestSupport.NewContext();
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    private static DefaultHttpContext CreateHttpContextForUser(string? userId)
    {
        var ctx = new DefaultHttpContext();
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var identity = new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.NameIdentifier, userId) },
                authenticationType: "TestAuth");
            ctx.User = new ClaimsPrincipal(identity);
        }
        return ctx;
    }

    private async Task SeedTwoWorkspacesAsync()
    {
        _context.Tenants.AddRange(
            new Tenant
            {
                Id = _tenantA,
                OwnerId = _userA,
                Name = "Alpha Clinic",
                TenantSlug = "alpha-clinic",
                Email = "owner@alpha.test"
            },
            new Tenant
            {
                Id = _tenantB,
                OwnerId = _userB,
                Name = "Bravo Clinic",
                TenantSlug = "bravo-clinic",
                Email = "owner@bravo.test"
            });

        await _context.SaveChangesAsync();
    }

    [Fact]
    public async Task PortalNotification_CanBePersisted_AndQueriesRespectUserAndUnreadFilters()
    {
        var n1 = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = _userA,
            Title = "License Renewal",
            Body = "Your license is renewing soon",
            Category = "Billing",
            Severity = "Warning",
            IsRead = false,
            CreatedAt = DateTime.UtcNow.AddHours(-2)
        };

        var n2 = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = null,
            Title = "System Maintenance",
            Body = "Scheduled downtime tonight",
            Category = "System",
            Severity = "Info",
            IsRead = false,
            CreatedAt = DateTime.UtcNow.AddHours(-1)
        };

        var n3 = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = _userB,
            Title = "Staff Invitation",
            Body = "Welcome to the clinic",
            Category = "Staff",
            Severity = "Info",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.PortalNotifications.AddRange(n1, n2, n3);
        await _context.SaveChangesAsync();

        var userAQuery = _context.PortalNotifications
            .Where(n => !n.IsDeleted && (n.UserId == null || n.UserId == _userA));

        var unreadCount = await userAQuery.CountAsync(n => !n.IsRead);
        var notifications = await userAQuery
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();

        Assert.Equal(2, unreadCount);
        Assert.Equal(2, notifications.Count);
        Assert.Contains(notifications, n => n.Id == n1.Id);
        Assert.Contains(notifications, n => n.Id == n2.Id);
        Assert.DoesNotContain(notifications, n => n.Id == n3.Id);
    }

    [Fact]
    public async Task MarkPortalNotificationRead_UpdatesReadStatusAndTimestamp()
    {
        var n = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = _userA,
            Title = "Billing Payment Received",
            Body = "Invoice #1234 has been paid",
            Category = "Billing",
            Severity = "Info",
            IsRead = false,
            CreatedAt = DateTime.UtcNow.AddMinutes(-30)
        };

        _context.PortalNotifications.Add(n);
        await _context.SaveChangesAsync();

        var target = await _context.PortalNotifications.FirstOrDefaultAsync(x => x.Id == n.Id);
        Assert.NotNull(target);

        target!.IsRead = true;
        target.ReadAt = DateTime.UtcNow;
        target.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var reloaded = await _context.PortalNotifications.FindAsync(n.Id);
        Assert.NotNull(reloaded);
        Assert.True(reloaded!.IsRead);
        Assert.NotNull(reloaded.ReadAt);
    }

    [Fact]
    public async Task MarkAllPortalNotificationsRead_MarksOnlyTargetUserAndBroadcast()
    {
        var n1 = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = _userA,
            Title = "Alert 1",
            Body = "Body 1",
            Category = "System",
            Severity = "Info",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        var n2 = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = null,
            Title = "Alert 2",
            Body = "Body 2",
            Category = "System",
            Severity = "Info",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        var nOther = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = _userB,
            Title = "Alert B",
            Body = "Body B",
            Category = "System",
            Severity = "Info",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.PortalNotifications.AddRange(n1, n2, nOther);
        await _context.SaveChangesAsync();

        var unread = await _context.PortalNotifications
            .Where(n => !n.IsDeleted && !n.IsRead && (n.UserId == null || n.UserId == _userA))
            .ToListAsync();

        foreach (var item in unread)
        {
            item.IsRead = true;
            item.ReadAt = DateTime.UtcNow;
            item.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();

        var item1 = await _context.PortalNotifications.FindAsync(n1.Id);
        var item2 = await _context.PortalNotifications.FindAsync(n2.Id);
        var itemOther = await _context.PortalNotifications.FindAsync(nOther.Id);

        Assert.NotNull(item1);
        Assert.NotNull(item2);
        Assert.NotNull(itemOther);
        Assert.True(item1!.IsRead);
        Assert.True(item2!.IsRead);
        Assert.False(itemOther!.IsRead);
    }

    [Fact]
    public async Task GetNotificationsEndpoint_EnforcesStrictTenantIsolationOnBroadcastAndPersonalAlerts()
    {
        await SeedTwoWorkspacesAsync();

        var alphaBroadcast = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = null,
            Title = "Alpha Broadcast",
            Body = "Alpha-only broadcast",
            Category = "System",
            Severity = "Warning",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };
        var bravoBroadcast = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantB,
            UserId = null,
            Title = "Bravo Broadcast",
            Body = "Bravo-only broadcast",
            Category = "Billing",
            Severity = "Critical",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.PortalNotifications.AddRange(alphaBroadcast, bravoBroadcast);
        await _context.SaveChangesAsync();

        // User B (owner of Bravo only) must NEVER see Alpha's broadcast notification
        var resB = await NotificationEndpoints.GetNotificationsAsync(
            null,
            CreateHttpContextForUser(_userB),
            _context,
            CancellationToken.None);

        var okB = Assert.IsType<Ok<ApiResponse<PortalNotificationListDto>>>(resB);
        Assert.NotNull(okB.Value?.Data);
        Assert.Single(okB.Value!.Data!.Items);
        Assert.Equal(bravoBroadcast.Id, okB.Value.Data.Items[0].Id);
        Assert.Equal(1, okB.Value.Data.UnreadCount);

        // User B requesting ?tenantSlug=alpha-clinic must receive 403 Forbid
        var forbidB = await NotificationEndpoints.GetNotificationsAsync(
            "alpha-clinic",
            CreateHttpContextForUser(_userB),
            _context,
            CancellationToken.None);
        Assert.IsType<ForbidHttpResult>(forbidB);

        // Outsider with zero workspace memberships receives empty list
        var resOutsider = await NotificationEndpoints.GetNotificationsAsync(
            null,
            CreateHttpContextForUser(_userOutsider),
            _context,
            CancellationToken.None);
        var okOutsider = Assert.IsType<Ok<ApiResponse<PortalNotificationListDto>>>(resOutsider);
        Assert.Empty(okOutsider.Value!.Data!.Items);
        Assert.Equal(0, okOutsider.Value.Data.UnreadCount);
    }

    [Fact]
    public async Task GetNotificationsEndpoint_AllowsActiveWorkspaceMembers_AndScopesMultiWorkspaceByTenantSlug()
    {
        await SeedTwoWorkspacesAsync();

        // Make _userA also an Active WorkspaceMember of _tenantB, plus a Suspended member check
        _context.WorkspaceMembers.Add(new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantB,
            UserId = _userA,
            Email = "owner@alpha.test",
            FullName = "Dr. Alpha",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Active
        });

        var nAlpha = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = null,
            Title = "Alpha Alert",
            Body = "Alpha body",
            IsRead = false
        };
        var nBravo = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantB,
            UserId = null,
            Title = "Bravo Alert",
            Body = "Bravo body",
            IsRead = false
        };
        _context.PortalNotifications.AddRange(nAlpha, nBravo);
        await _context.SaveChangesAsync();

        // Scoped to bravo-clinic: returns only Bravo Alert
        var bravoScoped = await NotificationEndpoints.GetNotificationsAsync(
            "bravo-clinic",
            CreateHttpContextForUser(_userA),
            _context,
            CancellationToken.None);
        var okBravo = Assert.IsType<Ok<ApiResponse<PortalNotificationListDto>>>(bravoScoped);
        Assert.Single(okBravo.Value!.Data!.Items);
        Assert.Equal(nBravo.Id, okBravo.Value.Data.Items[0].Id);

        // MarkAllAsRead scoped to alpha-clinic only marks Alpha Alert read, leaving Bravo Alert unread
        var markAlphaAll = await NotificationEndpoints.MarkAllAsReadAsync(
            "alpha-clinic",
            CreateHttpContextForUser(_userA),
            _context,
            CancellationToken.None);
        var okMarkAlpha = Assert.IsType<Ok<ApiResponse<int>>>(markAlphaAll);
        Assert.Equal(1, okMarkAlpha.Value!.Data);

        Assert.True((await _context.PortalNotifications.FindAsync(nAlpha.Id))!.IsRead);
        Assert.False((await _context.PortalNotifications.FindAsync(nBravo.Id))!.IsRead);
    }

    [Fact]
    public async Task MarkAsReadAndMarkAllAsReadEndpoints_PreventCrossTenantAndCrossUserIdor()
    {
        await SeedTwoWorkspacesAsync();

        // Make _userB an active member of _tenantA as well, to test same-tenant cross-user IDOR
        _context.WorkspaceMembers.Add(new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = _userB,
            Email = "userb@alpha.test",
            FullName = "Nurse Bravo",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Active
        });

        var alphaPersonalForUserA = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = _userA,
            Title = "Private MFA Warning",
            Body = "Personal to User A",
            IsRead = false
        };
        var alphaBroadcast = new PortalNotification
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA,
            UserId = null,
            Title = "Alpha Broadcast",
            Body = "Team notice",
            IsRead = false
        };
        _context.PortalNotifications.AddRange(alphaPersonalForUserA, alphaBroadcast);
        await _context.SaveChangesAsync();

        // 1. Same-tenant User B cannot mark User A's personal notification as read
        var idorSameTenant = await NotificationEndpoints.MarkAsReadAsync(
            alphaPersonalForUserA.Id,
            CreateHttpContextForUser(_userB),
            _context,
            CancellationToken.None);
        Assert.IsType<NotFound<ApiResponse<bool>>>(idorSameTenant);
        Assert.False((await _context.PortalNotifications.FindAsync(alphaPersonalForUserA.Id))!.IsRead);

        // 2. Cross-tenant outsider cannot mark Alpha broadcast notification as read
        var idorCrossTenant = await NotificationEndpoints.MarkAsReadAsync(
            alphaBroadcast.Id,
            CreateHttpContextForUser(_userOutsider),
            _context,
            CancellationToken.None);
        Assert.IsType<NotFound<ApiResponse<bool>>>(idorCrossTenant);
        Assert.False((await _context.PortalNotifications.FindAsync(alphaBroadcast.Id))!.IsRead);

        // 3. Outsider calling MarkAllAsReadAsync mutates 0 records
        var outsiderReadAll = await NotificationEndpoints.MarkAllAsReadAsync(
            null,
            CreateHttpContextForUser(_userOutsider),
            _context,
            CancellationToken.None);
        var okOutsider = Assert.IsType<Ok<ApiResponse<int>>>(outsiderReadAll);
        Assert.Equal(0, okOutsider.Value!.Data);
        Assert.False((await _context.PortalNotifications.FindAsync(alphaBroadcast.Id))!.IsRead);

        // 4. Authorized User A CAN mark their own notification as read
        var validMark = await NotificationEndpoints.MarkAsReadAsync(
            alphaPersonalForUserA.Id,
            CreateHttpContextForUser(_userA),
            _context,
            CancellationToken.None);
        Assert.IsType<Ok<ApiResponse<bool>>>(validMark);
        Assert.True((await _context.PortalNotifications.FindAsync(alphaPersonalForUserA.Id))!.IsRead);
    }
}
