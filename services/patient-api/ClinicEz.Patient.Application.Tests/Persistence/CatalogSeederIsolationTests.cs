using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Application.Tests.Persistence;

public sealed class CatalogSeederIsolationTests
{
    private static ApplicationDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public void Seed_WhenNoDemoClinicsExist_SeedsDemoClinicsWithNullTenantId()
    {
        using var context = CreateInMemoryContext();
        var seeder = new CatalogSeeder();

        seeder.Seed(context);

        var clinics = context.Clinics.ToList();
        clinics.Should().HaveCount(100);
        clinics.Should().OnlyContain(c => c.TenantId == null, "all demo catalog clinics must have TenantId = null");
    }

    [Fact]
    public void Seed_WhenDemoClinicsAlreadyExist_ShortCircuitsWithoutDuplicates()
    {
        using var context = CreateInMemoryContext();
        var seeder = new CatalogSeeder();

        seeder.Seed(context);
        var countAfterFirstSeed = context.Clinics.Count();
        countAfterFirstSeed.Should().Be(100);

        // Second run should hit the `if (context.Clinics.Any(c => c.TenantId == null)) return;` guard
        seeder.Seed(context);
        context.Clinics.Count().Should().Be(countAfterFirstSeed);
    }

    [Fact]
    public void Seed_PreservesRealSyncedClinicsWithTenantId()
    {
        using var context = CreateInMemoryContext();
        var seeder = new CatalogSeeder();

        var realClinicId = Guid.NewGuid();
        var realProviderId = Guid.NewGuid();
        var realServiceId = Guid.NewGuid();

        // Simulate a clinic already synced via Interop from portal/clinic plane
        var realClinic = new Clinic
        {
            Id = realClinicId,
            Name = "Real St. Luke's Medical Clinic",
            TenantId = "tenant-ph-001",
            IsPublic = true,
            SupportsAppointments = true,
            HealthcareProviders =
            [
                new ClinicHealthcareProvider
                {
                    Id = realProviderId,
                    ClinicId = realClinicId,
                    Name = "Dr. Real Physician",
                    Specialty = "Cardiology"
                }
            ],
            Services =
            [
                new ClinicService
                {
                    Id = realServiceId,
                    ClinicId = realClinicId,
                    Name = "Cardiology Consult",
                    Price = 1200m
                }
            ]
        };

        context.Clinics.Add(realClinic);
        context.SaveChanges();

        // Run seeder
        seeder.Seed(context);

        // Verify the real clinic with TenantId is intact and NOT wiped
        var foundRealClinic = context.Clinics
            .Include(c => c.HealthcareProviders)
            .Include(c => c.Services)
            .FirstOrDefault(c => c.Id == realClinicId);

        foundRealClinic.Should().NotBeNull();
        foundRealClinic!.Name.Should().Be("Real St. Luke's Medical Clinic");
        foundRealClinic.TenantId.Should().Be("tenant-ph-001");
        foundRealClinic.HealthcareProviders.Should().ContainSingle(p => p.Id == realProviderId);
        foundRealClinic.Services.Should().ContainSingle(s => s.Id == realServiceId);

        // Demo clinics are seeded alongside
        context.Clinics.Count(c => c.TenantId == null).Should().Be(100);
        context.Clinics.Count(c => c.TenantId != null).Should().Be(1);
    }
}
