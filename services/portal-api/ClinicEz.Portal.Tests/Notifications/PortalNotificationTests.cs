using System;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
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

    public PortalNotificationTests()
    {
        _context = TestSupport.NewContext();
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    [Fact]
    public async Task PortalNotification_CanBePersisted_AndQueriesRespectUserAndUnreadFilters()
    {
        // Arrange
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
            UserId = null, // Broadcast to tenant
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
            UserId = _userB, // For user B
            Title = "Staff Invitation",
            Body = "Welcome to the clinic",
            Category = "Staff",
            Severity = "Info",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.PortalNotifications.AddRange(n1, n2, n3);
        await _context.SaveChangesAsync();

        // Act - Query for User A
        var userAQuery = _context.PortalNotifications
            .Where(n => !n.IsDeleted && (n.UserId == null || n.UserId == _userA));

        var unreadCount = await userAQuery.CountAsync(n => !n.IsRead);
        var notifications = await userAQuery
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();

        // Assert
        Assert.Equal(2, unreadCount); // n1 and n2
        Assert.Equal(2, notifications.Count);
        Assert.Contains(notifications, n => n.Id == n1.Id);
        Assert.Contains(notifications, n => n.Id == n2.Id);
        Assert.DoesNotContain(notifications, n => n.Id == n3.Id);
    }

    [Fact]
    public async Task MarkPortalNotificationRead_UpdatesReadStatusAndTimestamp()
    {
        // Arrange
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

        // Act
        var target = await _context.PortalNotifications.FirstOrDefaultAsync(x => x.Id == n.Id);
        Assert.NotNull(target);

        target!.IsRead = true;
        target.ReadAt = DateTime.UtcNow;
        target.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Assert
        var reloaded = await _context.PortalNotifications.FindAsync(n.Id);
        Assert.NotNull(reloaded);
        Assert.True(reloaded!.IsRead);
        Assert.NotNull(reloaded.ReadAt);
    }

    [Fact]
    public async Task MarkAllPortalNotificationsRead_MarksOnlyTargetUserAndBroadcast()
    {
        // Arrange
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

        // Act - Mark all read for User A
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

        // Assert
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
}

