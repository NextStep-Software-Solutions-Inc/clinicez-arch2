using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Seeders;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Security;

public class SystemSettingsTests
{
    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task GetAllSettingsAsync_SeedsDefaultsOnFirstAccess()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        var settings = await service.GetAllSettingsAsync();

        Assert.NotEmpty(settings);
        Assert.Contains(settings, s => s.Key == "Licensing:TtlDays" && s.Value == "30");
        Assert.Contains(settings, s => s.Key == "Billing:TrialDays" && s.Value == "14");
        Assert.Contains(settings, s => s.Key == "Billing:BankAccountsJson" && s.Value.Contains("BDO Unibank"));
        Assert.Contains(settings, s => s.Key == "Billing:BirTaxExempt" && s.Value == "false");
        Assert.Contains(settings, s => s.Key == "Billing:BirTaxPercentage" && s.Value == "12");
        Assert.Contains(settings, s => s.Key == "Billing:CorporateName" && s.Value == "ClinicEZ Digital Health Inc.");
        Assert.Contains(settings, s => s.Key == "Billing:SupportEmail" && s.Value == "billing@clinicez.ph");
        Assert.Contains(settings, s => s.Key == "Workspace:MaxOwnedPerUser" && s.Value == "1");
        Assert.Contains(settings, s => s.Key == "JoinClaim:TtlHours" && s.Value == "48");
        Assert.Contains(settings, s => s.Key == "PatientApp:AppleAppStoreUrl" && s.Value.Contains("apple.com"));
        Assert.Contains(settings, s => s.Key == "PatientApp:GooglePlayStoreUrl" && s.Value.Contains("play.google.com"));
        Assert.Contains(settings, s => s.Key == "Contact:HeadquartersAddress" && s.Value.Contains("Cagayan de Oro"));
        Assert.Contains(settings, s => s.Key == "Contact:SupportEmail" && s.Value == "support@clinicez.com");
        Assert.Contains(settings, s => s.Key == "Contact:SalesEmail" && s.Value == "sales@clinicez.com");
        Assert.Contains(settings, s => s.Key == "Contact:PhoneNumber" && s.Value == "+63 (965) 429-7640");
        Assert.Contains(settings, s => s.Key == "Contact:OperatingHours" && s.Value.Contains("Mon - Fri"));
    }

    [Fact]
    public async Task GetContactPlatformConfigAsync_ReturnsDefaultsAndReflectsUpdates()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        var defaultConfig = await service.GetContactPlatformConfigAsync();
        Assert.Equal("support@clinicez.com", defaultConfig.SupportEmail);
        Assert.Equal("sales@clinicez.com", defaultConfig.SalesEmail);
        Assert.Equal("+63 (965) 429-7640", defaultConfig.PhoneNumber);
        Assert.Contains("Lapasan, Cagayan de Oro City", defaultConfig.HeadquartersAddress);

        await service.UpdateSettingsAsync(new Dictionary<string, string>
        {
            ["Contact:SupportEmail"] = "help@clinicez.ph",
            ["Contact:PhoneNumber"] = "+63 2 8123 4567"
        }, "AdminUser");

        var updatedConfig = await service.GetContactPlatformConfigAsync();
        Assert.Equal("help@clinicez.ph", updatedConfig.SupportEmail);
        Assert.Equal("+63 2 8123 4567", updatedConfig.PhoneNumber);
    }

    [Fact]
    public async Task GetSettingIntAsync_ReturnsParsedOrFallbackDefault()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        var ttl = await service.GetSettingIntAsync("Licensing:TtlDays", 30);
        var missing = await service.GetSettingIntAsync("Missing:Key", 99);

        Assert.Equal(30, ttl);
        Assert.Equal(99, missing);
    }

    [Fact]
    public async Task UpdateSettingsAsync_PersistsValueAndInvalidatesCache()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        // Warm up cache
        var initial = await service.GetAllSettingsAsync();
        Assert.Contains(initial, s => s.Key == "Billing:TrialDays" && s.Value == "14");

        // Update settings including N-bank accounts and BIR tax settings
        var customBanksJson = "[{\"id\":\"bank-1\",\"institution\":\"BPI\",\"accountName\":\"NextStep Software Inc.\",\"accountNumber\":\"1111-2222-33\",\"copyValue\":\"1111-2222-33\",\"branch\":\"Makati\",\"type\":\"bank\",\"badge\":\"Commercial Bank\",\"isActive\":true},{\"id\":\"bank-2\",\"institution\":\"Metrobank\",\"accountName\":\"NextStep Software Inc.\",\"accountNumber\":\"4444-5555-66\",\"copyValue\":\"4444-5555-66\",\"branch\":\"BGC\",\"type\":\"bank\",\"badge\":\"Commercial Bank\",\"isActive\":true}]";
        var updates = new Dictionary<string, string>
        {
            ["Billing:TrialDays"] = "30",
            ["Licensing:GraceDays"] = "21",
            ["Billing:BankAccountsJson"] = customBanksJson,
            ["Billing:BirTaxExempt"] = "true",
            ["Billing:BirTaxPercentage"] = "12"
        };
        await service.UpdateSettingsAsync(updates, "AdminUser");

        // Read again
        var updated = await service.GetAllSettingsAsync();
        Assert.Contains(updated, s => s.Key == "Billing:TrialDays" && s.Value == "30" && s.UpdatedBy == "AdminUser");
        Assert.Contains(updated, s => s.Key == "Licensing:GraceDays" && s.Value == "21" && s.UpdatedBy == "AdminUser");
        Assert.Contains(updated, s => s.Key == "Billing:BankAccountsJson" && s.Value == customBanksJson);
        Assert.Contains(updated, s => s.Key == "Billing:BirTaxExempt" && s.Value == "true");
        Assert.Contains(updated, s => s.Key == "Billing:BirTaxPercentage" && s.Value == "12");
    }

    [Fact]
    public async Task AdminRBACSeeder_BootstrapsDefaultSuperAdminEmailAsActive()
    {
        using var db = CreateDbContext();
        var seeder = new AdminRBACSeeder(db);

        await seeder.SeedAsync();

        var superAdminRole = await db.AdminRoles
            .FirstOrDefaultAsync(r => r.Name == "Super Admin");
        Assert.NotNull(superAdminRole);
        Assert.NotEmpty(superAdminRole!.Permissions);

        var bootstrapUser = await db.AdminUsers
            .FirstOrDefaultAsync(u => u.Email == AdminRBACSeeder.BootstrapSuperAdminEmail);
        Assert.NotNull(bootstrapUser);
        Assert.True(bootstrapUser!.IsActive);
        Assert.Equal(superAdminRole.Id, bootstrapUser.RoleId);
    }

    [Fact]
    public async Task PublicDirectoryEndpoints_ReturnsRealClinicsOrganizationsAndProviders()
    {
        using var db = CreateDbContext();
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "st-lukes-network",
            Name = "St. Luke's Primary Care Network",
            OwnerId = "owner-1",
            Email = "info@stlukes.example.ph",
            City = "Taguig City",
            Province = "Metro Manila"
        };
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Name = "BGC Main Branch",
            City = "Taguig City",
            Province = "Metro Manila",
            IsPhilHealthAccredited = true
        };
        var clinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            BranchId = branch.Id,
            Slug = "bgc-family-clinic",
            Name = "BGC Family & Primary Care Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            City = "Taguig City",
            Province = "Metro Manila",
            Classification = "Primary Care & YAKAP Clinic",
            PhilHealthAccreditationNumber = "P123456789"
        };
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Email = "dr.santos@stlukes.example.ph",
            FullName = "Dr. Maria Santos, MD",
            Status = MemberStatus.Active
        };
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            WorkspaceMemberId = member.Id,
            FacilityId = clinic.Id,
            Role = "Family Medicine Physician"
        };

        db.Tenants.Add(tenant);
        db.Branches.Add(branch);
        db.Facilities.Add(clinic);
        db.WorkspaceMembers.Add(member);
        db.StaffMembers.Add(staff);
        await db.SaveChangesAsync();

        var clinicsResult = await PublicDirectoryEndpoints.GetClinicsAsync(db, q: "BGC", city: null);
        var clinicsResponse = Assert.IsAssignableFrom<IValueHttpResult>(clinicsResult);
        var clinicsPayload = Assert.IsType<ApiResponse<List<PublicDirectoryClinicDto>>>(clinicsResponse.Value);
        Assert.Single(clinicsPayload.Data!);
        Assert.Equal("BGC Family & Primary Care Clinic", clinicsPayload.Data![0].Name);
        Assert.True(clinicsPayload.Data![0].IsPhilHealthAccredited);

        var orgsResult = await PublicDirectoryEndpoints.GetOrganizationsAsync(db, q: null, city: null);
        var orgsResponse = Assert.IsAssignableFrom<IValueHttpResult>(orgsResult);
        var orgsPayload = Assert.IsType<ApiResponse<List<PublicDirectoryOrganizationDto>>>(orgsResponse.Value);
        Assert.Single(orgsPayload.Data!);
        Assert.Equal("St. Luke's Primary Care Network", orgsPayload.Data![0].Name);

        var providersResult = await PublicDirectoryEndpoints.GetProvidersAsync(db, q: "Santos", facilitySlug: null);
        var providersResponse = Assert.IsAssignableFrom<IValueHttpResult>(providersResult);
        var providersPayload = Assert.IsType<ApiResponse<List<PublicDirectoryProviderDto>>>(providersResponse.Value);
        Assert.Single(providersPayload.Data!);
        Assert.Contains("Maria Santos", providersPayload.Data![0].Name);
        Assert.Contains("Family Medicine Physician", providersPayload.Data![0].Specialty);
    }
}

