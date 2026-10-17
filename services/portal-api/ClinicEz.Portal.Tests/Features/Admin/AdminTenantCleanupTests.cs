using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Moq;
using System;
using System.Threading;
using System.Threading.Tasks;
using Xunit;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Portal.Tests.Features.Admin;

public class AdminTenantCleanupTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Mock<IHubOnboardingService> _hubOnboarding = new();
    private readonly Mock<ISystemSettingsService> _settingsService = new();

    public AdminTenantCleanupTests()
    {
        _settingsService.Setup(s => s.GetSettingIntAsync("Workspace:OrphanInactivityDaysThreshold", 14, It.IsAny<CancellationToken>()))
            .ReturnsAsync(14);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Tenant SeedGhostTenant(string slug = "ghost-clinic", int daysOld = 20)
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = slug,
            Name = "Ghost Clinic",
            OwnerId = "user_ghost_123",
            Email = "ghost@example.com",
            ActivePatientRecordsCount = 0,
            FacilitiesCount = 0,
            CreatedAt = DateTime.UtcNow.AddDays(-daysOld)
        };
        _context.Tenants.Add(tenant);
        _context.SaveChanges();
        return tenant;
    }

    // =========================================================================
    // 1. Preview & Invariant Inspection Tests
    // =========================================================================

    [Fact]
    public async Task CleanupPreview_ForGhostTenant_IdentifiesAsOrphanAndEligibleForPurge()
    {
        var tenant = SeedGhostTenant("old-abandoned-clinic", daysOld: 25);
        var handler = new GetTenantCleanupPreviewQueryHandler(_context, _settingsService.Object);

        var preview = await handler.Handle(new GetTenantCleanupPreviewQuery(tenant.Id), CancellationToken.None);

        Assert.True(preview.IsEligibleForPurge);
        Assert.Empty(preview.IneligibilityReasons);
        Assert.True(preview.IsOrphaned);
        Assert.NotNull(preview.OrphanReason);
        Assert.Equal(0, preview.ActivePatientRecordsCount);
        Assert.Equal(0, preview.FacilitiesCount);
    }

    [Fact]
    public async Task CleanupPreview_WhenRecentGhostTenant_NotFlaggedAsOrphanYet()
    {
        var tenant = SeedGhostTenant("fresh-abandoned-clinic", daysOld: 5);
        var handler = new GetTenantCleanupPreviewQueryHandler(_context, _settingsService.Object);

        var preview = await handler.Handle(new GetTenantCleanupPreviewQuery(tenant.Id), CancellationToken.None);

        Assert.True(preview.IsEligibleForPurge);
        Assert.False(preview.IsOrphaned); // < 14 days threshold
        Assert.Null(preview.OrphanReason);
    }

    [Fact]
    public async Task CleanupPreview_WhenClinicalPatientsExist_BlocksPurge()
    {
        var tenant = SeedGhostTenant("clinic-with-patients", daysOld: 30);
        tenant.ActivePatientRecordsCount = 5;
        _context.SaveChanges();

        var handler = new GetTenantCleanupPreviewQueryHandler(_context, _settingsService.Object);
        var preview = await handler.Handle(new GetTenantCleanupPreviewQuery(tenant.Id), CancellationToken.None);

        Assert.False(preview.IsEligibleForPurge);
        Assert.Contains(preview.IneligibilityReasons, r => r.Contains("clinical patient record", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task CleanupPreview_WhenInvoicesOrReceiptsExist_BlocksPurge()
    {
        var tenant = SeedGhostTenant("clinic-with-finance", daysOld: 30);
        _context.BillingInvoices.Add(new BillingInvoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            InvoiceNumber = "INV-2026-0001",
            XenditInvoiceId = "xendit_inv_1",
            Amount = 1500m,
            Status = InvoiceStatus.Paid
        });
        _context.SaveChanges();

        var handler = new GetTenantCleanupPreviewQueryHandler(_context, _settingsService.Object);
        var preview = await handler.Handle(new GetTenantCleanupPreviewQuery(tenant.Id), CancellationToken.None);

        Assert.False(preview.IsEligibleForPurge);
        Assert.Contains(preview.IneligibilityReasons, r => r.Contains("tax audit retention", StringComparison.OrdinalIgnoreCase));
    }

    // =========================================================================
    // 2. Admin Archive Tenant Tests
    // =========================================================================

    [Fact]
    public async Task AdminArchive_SetsArchivedAt_SuspendsFacilities_AndRevokesHub()
    {
        var tenant = SeedGhostTenant("archiving-clinic", daysOld: 10);
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Name = "Main Branch",
            Slug = "main-branch",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };
        _context.Facilities.Add(facility);
        _context.SaveChanges();

        var handler = new AdminArchiveTenantCommandHandler(_context, _hubOnboarding.Object);
        var result = await handler.Handle(new AdminArchiveTenantCommand(tenant.Id, "SuperAdmin Wave", "Inactivity Cleanup"), CancellationToken.None);

        var updatedTenant = await _context.Tenants.SingleAsync(t => t.Id == tenant.Id);
        Assert.NotNull(updatedTenant.ArchivedAt);
        Assert.Equal(FacilityStatus.Suspended, (await _context.Facilities.SingleAsync(f => f.Id == facility.Id)).Status);
        _hubOnboarding.Verify(h => h.RevokeWorkspaceAsync(tenant.Id, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AdminArchive_WhenActiveSubscriptionExists_ThrowsConflict()
    {
        var tenant = SeedGhostTenant("active-sub-clinic", daysOld: 10);
        await TestSupport.SeedSubscriptionAsync(_context, tenant.Id, SubscriptionStatus.Active);

        var handler = new AdminArchiveTenantCommandHandler(_context, _hubOnboarding.Object);

        await Assert.ThrowsAsync<ConflictException>(() =>
            handler.Handle(new AdminArchiveTenantCommand(tenant.Id, "SuperAdmin Wave"), CancellationToken.None));
    }

    // =========================================================================
    // 3. Admin Purge Tenant Tests (Zero-Data Invariant Verification)
    // =========================================================================

    [Fact]
    public async Task AdminPurge_WhenGhostTenant_SuccessfullyCascadesAndFreesSlug()
    {
        var tenant = SeedGhostTenant("free-me-slug", daysOld: 45);
        _context.WorkspaceMembers.Add(new WorkspaceMember
        {
            TenantId = tenant.Id,
            UserId = "user_ghost_123",
            FullName = "Ghost User",
            Email = "ghost@example.com"
        });
        _context.SaveChanges();

        var handler = new AdminPurgeTenantCommandHandler(_context, _hubOnboarding.Object);
        var result = await handler.Handle(new AdminPurgeTenantCommand(tenant.Id, "free-me-slug", "SuperAdmin Wave"), CancellationToken.None);

        Assert.Equal("free-me-slug", result.FreedSlug);
        Assert.Null(await _context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == tenant.Id));
        Assert.Empty(await _context.WorkspaceMembers.Where(m => m.TenantId == tenant.Id).ToListAsync());
        _hubOnboarding.Verify(h => h.RevokeWorkspaceAsync(tenant.Id, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AdminPurge_WhenSlugMismatch_ThrowsValidationException()
    {
        var tenant = SeedGhostTenant("mismatch-clinic", daysOld: 45);
        var handler = new AdminPurgeTenantCommandHandler(_context, _hubOnboarding.Object);

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.Handle(new AdminPurgeTenantCommand(tenant.Id, "wrong-slug", "SuperAdmin Wave"), CancellationToken.None));
    }

    [Fact]
    public async Task AdminPurge_WhenPatientRecordsExist_RefusesHardDeletion()
    {
        var tenant = SeedGhostTenant("protected-clinical-clinic", daysOld: 60);
        tenant.ActivePatientRecordsCount = 1; // Even 1 patient record strictly protects the tenancy
        _context.SaveChanges();

        var handler = new AdminPurgeTenantCommandHandler(_context, _hubOnboarding.Object);

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            handler.Handle(new AdminPurgeTenantCommand(tenant.Id, "protected-clinical-clinic", "SuperAdmin Wave"), CancellationToken.None));

        Assert.Contains("clinical patient records exist", ex.Message);
    }

    [Fact]
    public async Task AdminPurge_WhenInvoicesExist_RefusesHardDeletion()
    {
        var tenant = SeedGhostTenant("protected-financial-clinic", daysOld: 60);
        _context.BillingInvoices.Add(new BillingInvoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            InvoiceNumber = "INV-2026-9999",
            XenditInvoiceId = "xendit_inv_99",
            Amount = 5000m,
            Status = InvoiceStatus.Paid
        });
        _context.SaveChanges();

        var handler = new AdminPurgeTenantCommandHandler(_context, _hubOnboarding.Object);

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            handler.Handle(new AdminPurgeTenantCommand(tenant.Id, "protected-financial-clinic", "SuperAdmin Wave"), CancellationToken.None));

        Assert.Contains("financial invoices", ex.Message);
    }
}
