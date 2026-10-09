using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Workspace;

public class WorkspaceSettingsTests : IDisposable
{
    private const string Slug = "metro-clinic";
    private const string OwnerId = "clerk_owner_111";
    private static readonly WorkspaceActor Actor = new(OwnerId, "Juan Dela Cruz", "Owner");

    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();

    public WorkspaceSettingsTests()
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
            PhoneNumber = "+639170000000",
            FirstName = "Juan",
            LastName = "Dela Cruz"
        });

        void AddStaff(string userId, string role, string status) => _context.StaffMembers.Add(new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            UserId = userId,
            Email = $"{userId}@metro.ph",
            FullName = userId,
            Role = role,
            Status = status
        });

        AddStaff("clerk_admin", "Admin", "Active");
        AddStaff("clerk_biller", "Biller", "Active");
        AddStaff("clerk_pending_admin", "Admin", "Pending");
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private UpdateWorkspaceGeneralCommand Command(
        string name = "Metro Super Clinic",
        string? representative = "Maria Santos",
        string email = "maria@metro.ph",
        string? phone = "+63 918 999 9999",
        string timeZone = "Asia/Manila",
        string locale = "en-PH",
        string dateFormat = "dd/MM/yyyy",
        string currency = "PHP") =>
        new(Slug, Actor, name, representative, email, phone, timeZone, locale, dateFormat, currency);

    // ---------- GET ----------

    [Fact]
    public async Task Get_WithoutStoredRow_ReturnsDefaults_AndDoesNotPersist()
    {
        var handler = new GetWorkspaceSettingsQueryHandler(_context);

        var dto = await handler.Handle(new GetWorkspaceSettingsQuery(Slug), CancellationToken.None);

        Assert.NotNull(dto);
        Assert.Equal("Metro Clinic", dto.General.Name);
        Assert.Equal("Juan Dela Cruz", dto.General.RepresentativeName);
        Assert.Equal("owner@metro.ph", dto.General.Email);
        Assert.Equal("Asia/Manila", dto.General.TimeZoneId);
        Assert.Equal("en-PH", dto.General.Locale);
        Assert.Equal("PHP", dto.General.CurrencyCode);
        Assert.Empty(_context.WorkspaceSettings);
    }

    [Fact]
    public async Task Get_UnknownWorkspace_ReturnsNull()
    {
        var handler = new GetWorkspaceSettingsQueryHandler(_context);
        Assert.Null(await handler.Handle(new GetWorkspaceSettingsQuery("nope"), CancellationToken.None));
    }

    // ---------- PUT general ----------

    [Fact]
    public async Task UpdateGeneral_PersistsTenantAndLocaleDefaults()
    {
        var handler = new UpdateWorkspaceGeneralCommandHandler(_context);

        var result = await handler.Handle(Command(timeZone: "Asia/Singapore", locale: "en-US", currency: "USD"), CancellationToken.None);

        Assert.Equal("Metro Super Clinic", result.Name);
        Assert.Equal("Maria Santos", result.RepresentativeName);
        Assert.Equal("Asia/Singapore", result.TimeZoneId);

        var tenant = await _context.Tenants.SingleAsync(t => t.Id == _tenantId);
        Assert.Equal("Metro Super Clinic", tenant.Name);
        Assert.Equal("Maria", tenant.FirstName);
        Assert.Equal("Santos", tenant.LastName);
        Assert.Equal("maria@metro.ph", tenant.Email);
        Assert.Equal("+63 918 999 9999", tenant.PhoneNumber);

        var settings = await _context.WorkspaceSettings.SingleAsync(s => s.TenantId == _tenantId);
        Assert.Equal("Asia/Singapore", settings.TimeZoneId);
        Assert.Equal("en-US", settings.Locale);
        Assert.Equal("dd/MM/yyyy", settings.DateFormat);
        Assert.Equal("USD", settings.CurrencyCode);

        // Round trip through the query proves timezone is really stored (it used to be echoed back, never saved).
        var reread = await new GetWorkspaceSettingsQueryHandler(_context)
            .Handle(new GetWorkspaceSettingsQuery(Slug), CancellationToken.None);
        Assert.Equal("Asia/Singapore", reread!.General.TimeZoneId);
    }

    [Fact]
    public async Task UpdateGeneral_BlankOptionalValues_AreCleared_NotIgnored()
    {
        var handler = new UpdateWorkspaceGeneralCommandHandler(_context);

        await handler.Handle(Command(representative: "  ", phone: null), CancellationToken.None);

        var tenant = await _context.Tenants.SingleAsync(t => t.Id == _tenantId);
        Assert.Equal(string.Empty, tenant.FirstName);
        Assert.Equal(string.Empty, tenant.LastName);
        Assert.Null(tenant.PhoneNumber);
    }

    [Fact]
    public async Task UpdateGeneral_WritesAuditEntryWithOnlyChangedFields()
    {
        var handler = new UpdateWorkspaceGeneralCommandHandler(_context);

        await handler.Handle(Command(name: "Metro Super Clinic"), CancellationToken.None);

        var entry = await _context.WorkspaceAuditEntries.SingleAsync();
        Assert.Equal(_tenantId, entry.TenantId);
        Assert.Equal("general", entry.Section);
        Assert.Equal("updated", entry.Action);
        Assert.Equal(OwnerId, entry.ActorUserId);
        Assert.Equal("Owner", entry.ActorRole);

        using var json = JsonDocument.Parse(entry.ChangesJson);
        var root = json.RootElement;
        Assert.Equal("Metro Clinic", root.GetProperty("name").GetProperty("old").GetString());
        Assert.Equal("Metro Super Clinic", root.GetProperty("name").GetProperty("new").GetString());
        Assert.Equal("dd/MM/yyyy", root.GetProperty("dateFormat").GetProperty("new").GetString());
        // untouched fields must not appear
        Assert.False(root.TryGetProperty("currencyCode", out _));
        Assert.False(root.TryGetProperty("timeZoneId", out _));
    }

    [Fact]
    public async Task UpdateGeneral_NoEffectiveChange_WritesNoAuditEntry()
    {
        var handler = new UpdateWorkspaceGeneralCommandHandler(_context);

        await handler.Handle(Command(
            name: "Metro Clinic",
            representative: "Juan Dela Cruz",
            email: "owner@metro.ph",
            phone: "+639170000000",
            dateFormat: "MMM d, yyyy"), CancellationToken.None);

        Assert.Empty(_context.WorkspaceAuditEntries);
    }

    [Fact]
    public async Task UpdateGeneral_UnknownWorkspace_Throws()
    {
        var handler = new UpdateWorkspaceGeneralCommandHandler(_context);
        await Assert.ThrowsAsync<System.Collections.Generic.KeyNotFoundException>(() =>
            handler.Handle(Command() with { TenantSlug = "nope" }, CancellationToken.None));
    }

    // ---------- Validation ----------

    [Theory]
    [InlineData("", "owner@metro.ph", "Asia/Manila", "en-PH", "MMM d, yyyy", "PHP")]      // name
    [InlineData("M", "owner@metro.ph", "Asia/Manila", "en-PH", "MMM d, yyyy", "PHP")]     // name too short
    [InlineData("Metro", "not-an-email", "Asia/Manila", "en-PH", "MMM d, yyyy", "PHP")]   // email
    [InlineData("Metro", "owner@metro.ph", "UTC+08:00 Manila, Singapore", "en-PH", "MMM d, yyyy", "PHP")] // legacy fake tz
    [InlineData("Metro", "owner@metro.ph", "Mars/Olympus", "en-PH", "MMM d, yyyy", "PHP")] // unknown tz
    [InlineData("Metro", "owner@metro.ph", "Asia/Manila", "english", "MMM d, yyyy", "PHP")] // locale
    [InlineData("Metro", "owner@metro.ph", "Asia/Manila", "en-PH", "yyyy.MM.dd", "PHP")]    // date format
    [InlineData("Metro", "owner@metro.ph", "Asia/Manila", "en-PH", "MMM d, yyyy", "peso")]  // currency
    public void Validator_RejectsInvalidInput(string name, string email, string tz, string locale, string dateFormat, string currency)
    {
        var validator = new UpdateWorkspaceGeneralCommandValidator();
        var result = validator.Validate(Command(name: name, email: email, timeZone: tz, locale: locale, dateFormat: dateFormat, currency: currency));
        Assert.False(result.IsValid);
    }

    [Fact]
    public void Validator_AcceptsValidInput()
    {
        var result = new UpdateWorkspaceGeneralCommandValidator().Validate(Command());
        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => e.ErrorMessage)));
    }

    // ---------- Access ----------

    [Theory]
    [InlineData(OwnerId, WorkspaceRole.Owner)]
    [InlineData("clerk_admin", WorkspaceRole.Admin)]
    [InlineData("clerk_biller", WorkspaceRole.Staff)]
    [InlineData("clerk_pending_admin", WorkspaceRole.None)]
    [InlineData("clerk_stranger", WorkspaceRole.None)]
    public async Task Access_ResolvesRole(string userId, WorkspaceRole expected)
    {
        var service = new WorkspaceAccessService(_context);

        var access = await service.ResolveAsync(Slug, userId);

        Assert.NotNull(access);
        Assert.Equal(expected, access.Role);
    }

    [Fact]
    public async Task Access_ResolvesBySlugCaseInsensitivelyAndById_AndNullForUnknown()
    {
        var service = new WorkspaceAccessService(_context);

        Assert.NotNull(await service.ResolveAsync("METRO-CLINIC", OwnerId));
        Assert.NotNull(await service.ResolveAsync(_tenantId.ToString(), OwnerId));
        Assert.Null(await service.ResolveAsync("nope", OwnerId));
    }

    [Fact]
    public async Task Access_HasAtLeast_OrdersPrivileges()
    {
        var service = new WorkspaceAccessService(_context);

        var admin = (await service.ResolveAsync(Slug, "clerk_admin"))!;
        var staff = (await service.ResolveAsync(Slug, "clerk_biller"))!;

        Assert.True(admin.HasAtLeast(WorkspaceRole.Admin));
        Assert.False(admin.HasAtLeast(WorkspaceRole.Owner));
        Assert.False(staff.HasAtLeast(WorkspaceRole.Admin));
    }

    // ---------- Removal guard ----------

    [Fact]
    public void FacilityContracts_DoNotExposeLetterheadLogoOrStamp()
    {
        // Facility letterhead is owned by each facility service; the portal copy was removed.
        var contracts = new[] { typeof(Facility), typeof(FacilityDto) };
        var banned = new[] { "Letterhead", "LogoUrl", "Stamp" };

        foreach (var type in contracts)
        {
            var offending = type.GetProperties()
                .Select(p => p.Name)
                .Where(n => banned.Any(b => n.Contains(b, StringComparison.OrdinalIgnoreCase)))
                .ToList();
            Assert.True(offending.Count == 0, $"{type.Name} still exposes: {string.Join(", ", offending)}");
        }
    }
}
