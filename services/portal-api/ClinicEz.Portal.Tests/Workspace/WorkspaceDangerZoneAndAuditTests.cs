using ClinicEz.Portal.Application.Features.Tenants.Queries.GetTenantByOwner;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;
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
            SubscriptionStatus = "TRIALING"
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private StaffMember SeedStaff(string userId, string name, string role = "Admin", string status = "Active")
    {
        var member = new StaffMember
        {
            TenantId = _tenantId,
            UserId = userId,
            Email = $"{userId}@metro.ph",
            FullName = name,
            Role = role,
            Status = status
        };
        _context.StaffMembers.Add(member);
        _context.SaveChanges();
        return member;
    }

    private Task<OwnershipTransferResultDto> Transfer(Guid targetId, string confirm = Slug, WorkspaceActor? actor = null) =>
        new TransferWorkspaceOwnershipCommandHandler(_context).Handle(
            new TransferWorkspaceOwnershipCommand(Slug, actor ?? OwnerActor, targetId, confirm), CancellationToken.None);

    private Task<ArchiveWorkspaceResultDto> Archive(string confirm = Slug, WorkspaceActor? actor = null) =>
        new ArchiveWorkspaceCommandHandler(_context).Handle(
            new ArchiveWorkspaceCommand(Slug, actor ?? OwnerActor, confirm), CancellationToken.None);

    // ---- Ownership transfer ----------------------------------------------------------------

    [Fact]
    public async Task Transfer_MakesAdminTheOwner_PreviousOwnerBecomesAdmin_AndAudits()
    {
        var oldOwnerRow = SeedStaff(OwnerId, "Juan Dela Cruz", "Owner");
        var target = SeedStaff("clerk_admin_222", "Maria Santos");

        var result = await Transfer(target.Id);

        Assert.Equal("Maria Santos", result.NewOwnerName);
        var tenant = await _context.Tenants.SingleAsync();
        Assert.Equal("clerk_admin_222", tenant.OwnerId);
        Assert.Equal("Owner", (await _context.StaffMembers.SingleAsync(s => s.Id == target.Id)).Role);
        Assert.Equal("Admin", (await _context.StaffMembers.SingleAsync(s => s.Id == oldOwnerRow.Id)).Role);

        var audit = await _context.WorkspaceAuditEntries.SingleAsync();
        Assert.Equal("ownership", audit.Section);
        Assert.Equal("transferred", audit.Action);
    }

    [Fact]
    public async Task Transfer_WhenOwnerHadNoStaffRow_CreatesAdminRowForThem()
    {
        var target = SeedStaff("clerk_admin_222", "Maria Santos");

        await Transfer(target.Id);

        var former = await _context.StaffMembers.SingleAsync(s => s.UserId == OwnerId);
        Assert.Equal("Admin", former.Role);
        Assert.Equal("Active", former.Status);
    }

    [Fact]
    public async Task Transfer_AfterwardsAccessResolvesWithSwappedRoles()
    {
        var target = SeedStaff("clerk_admin_222", "Maria Santos");
        await Transfer(target.Id);

        var access = new WorkspaceAccessService(_context);
        Assert.Equal(WorkspaceRole.Owner, (await access.ResolveAsync(Slug, "clerk_admin_222"))!.Role);
        Assert.Equal(WorkspaceRole.Admin, (await access.ResolveAsync(Slug, OwnerId))!.Role);
    }

    [Theory]
    [InlineData("Doctor", "Active", false)]
    [InlineData("Admin", "PendingInvitation", false)]
    [InlineData("Admin", "Suspended", false)]
    public async Task Transfer_RejectsIneligibleTargets(string role, string status, bool _)
    {
        var target = SeedStaff("clerk_x", "Someone", role, status);

        await Assert.ThrowsAsync<BadRequestException>(() => Transfer(target.Id));
        Assert.Equal(OwnerId, (await _context.Tenants.SingleAsync()).OwnerId);
    }

    [Fact]
    public async Task Transfer_RejectsInvitedMemberWithoutUserId()
    {
        var target = SeedStaff("placeholder", "Pending Pat");
        target.UserId = null;
        await _context.SaveChangesAsync();

        await Assert.ThrowsAsync<BadRequestException>(() => Transfer(target.Id));
    }

    [Fact]
    public async Task Transfer_RejectsOtherTenantsMember_AndNonOwnerCaller()
    {
        var target = SeedStaff("clerk_admin_222", "Maria Santos");

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            Transfer(target.Id, actor: new WorkspaceActor("clerk_admin_222", "Maria Santos", "Admin")));

        await Assert.ThrowsAsync<NotFoundException>(() => Transfer(Guid.NewGuid()));
    }

    [Fact]
    public void Transfer_Validator_RequiresSlugConfirmation()
    {
        var validator = new TransferWorkspaceOwnershipCommandValidator();
        Assert.False(validator.Validate(new TransferWorkspaceOwnershipCommand(Slug, OwnerActor, Guid.NewGuid(), "wrong")).IsValid);
        Assert.True(validator.Validate(new TransferWorkspaceOwnershipCommand(Slug, OwnerActor, Guid.NewGuid(), " METRO-CLINIC ")).IsValid);
        Assert.False(validator.Validate(new TransferWorkspaceOwnershipCommand(Slug, OwnerActor, Guid.Empty, Slug)).IsValid);
    }

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
        var tenant = await _context.Tenants.SingleAsync();
        tenant.SubscriptionStatus = "ACTIVE";
        await _context.SaveChangesAsync();
        await Assert.ThrowsAsync<ConflictException>(() => Archive());
        Assert.Null((await _context.Tenants.SingleAsync()).ArchivedAt);

        tenant.SubscriptionStatus = "CANCELLED";
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
        SeedStaff("clerk_admin_222", "Maria Santos");
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
