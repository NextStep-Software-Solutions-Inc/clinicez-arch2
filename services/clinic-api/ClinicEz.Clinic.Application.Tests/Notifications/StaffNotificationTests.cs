using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Notifications.Commands;
using ClinicEz.Clinic.Application.Features.Notifications.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.BackgroundServices;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Notifications;

public class StaffNotificationTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly Guid _otherStaffId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-test-01";
    private readonly ISieveProcessor _sieveProcessor = Substitute.For<ISieveProcessor>();
    private readonly IProductRepository _productRepo = Substitute.For<IProductRepository>();

    private ApplicationDbContext CreateInMemoryDbContext(string dbName)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.StaffId.Returns(_staffId);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    [Fact]
    public async Task GetStaffNotificationsQuery_FiltersByClinicAndRecipient_OrdersStatFirst()
    {
        var dbName = Guid.NewGuid().ToString();
        using var db = CreateInMemoryDbContext(dbName);
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.StaffId.Returns(_staffId);

        // 1. Broadcast Routine Notification (unread)
        var n1 = new ClinicStaffNotification
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            RecipientStaffId = null,
            Title = "Routine Alert",
            Body = "General update",
            Category = StaffNotificationCategory.System,
            Urgency = NotificationUrgency.Routine,
            IsRead = false,
            CreatedAt = DateTime.UtcNow.AddMinutes(-30)
        };

        // 2. Direct STAT Panic Result for this staff (unread)
        var n2 = new ClinicStaffNotification
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            RecipientStaffId = _staffId,
            Title = "CRITICAL: Potassium 6.8 mmol/L",
            Body = "STAT panic result",
            Category = StaffNotificationCategory.LabResult,
            Urgency = NotificationUrgency.Stat,
            IsRead = false,
            CreatedAt = DateTime.UtcNow.AddMinutes(-10)
        };

        // 3. Notification for OTHER staff (unread) -> should NOT be visible
        var n3 = new ClinicStaffNotification
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            RecipientStaffId = _otherStaffId,
            Title = "Private Alert Other",
            Body = "Not for current staff",
            Category = StaffNotificationCategory.Queue,
            Urgency = NotificationUrgency.Urgent,
            IsRead = false,
            CreatedAt = DateTime.UtcNow.AddMinutes(-5)
        };

        // 4. Soft-deleted notification -> should NOT be visible
        var n4 = new ClinicStaffNotification
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            RecipientStaffId = _staffId,
            Title = "Deleted Alert",
            Body = "Already deleted",
            Category = StaffNotificationCategory.System,
            Urgency = NotificationUrgency.Routine,
            IsRead = false,
            IsDeleted = true,
            CreatedAt = DateTime.UtcNow.AddMinutes(-1)
        };

        db.StaffNotifications.AddRange(n1, n2, n3, n4);
        await db.SaveChangesAsync();

        var repo = new Repository<ClinicStaffNotification>(db, _sieveProcessor);
        var handler = new GetStaffNotificationsQueryHandler(repo, clinicContext);

        // Act
        var result = await handler.Handle(new GetStaffNotificationsQuery(), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.UnreadCount.Should().Be(2); // n1 and n2
        result.HasStatAlert.Should().BeTrue(); // n2 is STAT and unread
        result.Items.Should().HaveCount(2);

        // n2 (STAT unread) must be first even though n1 was created earlier/later
        result.Items[0].Id.Should().Be(n2.Id);
        result.Items[0].Urgency.Should().Be(NotificationUrgency.Stat);
        result.Items[1].Id.Should().Be(n1.Id);
    }

    [Fact]
    public async Task MarkStaffNotificationReadCommand_MarksSingleNotificationRead()
    {
        var dbName = Guid.NewGuid().ToString();
        using var db = CreateInMemoryDbContext(dbName);
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.StaffId.Returns(_staffId);

        var notification = new ClinicStaffNotification
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            RecipientStaffId = _staffId,
            Title = "Urgent Queue Alert",
            Body = "Queue depth threshold reached",
            Category = StaffNotificationCategory.Queue,
            Urgency = NotificationUrgency.Urgent,
            IsRead = false,
            CreatedAt = DateTime.UtcNow.AddMinutes(-5)
        };

        db.StaffNotifications.Add(notification);
        await db.SaveChangesAsync();

        var repo = new Repository<ClinicStaffNotification>(db, _sieveProcessor);
        var uow = new UnitOfWork(db, _sieveProcessor, _productRepo);
        var handler = new MarkStaffNotificationReadCommandHandler(repo, clinicContext, uow);

        // Act
        var success = await handler.Handle(new MarkStaffNotificationReadCommand(notification.Id), CancellationToken.None);

        // Assert
        success.Should().BeTrue();

        var updated = await db.StaffNotifications.FindAsync(notification.Id);
        updated!.IsRead.Should().BeTrue();
        updated.ReadAt.Should().NotBeNull();
    }

    [Fact]
    public async Task MarkAllStaffNotificationsReadCommand_MarksAllUnreadForStaff()
    {
        var dbName = Guid.NewGuid().ToString();
        using var db = CreateInMemoryDbContext(dbName);
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.StaffId.Returns(_staffId);

        var n1 = new ClinicStaffNotification
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            RecipientStaffId = _staffId,
            Title = "Alert 1",
            Body = "Body 1",
            Category = StaffNotificationCategory.System,
            Urgency = NotificationUrgency.Routine,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        var n2 = new ClinicStaffNotification
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            RecipientStaffId = null, // broadcast
            Title = "Alert 2",
            Body = "Body 2",
            Category = StaffNotificationCategory.System,
            Urgency = NotificationUrgency.Routine,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        var nOther = new ClinicStaffNotification
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            RecipientStaffId = _otherStaffId,
            Title = "Other Staff Alert",
            Body = "Not mine",
            Category = StaffNotificationCategory.System,
            Urgency = NotificationUrgency.Routine,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        db.StaffNotifications.AddRange(n1, n2, nOther);
        await db.SaveChangesAsync();

        var repo = new Repository<ClinicStaffNotification>(db, _sieveProcessor);
        var uow = new UnitOfWork(db, _sieveProcessor, _productRepo);
        var handler = new MarkAllStaffNotificationsReadCommandHandler(repo, clinicContext, uow);

        // Act
        var markedCount = await handler.Handle(new MarkAllStaffNotificationsReadCommand(), CancellationToken.None);

        // Assert
        markedCount.Should().Be(2);

        var updated1 = await db.StaffNotifications.FindAsync(n1.Id);
        var updated2 = await db.StaffNotifications.FindAsync(n2.Id);
        var other = await db.StaffNotifications.FindAsync(nOther.Id);

        updated1!.IsRead.Should().BeTrue();
        updated2!.IsRead.Should().BeTrue();
        other!.IsRead.Should().BeFalse(); // Untouched
    }

    [Fact]
    public async Task NotificationRetentionCleanupBackgroundService_PurgesExpiredReadNotifications_AndRespectsRetentionPolicy()
    {
        var dbName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();

        var clinic1Id = Guid.NewGuid();
        var clinic2Id = Guid.NewGuid(); // Indefinite retention (0 days)
        var clinic3Id = Guid.NewGuid();

        services.AddScoped<ApplicationDbContext>(_ =>
        {
            var clinicContext = Substitute.For<IClinicContext>();
            clinicContext.ClinicId.Returns(clinic1Id);
            clinicContext.TenantId.Returns(_tenantId);

            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
                .Build();

            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(databaseName: dbName)
                .Options;

            return new ApplicationDbContext(options, config, clinicContext);
        });

        var serviceProvider = services.BuildServiceProvider();

        using (var setupScope = serviceProvider.CreateScope())
        {
            var db = setupScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Setup Clinic Settings
            db.ClinicSettings.AddRange(
                new ClinicSettings
                {
                    ClinicId = clinic1Id,
                    TenantId = _tenantId,
                    ClinicName = "Clinic 1 - 14 Days Retention",
                    StaffNotificationRetentionDays = 14,
                    IsDeleted = false
                },
                new ClinicSettings
                {
                    ClinicId = clinic2Id,
                    TenantId = _tenantId,
                    ClinicName = "Clinic 2 - Indefinite Retention",
                    StaffNotificationRetentionDays = 0, // 0 = Keep indefinitely
                    IsDeleted = false
                },
                new ClinicSettings
                {
                    ClinicId = clinic3Id,
                    TenantId = _tenantId,
                    ClinicName = "Clinic 3 - 7 Days Retention",
                    StaffNotificationRetentionDays = 7,
                    IsDeleted = false
                }
            );

            // Clinic 1 Notifications:
            // Expired: Read 20 days ago (threshold 14) -> should be purged
            db.StaffNotifications.Add(new ClinicStaffNotification
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic1Id,
                TenantId = _tenantId,
                Title = "Old read alert",
                Body = "Read 20 days ago",
                Category = StaffNotificationCategory.LabResult,
                Urgency = NotificationUrgency.Routine,
                IsRead = true,
                ReadAt = DateTime.UtcNow.AddDays(-20),
                IsDeleted = false,
                CreatedAt = DateTime.UtcNow.AddDays(-21)
            });

            // Active: Read 5 days ago (threshold 14) -> should NOT be purged
            db.StaffNotifications.Add(new ClinicStaffNotification
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic1Id,
                TenantId = _tenantId,
                Title = "Recent read alert",
                Body = "Read 5 days ago",
                Category = StaffNotificationCategory.LabResult,
                Urgency = NotificationUrgency.Routine,
                IsRead = true,
                ReadAt = DateTime.UtcNow.AddDays(-5),
                IsDeleted = false,
                CreatedAt = DateTime.UtcNow.AddDays(-6)
            });

            // Active: Unread created 30 days ago -> should NEVER be purged because unread
            db.StaffNotifications.Add(new ClinicStaffNotification
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic1Id,
                TenantId = _tenantId,
                Title = "Old unread alert",
                Body = "Still unread",
                Category = StaffNotificationCategory.LabResult,
                Urgency = NotificationUrgency.Stat,
                IsRead = false,
                IsDeleted = false,
                CreatedAt = DateTime.UtcNow.AddDays(-30)
            });

            // Clinic 2 Notifications:
            // Indefinite retention: Read 100 days ago -> should NOT be purged
            db.StaffNotifications.Add(new ClinicStaffNotification
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic2Id,
                TenantId = _tenantId,
                Title = "Very old read alert",
                Body = "Read 100 days ago",
                Category = StaffNotificationCategory.System,
                Urgency = NotificationUrgency.Routine,
                IsRead = true,
                ReadAt = DateTime.UtcNow.AddDays(-100),
                IsDeleted = false,
                CreatedAt = DateTime.UtcNow.AddDays(-105)
            });

            // Clinic 3 Notifications:
            // Expired: Read 10 days ago (threshold 7) -> should be purged
            db.StaffNotifications.Add(new ClinicStaffNotification
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic3Id,
                TenantId = _tenantId,
                Title = "Expired 10 days ago alert",
                Body = "Threshold is 7",
                Category = StaffNotificationCategory.Queue,
                Urgency = NotificationUrgency.Routine,
                IsRead = true,
                ReadAt = DateTime.UtcNow.AddDays(-10),
                IsDeleted = false,
                CreatedAt = DateTime.UtcNow.AddDays(-12)
            });

            await db.SaveChangesAsync();
        }

        var backgroundService = new NotificationRetentionCleanupBackgroundService(
            serviceProvider,
            NullLogger<NotificationRetentionCleanupBackgroundService>.Instance);

        // Act
        var purgedCount = await backgroundService.RunCleanupCycleAsync(CancellationToken.None);

        // Assert
        purgedCount.Should().Be(2); // 1 from Clinic 1, 1 from Clinic 3

        using (var verifyScope = serviceProvider.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // All remaining active notifications
            var activeNotifications = await db.StaffNotifications
                .IgnoreQueryFilters()
                .Where(n => !n.IsDeleted)
                .ToListAsync();

            activeNotifications.Should().HaveCount(3);
            activeNotifications.Should().Contain(n => n.ClinicId == clinic1Id && n.IsRead && n.Title == "Recent read alert");
            activeNotifications.Should().Contain(n => n.ClinicId == clinic1Id && !n.IsRead && n.Title == "Old unread alert");
            activeNotifications.Should().Contain(n => n.ClinicId == clinic2Id && n.IsRead && n.Title == "Very old read alert");

            // Verify soft-deletion metadata on purged notifications
            var softDeleted = await db.StaffNotifications
                .IgnoreQueryFilters()
                .Where(n => n.IsDeleted)
                .ToListAsync();

            softDeleted.Should().HaveCount(2);
            softDeleted.Should().OnlyContain(n => n.DeletedBy == "NotificationRetentionCleanupWorker" && n.DeletedAt != null);
        }
    }
}
