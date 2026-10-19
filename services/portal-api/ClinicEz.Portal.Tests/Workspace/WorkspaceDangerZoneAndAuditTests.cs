using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Tenants.Queries.GetTenantByOwner;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;
using Moq;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Workspace;

public class WorkspaceDangerZoneAndAuditTests : IDisposable
{
    private const string Slug = "metro-clinic";
    private const string OwnerId = "clerk_owner_111";
    private static readonly WorkspaceActor OwnerActor = new(OwnerId, "Juan Dela Cruz", "Owner");

    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();

    public WorkspaceDangerZoneAndAuditTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new ApplicationDbContext(options);
        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = Slug,
            Name = "Metro Clinic",
            OwnerId = OwnerId,
            Email = "owner@metro.ph",
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }


    private WorkspaceMember SeedMember(string userId, string name, WorkspaceMemberRole role = WorkspaceMemberRole.Admin, MemberStatus status = MemberStatus.Active)
    {
        var member = new WorkspaceMember
        {
            TenantId = _tenantId,
            UserId = userId,
            Email = $"{userId}@metro.ph",
            FullName = name,
            Role = role,
            Status = status
        };
        _context.WorkspaceMembers.Add(member);
        _context.SaveChanges();
        return member;
    }

    private Task<ArchiveWorkspaceResultDto> Archive(string confirm = Slug, WorkspaceActor? actor = null) =>
        new ArchiveWorkspaceCommandHandler(_context, new Mock<IHubOnboardingService>().Object).Handle(
            new ArchiveWorkspaceCommand(Slug, actor ?? OwnerActor, confirm), CancellationToken.None);
    // ---- Archive ---------------------------------------------------------------------------

    private void SeedFacility(FacilityStatus status, string name)
    {
        _context.Facilities.Add(new Facility { TenantId = _tenantId, Name = name, Slug = name.ToLowerInvariant(), FacilityType = FacilityType.Clinic, Status = status });
        _context.SaveChanges();
    }

    [Fact]
    public async Task Archive_SetsTimestamp_SuspendsFacilities_AndAudits()
    {
        SeedFacility(FacilityStatus.Active, "clinic-a");
        SeedFacility(FacilityStatus.Provisioning, "lab-b");
        SeedFacility(FacilityStatus.Suspended, "already");

        var result = await Archive();

        Assert.Equal(2, result.FacilitiesSuspended);
        Assert.NotNull((await _context.Tenants.SingleAsync()).ArchivedAt);
        Assert.All(_context.Facilities, f => Assert.Equal(FacilityStatus.Suspended, f.Status));
        var audit = await _context.WorkspaceAuditEntries.SingleAsync();
        Assert.Equal("workspace", audit.Section);
        Assert.Equal("archived", audit.Action);
    }

    [Fact]
    public async Task Archive_RefusedWhileSubscriptionActive_AndWhenAlreadyArchived_AndForNonOwner()
    {
        var subscription = await TestSupport.SeedSubscriptionAsync(_context, _tenantId, SubscriptionStatus.Active);
        await Assert.ThrowsAsync<ConflictException>(() => Archive());
        Assert.Null((await _context.Tenants.SingleAsync()).ArchivedAt);

        subscription.Status = SubscriptionStatus.Cancelled;
        await _context.SaveChangesAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() => Archive(actor: new WorkspaceActor("someone_else", "X", "Admin")));

        await Archive();
        await Assert.ThrowsAsync<ConflictException>(() => Archive());
    }

    [Fact]
    public void Archive_Validator_RequiresSlugConfirmation()
    {
        var validator = new ArchiveWorkspaceCommandValidator();
        Assert.False(validator.Validate(new ArchiveWorkspaceCommand(Slug, OwnerActor, "nope")).IsValid);
        Assert.True(validator.Validate(new ArchiveWorkspaceCommand(Slug, OwnerActor, Slug)).IsValid);
    }

    [Fact]
    public async Task ArchivedWorkspace_ReportsArchivedStatusToOwnerAndMembers()
    {
        SeedMember("clerk_admin_222", "Maria Santos");
        var handler = new GetTenantByOwnerQueryHandler(_context);
        Assert.Equal("Active", (await handler.Handle(new GetTenantByOwnerQuery(OwnerId, Slug), CancellationToken.None))!.Status);

        await Archive();

        Assert.Equal("Archived", (await handler.Handle(new GetTenantByOwnerQuery(OwnerId, Slug), CancellationToken.None))!.Status);
        Assert.Equal("Archived", (await handler.Handle(new GetTenantByOwnerQuery("clerk_admin_222", Slug), CancellationToken.None))!.Status);
    }

    // ---- Audit log -------------------------------------------------------------------------

    private async Task SeedAudit(int count, string section = "general")
    {
        for (var i = 0; i < count; i++)
        {
            _context.WorkspaceAuditEntries.Add(new WorkspaceAuditEntry
            {
                TenantId = _tenantId,
                ActorUserId = OwnerId,
                ActorName = "Juan",
                ActorRole = "Owner",
                Section = section,
                Action = "updated",
                ChangesJson = $"{{\"field{i}\":{{\"old\":\"a\",\"new\":\"b\"}}}}",
                CreatedAt = new DateTime(2026, 10, 9, 1, 0, 0, DateTimeKind.Utc).AddMinutes(i)
            });
        }
        await _context.SaveChangesAsync();
    }

    [Fact]
    public async Task AuditLog_PagesNewestFirst_WithCursor()
    {
        await SeedAudit(5);
        var handler = new GetWorkspaceAuditLogQueryHandler(_context);

        var first = await handler.Handle(new GetWorkspaceAuditLogQuery(Slug, Take: 2), CancellationToken.None);
        Assert.Equal(2, first!.Items.Count);
        Assert.True(first.Items[0].OccurredAt > first.Items[1].OccurredAt);
        Assert.NotNull(first.NextCursor);
        Assert.Equal("a", first.Items[0].Changes.GetProperty("field4").GetProperty("old").GetString());

        var second = await handler.Handle(new GetWorkspaceAuditLogQuery(Slug, Take: 2, Before: first.NextCursor), CancellationToken.None);
        Assert.Equal(2, second!.Items.Count);
        Assert.True(second.Items[0].OccurredAt < first.Items[1].OccurredAt);

        var last = await handler.Handle(new GetWorkspaceAuditLogQuery(Slug, Take: 2, Before: second.NextCursor), CancellationToken.None);
        Assert.Single(last!.Items);
        Assert.Null(last.NextCursor);
    }

    [Fact]
    public async Task AuditLog_FiltersBySection_AndIsolatesTenants()
    {
        await SeedAudit(2, "security");
        await SeedAudit(1, "branding");
        var other = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = other, TenantSlug = "other", Name = "Other", OwnerId = "x", Email = "o@o.ph" });
        _context.WorkspaceAuditEntries.Add(new WorkspaceAuditEntry { TenantId = other, Section = "security", Action = "updated", ActorName = "Z" });
        await _context.SaveChangesAsync();

        var handler = new GetWorkspaceAuditLogQueryHandler(_context);
        var security = await handler.Handle(new GetWorkspaceAuditLogQuery(Slug, Section: "Security"), CancellationToken.None);
        Assert.Equal(2, security!.Items.Count);
        Assert.All(security.Items, i => Assert.Equal("security", i.Section));

        var all = await handler.Handle(new GetWorkspaceAuditLogQuery(Slug), CancellationToken.None);
        Assert.Equal(3, all!.Items.Count);
        Assert.Null(await handler.Handle(new GetWorkspaceAuditLogQuery("nope"), CancellationToken.None));
    }

    [Fact]
    public async Task AuditLog_ClampsTake_AndSurvivesMalformedJson()
    {
        _context.WorkspaceAuditEntries.Add(new WorkspaceAuditEntry
        {
            TenantId = _tenantId, Section = "general", Action = "updated", ActorName = "Juan", ChangesJson = "{not json"
        });
        await _context.SaveChangesAsync();

        var page = await new GetWorkspaceAuditLogQueryHandler(_context)
            .Handle(new GetWorkspaceAuditLogQuery(Slug, Take: 100_000), CancellationToken.None);

        var item = Assert.Single(page!.Items);
        Assert.Equal(System.Text.Json.JsonValueKind.Object, item.Changes.ValueKind);
    }
}
