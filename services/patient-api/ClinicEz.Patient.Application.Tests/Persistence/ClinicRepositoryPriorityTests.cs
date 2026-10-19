using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Application.Tests.Persistence;

public sealed class ClinicRepositoryPriorityTests
{
    private static ApplicationDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task SearchAsync_PrioritizesRealClinicsWithTenantIdOverDemoClinics()
    {
        using var context = CreateInMemoryContext();
        var repo = new ClinicRepository(context);

        // Demo clinic with high featured score
        var demoClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "A Demo Clinic",
            TenantId = null,
            IsPublic = true,
            FeaturedScore = 9999
        };

        // Real clinic with lower featured score
        var realClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Z Real Clinic",
            TenantId = "tenant-real-1",
            IsPublic = true,
            FeaturedScore = 10
        };

        context.Clinics.AddRange(demoClinic, realClinic);
        await context.SaveChangesAsync();

        var results = await repo.SearchAsync(null, 0, 10);

        results.Should().HaveCount(2);
        // Real clinic must come first even though demoClinic has higher FeaturedScore
        results[0].Id.Should().Be(realClinic.Id);
        results[0].TenantId.Should().NotBeNull();
        results[1].Id.Should().Be(demoClinic.Id);
        results[1].TenantId.Should().BeNull();
    }

    [Fact]
    public async Task GetByOrganizationAsync_PrioritizesRealClinicsWithTenantId()
    {
        using var context = CreateInMemoryContext();
        var repo = new ClinicRepository(context);

        var orgId = Guid.NewGuid();
        var org = new Organization
        {
            Id = orgId,
            Name = "Metro Health Network",
            Slug = "metro-health",
            IsPublic = true
        };

        var demoClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Demo Linked Clinic",
            TenantId = null,
            IsPublic = true,
            FeaturedScore = 500
        };

        var realClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Real Linked Clinic",
            TenantId = "tenant-real-2",
            IsPublic = true,
            FeaturedScore = 100
        };

        var linkDemo = new ClinicOrganizationLink
        {
            Id = Guid.NewGuid(),
            ClinicId = demoClinic.Id,
            OrganizationId = orgId,
            IsActive = true
        };

        var linkReal = new ClinicOrganizationLink
        {
            Id = Guid.NewGuid(),
            ClinicId = realClinic.Id,
            OrganizationId = orgId,
            IsActive = true
        };

        context.Organizations.Add(org);
        context.Clinics.AddRange(demoClinic, realClinic);
        context.ClinicOrganizationLinks.AddRange(linkDemo, linkReal);
        await context.SaveChangesAsync();

        var results = await repo.GetByOrganizationAsync(orgId);

        results.Should().HaveCount(2);
        results[0].Id.Should().Be(realClinic.Id);
        results[0].TenantId.Should().NotBeNull();
        results[1].Id.Should().Be(demoClinic.Id);
        results[1].TenantId.Should().BeNull();
    }
}
