using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Branches;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Branches;

public class BranchFacilityRulesTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant = new() { Id = Guid.NewGuid(), TenantSlug = "metro", Name = "Metro", OwnerId = "owner", Email = "o@metro.ph" };
    private readonly Tenant _other = new() { Id = Guid.NewGuid(), TenantSlug = "other", Name = "Other", OwnerId = "owner2", Email = "o@other.ph" };
    private readonly Branch _branch;

    public BranchFacilityRulesTests()
    {
        _branch = new Branch { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Main" };
        _context.Tenants.AddRange(_tenant, _other);
        _context.Branches.Add(_branch);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private async Task<Facility> AddFacilityAsync(FacilityType type, Guid? branchId = null, Tenant? tenant = null)
    {
        var facility = new Facility { Id = Guid.NewGuid(), TenantId = (tenant ?? _tenant).Id, Name = type.ToString(), FacilityType = type, BranchId = branchId };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();
        return facility;
    }

    private Task EnsureAsync(params Facility[] toLink) =>
        BranchFacilityRules.EnsureCanLinkAsync(_context, _branch, toLink, CancellationToken.None);

    [Fact]
    public async Task OneFacilityOfEachTypeCanShareABranch()
    {
        var clinic = await AddFacilityAsync(FacilityType.Clinic);
        var lab = await AddFacilityAsync(FacilityType.Laboratory);
        var pharmacy = await AddFacilityAsync(FacilityType.Pharmacy);
        var organization = await AddFacilityAsync(FacilityType.Organization);

        await EnsureAsync(clinic, lab, pharmacy, organization);
    }

    [Fact]
    public async Task ASecondFacilityOfTheSameTypeAlreadyOnTheBranch_IsAConflict()
    {
        await AddFacilityAsync(FacilityType.Clinic, _branch.Id);
        var second = await AddFacilityAsync(FacilityType.Clinic);

        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => EnsureAsync(second));

        Assert.Equal(ConflictCodes.BranchFacilityTypeTaken, ex.Code);
    }

    [Fact]
    public async Task TwoFacilitiesOfTheSameTypeLinkedTogether_AreAConflict()
    {
        var first = await AddFacilityAsync(FacilityType.Laboratory);
        var second = await AddFacilityAsync(FacilityType.Laboratory);

        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => EnsureAsync(first, second));

        Assert.Equal(ConflictCodes.BranchFacilityTypeTaken, ex.Code);
    }

    [Fact]
    public async Task RelinkingAFacilityThatIsAlreadyOnTheBranch_IsNotACollisionWithItself()
    {
        var clinic = await AddFacilityAsync(FacilityType.Clinic, _branch.Id);

        await EnsureAsync(clinic);
    }

    [Fact]
    public async Task AFacilityOfAnotherWorkspace_IsForbidden()
    {
        var foreign = await AddFacilityAsync(FacilityType.Clinic, tenant: _other);

        await Assert.ThrowsAsync<ForbiddenException>(() => EnsureAsync(foreign));
    }

    [Fact]
    public async Task CreateFacility_IntoABranchThatHasThatType_IsAConflict_ButAnotherTypeIsFine()
    {
        await AddFacilityAsync(FacilityType.Clinic, _branch.Id);
        await TestSupport.SeedSubscriptionAsync(_context, _tenant.Id, planSlug: "pro");
        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);

        var ex = await Assert.ThrowsAsync<CodedConflictException>(() =>
            handler.Handle(new CreateFacilityCommand(_tenant.Id.ToString(), FacilityType.Clinic, "Second Clinic", BranchId: _branch.Id), CancellationToken.None));
        var lab = await handler.Handle(new CreateFacilityCommand(_tenant.Id.ToString(), FacilityType.Laboratory, "Branch Lab", BranchId: _branch.Id), CancellationToken.None);

        Assert.Equal(ConflictCodes.BranchFacilityTypeTaken, ex.Code);
        Assert.True(lab.Success);
        Assert.Equal(2, await _context.Facilities.CountAsync(f => f.BranchId == _branch.Id));
    }

    [Fact]
    public async Task CreateFacility_IntoABranchOfAnotherWorkspace_IsRejected()
    {
        var foreignBranch = new Branch { Id = Guid.NewGuid(), TenantId = _other.Id, Name = "Foreign" };
        _context.Branches.Add(foreignBranch);
        await _context.SaveChangesAsync();
        await TestSupport.SeedSubscriptionAsync(_context, _tenant.Id, planSlug: "pro");
        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new CreateFacilityCommand(_tenant.Id.ToString(), FacilityType.Clinic, "Sneaky", BranchId: foreignBranch.Id), CancellationToken.None));
    }

    [Fact]
    public async Task CreateFacility_InheritsAddressAndPhilHealthFromBranch_WhenNotProvided()
    {
        var branchWithDetails = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "BGC Branch",
            StreetAddress = "26th Street",
            Barangay = "Fort Bonifacio",
            City = "Taguig",
            Province = "Metro Manila",
            Region = "NCR",
            ZipCode = "1634",
            ContactNumber = "+63 917 111 2233",
            ContactEmail = "bgc@metro.ph",
            PhilHealthAccreditationNumber = "PHIC-BGC-001"
        };
        _context.Branches.Add(branchWithDetails);
        await _context.SaveChangesAsync();
        await TestSupport.SeedSubscriptionAsync(_context, _tenant.Id, planSlug: "pro");
        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);

        var result = await handler.Handle(new CreateFacilityCommand(
            _tenant.Id.ToString(),
            FacilityType.Clinic,
            "BGC Main Clinic",
            BranchId: branchWithDetails.Id
        ), CancellationToken.None);

        Assert.True(result.Success);
        var created = await _context.Facilities.SingleAsync(f => f.Name == "BGC Main Clinic");
        Assert.Equal(branchWithDetails.Id, created.BranchId);
        Assert.Equal("26th Street", created.StreetAddress);
        Assert.Equal("Fort Bonifacio", created.Barangay);
        Assert.Equal("Taguig", created.City);
        Assert.Equal("Metro Manila", created.Province);
        Assert.Equal("NCR", created.Region);
        Assert.Equal("1634", created.ZipCode);
        Assert.Equal("+63 917 111 2233", created.ContactNumber);
        Assert.Equal("bgc@metro.ph", created.ContactEmail);
        Assert.Equal("PHIC-BGC-001", created.PhilHealthAccreditationNumber);
    }

    [Fact]
    public async Task CreateFacility_WithDeletedBranch_ThrowsException()
    {
        var deletedBranch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Defunct Branch",
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        _context.Branches.Add(deletedBranch);
        await _context.SaveChangesAsync();
        await TestSupport.SeedSubscriptionAsync(_context, _tenant.Id, planSlug: "pro");
        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new CreateFacilityCommand(
                _tenant.Id.ToString(),
                FacilityType.Clinic,
                "Ghost Clinic",
                BranchId: deletedBranch.Id
            ), CancellationToken.None));
    }

    [Fact]
    public async Task EnsureCanLinkAsync_AllowsSameType_WhenPreviousFacilityIsDeleted()
    {
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "Active Branch"
        };
        _context.Branches.Add(branch);

        var deletedClinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            BranchId = branch.Id,
            Name = "Old Clinic",
            FacilityType = FacilityType.Clinic,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(deletedClinic);
        await _context.SaveChangesAsync();

        var newClinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Name = "New Replacement Clinic",
            FacilityType = FacilityType.Clinic
        };

        // Should not throw since the previous clinic is deleted
        await BranchFacilityRules.EnsureCanLinkAsync(_context, branch, new[] { newClinic }, CancellationToken.None);
    }
}

