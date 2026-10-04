using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using Xunit;

namespace ClinicEz.Portal.Tests.Branches;

public class BranchManagementTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "health-first";

    public BranchManagementTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);

        var tenant = new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "HealthFirst Medical Network",
            OwnerId = "owner_healthfirst",
            FacilitiesCount = 3
        };
        _context.Tenants.Add(tenant);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task CreateBranch_AndAttachFacilities_LinksClinicLabPharmacyUnderOneRoof()
    {
        // 1. Create a Branch (Downtown Campus)
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Downtown Medical Hub",
            Code = "DWTN-01",
            StreetAddress = "123 Mabini St",
            Barangay = "Poblacion",
            City = "Makati",
            Province = "Metro Manila",
            ZipCode = "1200",
            ContactNumber = "+63 2 8123 4567",
            IsActive = true,
            PhilHealthAccreditationNumber = "H91001234",
            PhilHealthPmccNumber = "Z15445",
            PhilHealthSoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
            IsPhilHealthAccredited = true
        };
        _context.Branches.Add(branch);

        // 2. Create 3 facilities under the same branch (Clinic, Lab, Pharmacy)
        var clinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            BranchId = branch.Id,
            Name = "Downtown OPD Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };
        var lab = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            BranchId = branch.Id,
            Name = "Downtown Diagnostic Laboratory",
            FacilityType = FacilityType.Laboratory,
            Status = FacilityStatus.Active
        };
        var pharmacy = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            BranchId = branch.Id,
            Name = "Downtown Botika",
            FacilityType = FacilityType.Pharmacy,
            Status = FacilityStatus.Active
        };

        _context.Facilities.AddRange(clinic, lab, pharmacy);
        await _context.SaveChangesAsync();

        // 3. Query branch with facilities
        var loadedBranch = await _context.Branches
            .Include(b => b.Facilities)
            .FirstOrDefaultAsync(b => b.Id == branch.Id);

        Assert.NotNull(loadedBranch);
        Assert.Equal("Downtown Medical Hub", loadedBranch!.Name);
        Assert.Equal("Z15445", loadedBranch.PhilHealthPmccNumber);
        Assert.True(loadedBranch.IsPhilHealthAccredited);
        Assert.Equal(3, loadedBranch.Facilities.Count);

        var facilityTypes = loadedBranch.Facilities.Select(f => f.FacilityType).ToList();
        Assert.Contains(FacilityType.Clinic, facilityTypes);
        Assert.Contains(FacilityType.Laboratory, facilityTypes);
        Assert.Contains(FacilityType.Pharmacy, facilityTypes);
    }

    [Fact]
    public async Task BranchPhilHealthCredentials_CanBeEncryptedAndDecrypted()
    {
        var dataProtection = new EphemeralDataProtectionProvider();
        var protector = dataProtection.CreateProtector("ClinicEz.Portal.PhilHealthCredentials");

        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Uptown Care",
            Code = "UPTN-01",
            PhilHealthAccreditationNumber = "H92005678",
            PhilHealthPmccNumber = "Z1002",
            PhilHealthSoftwareCertificateId = "KON-UPTOWN-Z1002",
            PhilHealthEncryptedUsername = protector.Protect("ph_user_123"),
            PhilHealthEncryptedPassword = protector.Protect("SuperSecretP@ss"),
            PhilHealthEncryptedCipherKey = protector.Protect("32-BYTE-ENCRYPTION-CIPHER-KEY!"),
            IsPhilHealthAccredited = true
        };

        _context.Branches.Add(branch);
        await _context.SaveChangesAsync();

        var loaded = await _context.Branches.FindAsync(branch.Id);
        Assert.NotNull(loaded);

        Assert.Equal("ph_user_123", protector.Unprotect(loaded!.PhilHealthEncryptedUsername!));
        Assert.Equal("SuperSecretP@ss", protector.Unprotect(loaded.PhilHealthEncryptedPassword!));
        Assert.Equal("32-BYTE-ENCRYPTION-CIPHER-KEY!", protector.Unprotect(loaded.PhilHealthEncryptedCipherKey!));
    }
}
